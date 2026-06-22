import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3001),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),

  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  UPLOADS_DIR: z.string().default("uploads"),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("ClearTask <noreply@cleartask.com.au>"),

  // Web Push (browser). Generate once with: npx web-push generate-vapid-keys
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:no-reply@localhost"),
  // FCM HTTP v1 (Android/iOS via Capacitor). Path to a Firebase service
  // account JSON; the project id is read from the file.
  FCM_SERVICE_ACCOUNT_PATH: z.string().optional(),
});

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
