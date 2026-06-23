import "dotenv/config";
import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().default(3001),
    WEB_ORIGIN: z.string().default("http://localhost:5173"),

    DATABASE_URL: z.string().min(1),

    JWT_ACCESS_SECRET: z.string().min(16),
    ACCESS_TOKEN_TTL: z.string().default("15m"),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),

    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    // Override the uploads directory. When unset, uses ./uploads locally or
    // $RAILWAY_VOLUME_MOUNT_PATH/uploads when a Railway volume is attached.
    UPLOADS_DIR: z.string().optional(),
    // Set automatically by Railway when a volume is mounted on the service.
    RAILWAY_VOLUME_MOUNT_PATH: z.string().optional(),

    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default("ClearTask <noreply@cleartask.com.au>"),

    // Web Push (legacy browser path). Generate once with: npx web-push generate-vapid-keys
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().default("mailto:no-reply@localhost"),
    // FCM HTTP v1 (web via Firebase SDK, Android/iOS via Capacitor).
    // Provide either a path to the service account JSON file or the JSON inline
    // (inline is easier on Railway).
    FCM_SERVICE_ACCOUNT_PATH: z.string().optional(),
    FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),

    // Firebase web push (public values — served to browsers at runtime).
    FIREBASE_WEB_API_KEY: z.string().optional(),
    FIREBASE_WEB_AUTH_DOMAIN: z.string().optional(),
    FIREBASE_WEB_PROJECT_ID: z.string().optional(),
    FIREBASE_WEB_STORAGE_BUCKET: z.string().optional(),
    FIREBASE_WEB_MESSAGING_SENDER_ID: z.string().optional(),
    FIREBASE_WEB_APP_ID: z.string().optional(),
    FIREBASE_WEB_MEASUREMENT_ID: z.string().optional(),
    FIREBASE_WEB_VAPID_KEY: z.string().optional(),
  })
  .transform((data) => ({
    ...data,
    UPLOADS_DIR:
      data.UPLOADS_DIR ??
      (data.RAILWAY_VOLUME_MOUNT_PATH
        ? `${data.RAILWAY_VOLUME_MOUNT_PATH.replace(/\/$/, "")}/uploads`
        : "uploads"),
  }));

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error("Copy .env.example to apps/api/.env and fill in the values.");
  process.exit(1);
}

export const env = parsed.data;
