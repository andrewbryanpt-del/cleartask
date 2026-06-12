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

let fcm: { auth: GoogleAuth; projectId: string } | null = null;
if (env.FCM_SERVICE_ACCOUNT_PATH) {
  try {
    const serviceAccount = JSON.parse(
      readFileSync(env.FCM_SERVICE_ACCOUNT_PATH, "utf8"),
    ) as { project_id: string };
    fcm = {
      auth: new GoogleAuth({
        keyFile: env.FCM_SERVICE_ACCOUNT_PATH,
        scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
      }),
      projectId: serviceAccount.project_id,
    };
  } catch (err) {
    console.error("[push] failed to load FCM service account:", err);
  }
}

async function dropDevice(device: PushDevice): Promise<void> {
  await prisma.pushDevice
    .delete({ where: { id: device.id } })
    .catch(() => undefined);
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
            ...(payload.taskId ? { taskId: payload.taskId } : {}),
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
      if (device.platform === "WEB") await sendWebPush(device, payload);
      else await sendFcm(device, payload);
    } catch (err) {
      console.error(`[push] delivery to device ${device.id} failed:`, err);
    }
  }
}
