import { z } from "zod";

export const PUSH_PLATFORMS = ["WEB", "ANDROID", "IOS"] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

// `token` is the FCM registration token (Android/iOS) or the Web Push
// subscription endpoint URL (browser, which also needs the two keys).
export const registerPushDeviceSchema = z
  .object({
    platform: z.enum(PUSH_PLATFORMS),
    token: z.string().min(1).max(2000),
    webPushP256dh: z.string().max(200).optional(),
    webPushAuth: z.string().max(100).optional(),
  })
  .refine(
    (v) => v.platform !== "WEB" || (v.webPushP256dh && v.webPushAuth),
    { message: "Web subscriptions require webPushP256dh and webPushAuth" },
  );
export type RegisterPushDeviceInput = z.infer<typeof registerPushDeviceSchema>;

export const unregisterPushDeviceSchema = z.object({
  token: z.string().min(1).max(2000),
});
export type UnregisterPushDeviceInput = z.infer<
  typeof unregisterPushDeviceSchema
>;
