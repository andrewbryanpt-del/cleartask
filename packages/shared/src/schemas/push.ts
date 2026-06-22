import { z } from "zod";

export const PUSH_PLATFORMS = ["WEB", "ANDROID", "IOS"] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

// `token` is the FCM registration token (web/Android/iOS) or, for legacy
// Web Push, the subscription endpoint URL (which also needs the two keys).
export const registerPushDeviceSchema = z
  .object({
    platform: z.enum(PUSH_PLATFORMS),
    token: z.string().min(1).max(4096),
    webPushP256dh: z.string().max(200).optional(),
    webPushAuth: z.string().max(100).optional(),
  })
  .refine(
    (v) => {
      if (v.platform !== "WEB") return true;
      // FCM web tokens are opaque strings; legacy Web Push uses HTTPS endpoints.
      const isLegacyEndpoint = v.token.startsWith("https://");
      if (!isLegacyEndpoint) return true;
      return Boolean(v.webPushP256dh && v.webPushAuth);
    },
    {
      message:
        "Legacy Web Push subscriptions require webPushP256dh and webPushAuth",
    },
  );
export type RegisterPushDeviceInput = z.infer<typeof registerPushDeviceSchema>;

export const unregisterPushDeviceSchema = z.object({
  token: z.string().min(1).max(4096),
});
export type UnregisterPushDeviceInput = z.infer<
  typeof unregisterPushDeviceSchema
>;
