import { env } from "../config/env";

const BRAND = "#1e3a5f";
const BRAND_ACCENT = "#3d7dd4";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatEmailDate(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function taskUrl(taskId: string): string {
  return `${env.WEB_ORIGIN}/tasks/${taskId}`;
}

function emailLayout(opts: {
  preheader: string;
  heading: string;
  bodyHtml: string;
  cta?: { label: string; href: string };
}): string {
  const ctaBlock = opts.cta
    ? `<p style="margin:28px 0 0;text-align:center;">
        <a href="${escapeHtml(opts.cta.href)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:8px;">${escapeHtml(opts.cta.label)}</a>
       </p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
  <span style="display:none;max-height:0;overflow:hidden;">${escapeHtml(opts.preheader)}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 12px rgba(15,23,42,0.06);">
          <tr>
            <td style="background:${BRAND};padding:24px 32px;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="background:rgba(255,255,255,0.15);border-radius:8px;width:36px;height:36px;text-align:center;vertical-align:middle;">
                    <span style="color:#ffffff;font-size:18px;font-weight:700;line-height:36px;">✓</span>
                  </td>
                  <td style="padding-left:12px;">
                    <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.02em;">Clear<span style="color:#93c5fd;">Task</span></span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#0f172a;">${escapeHtml(opts.heading)}</h1>
              ${opts.bodyHtml}
              ${ctaBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;text-align:center;">
                Sent by ClearTask · Task management for teams<br />
                <a href="${escapeHtml(env.WEB_ORIGIN)}" style="color:${BRAND_ACCENT};text-decoration:none;">${escapeHtml(env.WEB_ORIGIN.replace(/^https?:\/\//, ""))}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#475569;">${text}</p>`;
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;font-size:13px;color:#64748b;width:100px;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:8px 0;font-size:14px;color:#0f172a;font-weight:500;">${escapeHtml(value)}</td>
  </tr>`;
}

function detailsTable(rows: string): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 20px;background:#f8fafc;border-radius:8px;padding:4px 16px;">${rows}</table>`;
}

export function invitationEmail(opts: {
  organizationName: string;
  roleName: string;
  inviteUrl: string;
  expiresDays: number;
}): { subject: string; text: string; html: string } {
  const subject = `You're invited to join ${opts.organizationName} on ClearTask`;
  const text = [
    `You've been invited to join ${opts.organizationName} on ClearTask as ${opts.roleName}.`,
    "",
    `Accept your invitation (expires in ${opts.expiresDays} days):`,
    opts.inviteUrl,
  ].join("\n");

  const html = emailLayout({
    preheader: `Join ${opts.organizationName} on ClearTask`,
    heading: "You're invited to the team",
    bodyHtml: [
      paragraph(
        `You've been invited to join <strong style="color:#0f172a;">${escapeHtml(opts.organizationName)}</strong> on ClearTask as <strong style="color:#0f172a;">${escapeHtml(opts.roleName)}</strong>.`,
      ),
      detailsTable(
        detailRow("Organisation", opts.organizationName) +
          detailRow("Role", opts.roleName) +
          detailRow("Expires", `In ${opts.expiresDays} days`),
      ),
      paragraph("Click the button below to accept your invitation and set up your account."),
    ].join(""),
    cta: { label: "Accept invitation", href: opts.inviteUrl },
  });

  return { subject, text, html };
}

export function taskAssignedEmail(opts: {
  taskTitle: string;
  dueAt: Date | null;
  taskId: string;
}): { subject: string; text: string; html: string } {
  const subject = `New task assigned: ${opts.taskTitle}`;
  const dueLine = opts.dueAt
    ? `Due: ${formatEmailDate(opts.dueAt)}`
    : "No due date set";
  const text = [`You have been assigned a new task: "${opts.taskTitle}".`, dueLine, "", `View task: ${taskUrl(opts.taskId)}`].join("\n");

  const html = emailLayout({
    preheader: `New task: ${opts.taskTitle}`,
    heading: "New task assigned to you",
    bodyHtml: [
      paragraph(`You have been assigned a new task:`),
      detailsTable(
        detailRow("Task", opts.taskTitle) +
          detailRow("Due", opts.dueAt ? formatEmailDate(opts.dueAt) : "Not set"),
      ),
      paragraph("Open ClearTask to view details, attachments, and update your progress."),
    ].join(""),
    cta: { label: "View task", href: taskUrl(opts.taskId) },
  });

  return { subject, text, html };
}

export function taskReminderEmail(opts: {
  taskTitle: string;
  dueAt: Date;
  taskId: string;
}): { subject: string; text: string; html: string } {
  const subject = `Reminder: ${opts.taskTitle} is due soon`;
  const dueFormatted = formatEmailDate(opts.dueAt);
  const text = [`Reminder: "${opts.taskTitle}" is due ${dueFormatted}.`, "", `View task: ${taskUrl(opts.taskId)}`].join("\n");

  const html = emailLayout({
    preheader: `"${opts.taskTitle}" is due soon`,
    heading: "Task due date reminder",
    bodyHtml: [
      paragraph(`This is a friendly reminder that your task is coming due:`),
      detailsTable(
        detailRow("Task", opts.taskTitle) + detailRow("Due", dueFormatted),
      ),
      paragraph("Please complete the task or update its status in ClearTask."),
    ].join(""),
    cta: { label: "Open task", href: taskUrl(opts.taskId) },
  });

  return { subject, text, html };
}

export function taskOverdueEmail(opts: {
  taskTitle: string;
  dueAt: Date;
  taskId: string;
  forManager?: boolean;
  assigneeName?: string;
}): { subject: string; text: string; html: string } {
  const dueFormatted = formatEmailDate(opts.dueAt);
  const subject = opts.forManager
    ? `Overdue in your team: ${opts.taskTitle}`
    : `Overdue: ${opts.taskTitle}`;

  const text = opts.forManager
    ? `${opts.assigneeName} has not completed "${opts.taskTitle}" (due ${dueFormatted}).\n\nView task: ${taskUrl(opts.taskId)}`
    : `"${opts.taskTitle}" was due ${dueFormatted} and is not yet completed.\n\nView task: ${taskUrl(opts.taskId)}`;

  const html = emailLayout({
    preheader: opts.forManager ? `Team member overdue on ${opts.taskTitle}` : `Task overdue: ${opts.taskTitle}`,
    heading: opts.forManager ? "Team member task overdue" : "Task is overdue",
    bodyHtml: [
      paragraph(
        opts.forManager
          ? `<strong style="color:#0f172a;">${escapeHtml(opts.assigneeName ?? "A team member")}</strong> has not completed the following task:`
          : `The following task is past its due date and has not been marked complete:`,
      ),
      detailsTable(
        detailRow("Task", opts.taskTitle) +
          detailRow("Due", dueFormatted) +
          (opts.forManager && opts.assigneeName
            ? detailRow("Assignee", opts.assigneeName)
            : ""),
      ),
      paragraph("Please take action to keep work on track."),
    ].join(""),
    cta: { label: "View task", href: taskUrl(opts.taskId) },
  });

  return { subject, text, html };
}

export function taskEscalationEmail(opts: {
  taskTitle: string;
  assigneeName: string;
  departmentName?: string;
  daysOverdue: number;
  taskId: string;
}): { subject: string; text: string; html: string } {
  const subject = `Escalation: ${opts.taskTitle} — ${opts.daysOverdue} day${opts.daysOverdue !== 1 ? "s" : ""} overdue`;
  const assigneeLine = opts.departmentName
    ? `${opts.assigneeName} (${opts.departmentName})`
    : opts.assigneeName;

  const text = [
    `Escalation notice: ${assigneeLine} has not completed "${opts.taskTitle}".`,
    `This task is ${opts.daysOverdue} day${opts.daysOverdue !== 1 ? "s" : ""} overdue.`,
    "",
    `View task: ${taskUrl(opts.taskId)}`,
  ].join("\n");

  const html = emailLayout({
    preheader: `Escalation: ${opts.taskTitle} is ${opts.daysOverdue} days overdue`,
    heading: "Overdue task escalation",
    bodyHtml: [
      paragraph(
        `As the account owner, you're receiving this escalation because a task remains incomplete well past its due date.`,
      ),
      detailsTable(
        detailRow("Task", opts.taskTitle) +
          detailRow("Assignee", assigneeLine) +
          detailRow("Days overdue", String(opts.daysOverdue)),
      ),
      paragraph("Review the task and follow up with your team as needed."),
    ].join(""),
    cta: { label: "Review task", href: taskUrl(opts.taskId) },
  });

  return { subject, text, html };
}
