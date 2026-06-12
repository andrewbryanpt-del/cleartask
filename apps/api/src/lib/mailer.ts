import nodemailer from "nodemailer";
import { env } from "../config/env";

const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
          : undefined,
    })
  : null;

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  if (!transport) {
    console.log(
      `[mailer] SMTP not configured — would send to ${opts.to}: "${opts.subject}"\n${opts.text}`,
    );
    return;
  }
  await transport.sendMail({ from: env.EMAIL_FROM, ...opts });
}
