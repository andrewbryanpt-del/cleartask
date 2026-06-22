import { readFileSync } from "node:fs";
import webPush from "web-push";
import { GoogleAuth } from "google-auth-library";
import type { PushDevice } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "./prisma";

export interface PushPayload {
  type: string;
  title: string;
  body?: string;
  taskId?: string;
}

// Both channels are optional, mirroring the mailer: unset config means the
// channel is silently skipped, never an error.

const webPushEnabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
if (webPushEnabled) {
  webPush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC_KEY!,
    env.VAPID_PRIVATE_KEY!,
  );
}

function loadFcmCredentials(): { projectId: string; credentials: object } | null {
  if (env.FCM_SERVICE_ACCOUNT_JSON) {
    try {
      const credentials = JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON) as {
        project_id: string;
      };
      return { projectId: credentials.project_id, credentials };
    } catch (err) {
      console.error("[push] failed to parse FCM_SERVICE_ACCOUNT_JSON:", err);
      return null;
    }
  }
  if (env.FCM_SERVICE_ACCOUNT_PATH) {
    try {
      const credentials = JSON.parse(
        readFileSync(env.FCM_SERVICE_ACCOUNT_PATH, "utf8"),
      ) as { project_id: string };
      return { projectId: credentials.project_id, credentials };
    } catch (err) {
      console.error("[push] failed to load FCM service account file:", err);
      return null;
    }
  }
  return null;
}

const fcmConfig = loadFcmCredentials();
const fcm = fcmConfig
  ? {
      auth: new GoogleAuth({
        credentials: fcmConfig.credentials,
        scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
      }),
      projectId: fcmConfig.projectId,
    }
  : null;

async function dropDevice(device: PushDevice): Promise<void> {
  await prisma.pushDevice
    .delete({ where: { id: device.id } })
    .catch(() => undefined);
}

function isLegacyWebPush(device: PushDevice): boolean {
  return Boolean(
    device.platform === "WEB" &&
      device.webPushP256dh &&
      device.webPushAuth &&
      device.token.startsWith("https://"),
  );
}

async function sendWebPush(
  device: PushDevice,
  payload: PushPayload,
): Promise<void> {
  if (!webPushEnabled) return;
  try {
    await webPush.sendNotification(
      {
        endpoint: device.token,
        keys: { p256dh: device.webPushP256dh!, auth: device.webPushAuth! },
      },
      JSON.stringify(payload),
    );
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    // 404/410 mean the subscription is gone — prune it.
    if (status === 404 || status === 410) await dropDevice(device);
    else throw err;
  }
}

async function sendFcm(
  device: PushDevice,
  payload: PushPayload,
): Promise<void> {
  if (!fcm) return;
  const accessToken = await fcm.auth.getAccessToken();
  const taskPath = payload.taskId ? `/tasks/${payload.taskId}` : "/";
  const link = `${env.WEB_ORIGIN.replace(/\/$/, "")}${taskPath}`;

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${fcm.projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: device.token,
          notification: { title: payload.title, body: payload.body ?? "" },
          // FCM data values must all be strings.
          data: {
            type: payload.type,
            title: payload.title,
            body: payload.body ?? "",
            ...(payload.taskId ? { taskId: payload.taskId } : {}),
          },
          webpush: {
            fcmOptions: { link },
            notification: {
              title: payload.title,
              body: payload.body ?? "",
              icon: "/icons/icon-192.png",
            },
          },
        },
      }),
    },
  );
  if (res.status === 404 || res.status === 410) {
    await dropDevice(device);
  } else if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // UNREGISTERED comes back as 400/404 depending on the failure mode.
    if (detail.includes("UNREGISTERED")) await dropDevice(device);
    else throw new Error(`FCM send failed (${res.status}): ${detail}`);
  }
}

export async function sendPushToMembership(
  membershipId: string,
  payload: PushPayload,
): Promise<void> {
  const devices = await prisma.pushDevice.findMany({
    where: { membershipId },
  });
  for (const device of devices) {
    try {
      if (isLegacyWebPush(device)) await sendWebPush(device, payload);
      else await sendFcm(device, payload);
    } catch (err) {
      console.error(`[push] delivery to device ${device.id} failed:`, err);
    }
  }
}

export function isFcmConfigured(): boolean {
  return fcm !== null;
}
