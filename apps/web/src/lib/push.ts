import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import type { RegisterPushDeviceInput } from "@task-tracker/shared";
import { ApiError } from "./api";
import { configFromEnv, type PushWebConfig } from "./firebase";

export interface PushApi {
  register: (input: RegisterPushDeviceInput) => Promise<void>;
  getWebConfig: () => Promise<PushWebConfig | null>;
  /** Legacy Web Push fallback when Firebase is not configured. */
  getVapidPublicKey?: () => Promise<string | null>;
}

export type PushEnableResult =
  | { ok: true }
  | { ok: false; reason: string };

export async function enablePush(api: PushApi): Promise<PushEnableResult> {
  try {
    const ok = Capacitor.isNativePlatform()
      ? await enableNativePush(api)
      : await enableWebPush(api);
    return ok.ok ? { ok: true } : ok;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected error enabling push";
    return { ok: false, reason: message };
  }
}

async function enableNativePush(api: PushApi): Promise<PushEnableResult> {
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") {
    return { ok: false, reason: "Notification permission was denied." };
  }

  return new Promise<PushEnableResult>((resolve) => {
    void PushNotifications.addListener("registration", async ({ value }) => {
      try {
        await api.register({
          platform: Capacitor.getPlatform() === "ios" ? "IOS" : "ANDROID",
          token: value,
        });
        resolve({ ok: true });
      } catch (err) {
        resolve({
          ok: false,
          reason: formatPushError(err),
        });
      }
    });
    void PushNotifications.addListener("registrationError", (err) => {
      resolve({
        ok: false,
        reason: err.error ?? "Native push registration failed.",
      });
    });
    void PushNotifications.register();
  });
}

async function enableWebPush(api: PushApi): Promise<PushEnableResult> {
  const webConfig = (await api.getWebConfig()) ?? configFromEnv();
  if (webConfig?.configured) {
    return enableFcmWebPush(api, webConfig);
  }
  return enableLegacyWebPush(api);
}

async function enableFcmWebPush(
  api: PushApi,
  webConfig: PushWebConfig,
): Promise<PushEnableResult> {
  if (!("serviceWorker" in navigator) || !("Notification" in window)) {
    return {
      ok: false,
      reason: "This browser does not support push notifications.",
    };
  }

  const permission = await Notification.requestPermission();
  if (permission === "denied") {
    return {
      ok: false,
      reason:
        "Notifications are blocked. Enable them in your browser settings for this site.",
    };
  }
  if (permission !== "granted") {
    return { ok: false, reason: "Notification permission was not granted." };
  }

  const { initializeApp, getApps } = await import("firebase/app");
  const { getMessaging, getToken, isSupported } = await import(
    "firebase/messaging"
  );

  if (!(await isSupported())) {
    return {
      ok: false,
      reason: "Firebase Cloud Messaging is not supported in this browser.",
    };
  }

  const registration = await navigator.serviceWorker.register(
    "/firebase-messaging-sw.js",
  );
  await navigator.serviceWorker.ready;
  await initFirebaseServiceWorker(registration, webConfig.firebase);

  const app =
    getApps().length > 0 ? getApps()[0]! : initializeApp(webConfig.firebase);

  const messaging = getMessaging(app);
  let token: string;
  try {
    token = await getToken(messaging, {
      vapidKey: webConfig.vapidKey,
      serviceWorkerRegistration: registration,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("vapid") || message.includes("VAPID")) {
      return {
        ok: false,
        reason:
          "Invalid VAPID key. Ensure FIREBASE_WEB_VAPID_KEY on the API matches Firebase Console → Cloud Messaging → Web Push certificates.",
      };
    }
    return { ok: false, reason: `Could not get FCM token: ${message}` };
  }

  if (!token) {
    return { ok: false, reason: "FCM did not return a registration token." };
  }

  try {
    await api.register({ platform: "WEB", token });
  } catch (err) {
    return { ok: false, reason: formatPushError(err) };
  }

  return { ok: true };
}

function initFirebaseServiceWorker(
  registration: ServiceWorkerRegistration,
  config: PushWebConfig["firebase"],
): Promise<void> {
  return new Promise((resolve, reject) => {
    void (async () => {
      const worker = await waitForActiveWorker(registration);
      if (!worker) {
        reject(new Error("Service worker is not active."));
        return;
      }

      const channel = new MessageChannel();
      const timeout = window.setTimeout(() => {
        reject(new Error("Service worker did not respond in time."));
      }, 10_000);

      channel.port1.onmessage = (event) => {
        window.clearTimeout(timeout);
        if (event.data?.ok) resolve();
        else reject(new Error("Service worker failed to initialize Firebase."));
      };

      worker.postMessage({ type: "INIT_FIREBASE", config }, [channel.port2]);
    })();
  });
}

async function waitForActiveWorker(
  registration: ServiceWorkerRegistration,
): Promise<ServiceWorker | null> {
  if (registration.active) return registration.active;

  const worker = registration.installing ?? registration.waiting;
  if (!worker) return null;

  if (worker.state === "activated") return registration.active;

  await new Promise<void>((resolve) => {
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") resolve();
    });
  });

  return registration.active;
}

async function enableLegacyWebPush(api: PushApi): Promise<PushEnableResult> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return {
      ok: false,
      reason: "This browser does not support push notifications.",
    };
  }
  const publicKey = await api.getVapidPublicKey?.();
  if (!publicKey) {
    return {
      ok: false,
      reason:
        "Push is not configured on the server. Set FIREBASE_WEB_* variables on the API service.",
    };
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  const json = subscription.toJSON();
  if (!json.keys?.p256dh || !json.keys.auth) {
    return { ok: false, reason: "Browser did not provide push subscription keys." };
  }

  try {
    await api.register({
      platform: "WEB",
      token: subscription.endpoint,
      webPushP256dh: json.keys.p256dh,
      webPushAuth: json.keys.auth,
    });
  } catch (err) {
    return {
      ok: false,
      reason: formatPushError(err),
    };
  }

  return { ok: true };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function formatPushError(err: unknown): string {
  if (err instanceof ApiError && err.issues?.length) {
    return err.issues.map((i) => `${i.path}: ${i.message}`).join("; ");
  }
  if (err instanceof Error) return err.message;
  return "Unexpected error enabling push";
}
