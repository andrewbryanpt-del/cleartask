import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import type { RegisterPushDeviceInput } from "@task-tracker/shared";

// Push enrollment for both shells. The caller supplies the two API calls
// (they go through the app's authenticated client):
//   register      → POST /api/v1/push-devices
//   getVapidKey   → GET  /api/v1/push/vapid-public-key
export interface PushApi {
  register: (input: RegisterPushDeviceInput) => Promise<void>;
  getVapidPublicKey: () => Promise<string | null>;
}

export async function enablePush(api: PushApi): Promise<boolean> {
  return Capacitor.isNativePlatform()
    ? enableNativePush(api)
    : enableWebPush(api);
}

// Android/iOS: FCM token via the Capacitor plugin.
async function enableNativePush(api: PushApi): Promise<boolean> {
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") return false;

  return new Promise<boolean>((resolve) => {
    void PushNotifications.addListener("registration", async ({ value }) => {
      try {
        await api.register({
          platform: Capacitor.getPlatform() === "ios" ? "IOS" : "ANDROID",
          token: value,
        });
        resolve(true);
      } catch {
        resolve(false);
      }
    });
    void PushNotifications.addListener("registrationError", () =>
      resolve(false),
    );
    void PushNotifications.register();
  });
}

// Browser: Web Push subscription against our VAPID key, delivered through
// public/sw.js.
async function enableWebPush(api: PushApi): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return false;
  }
  const publicKey = await api.getVapidPublicKey();
  if (!publicKey) return false; // web push not configured server-side

  const registration = await navigator.serviceWorker.register("/sw.js");
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  const json = subscription.toJSON();
  if (!json.keys?.p256dh || !json.keys.auth) return false;

  await api.register({
    platform: "WEB",
    token: subscription.endpoint,
    webPushP256dh: json.keys.p256dh,
    webPushAuth: json.keys.auth,
  });
  return true;
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
