import { Resend } from "resend";
import { env } from "../config/env";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  if (!resend) {
    console.log(
      `[mailer] Resend not configured — would send to ${opts.to}: "${opts.subject}"\n${opts.text}`,
    );
    return;
  }

  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    ...(opts.html ? { html: opts.html } : {}),
  });

  if (error) {
    throw new Error(error.message);
  }
}
