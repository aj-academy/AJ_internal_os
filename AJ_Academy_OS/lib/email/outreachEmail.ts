import nodemailer from "nodemailer";

export const DEFAULT_OUTREACH_EMAIL_FROM = "AJ Academy <ajacademy.co.in@gmail.com>";
export const DEFAULT_OUTREACH_GMAIL_USER = "ajacademy.co.in@gmail.com";
export const DEFAULT_OUTREACH_ZOHO_USER = "support@ajacademy.co.in";

export type OutreachEmailProvider = "gmail" | "zoho";

type OutreachAttachment = {
  filename: string;
  contentType?: string;
  contentBase64: string;
};

export function getOutreachEmailFrom() {
  return process.env.OUTREACH_EMAIL_FROM?.trim() || DEFAULT_OUTREACH_EMAIL_FROM;
}

export function getOutreachGmailUser() {
  return process.env.GMAIL_OUTREACH_USER?.trim() || DEFAULT_OUTREACH_GMAIL_USER;
}

export function getOutreachZohoUser() {
  return process.env.ZOHO_MAIL_FROM?.trim() || process.env.ZOHO_OUTREACH_USER?.trim() || DEFAULT_OUTREACH_ZOHO_USER;
}

export function getZohoAccountsBaseUrl() {
  return process.env.ZOHO_ACCOUNTS_BASE_URL?.trim() || "https://accounts.zoho.in";
}

type SendOutreachEmailInput = {
  provider: OutreachEmailProvider;
  to: string;
  cc?: string;
  subject: string;
  text: string;
  attachments?: OutreachAttachment[];
};

function buildNodemailerAttachments(attachments: OutreachAttachment[] = []) {
  return attachments.map((a) => ({
    filename: a.filename,
    contentType: a.contentType || "application/octet-stream",
    content: Buffer.from(a.contentBase64, "base64"),
  }));
}

function makeGmailTransporter() {
  const pass = process.env.GMAIL_OUTREACH_APP_PASSWORD?.trim();
  if (!pass) {
    return {
      ok: false as const,
      error:
        "Gmail outreach is not configured. Set GMAIL_OUTREACH_APP_PASSWORD in .env.local (or Vercel env) for ajacademy.co.in@gmail.com.",
    };
  }
  return {
    ok: true as const,
    transporter: nodemailer.createTransport({
      service: "gmail",
      auth: { user: getOutreachGmailUser(), pass },
    }),
  };
}

function makeZohoTransporter() {
  const user = getOutreachZohoUser();
  const smtpPassword = process.env.ZOHO_SMTP_PASSWORD?.trim();
  if (user && smtpPassword) {
    return {
      ok: true as const,
      transporter: nodemailer.createTransport({
        host: process.env.ZOHO_SMTP_HOST?.trim() || "smtp.zoho.in",
        port: Number(process.env.ZOHO_SMTP_PORT?.trim() || "465"),
        secure: true,
        auth: { user, pass: smtpPassword },
      }),
    };
  }

  const clientId = process.env.ZOHO_CLIENT_ID?.trim();
  const clientSecret = process.env.ZOHO_CLIENT_SECRET?.trim();
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken || !user) {
    return {
      ok: false as const,
      error:
        "Zoho Mail is not configured. Set ZOHO_MAIL_FROM and either ZOHO_SMTP_PASSWORD (recommended) or OAuth keys (ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN).",
    };
  }
  return {
    ok: true as const,
    transporter: nodemailer.createTransport({
      host: process.env.ZOHO_SMTP_HOST?.trim() || "smtp.zoho.in",
      port: Number(process.env.ZOHO_SMTP_PORT?.trim() || "465"),
      secure: true,
      auth: {
        type: "OAuth2",
        user,
        clientId,
        clientSecret,
        refreshToken,
        accessUrl: `${getZohoAccountsBaseUrl().replace(/\/+$/, "")}/oauth/v2/token`,
      },
    }),
  };
}

export async function sendOutreachEmail({ provider, to, cc, subject, text, attachments = [] }: SendOutreachEmailInput) {
  const transporterResult = provider === "zoho" ? makeZohoTransporter() : makeGmailTransporter();
  if (!transporterResult.ok) return transporterResult;

  // Zoho SMTP only allows sending as the authenticated mailbox (or an alias on that account).
  // Using Gmail From with Zoho auth causes: 553 Sender is not allowed to relay emails.
  const from =
    provider === "zoho"
      ? `AJ Academy <${getOutreachZohoUser()}>`
      : getOutreachEmailFrom();
  const replyTo =
    provider === "zoho" ? process.env.ZOHO_MAIL_REPLY_TO?.trim() || getOutreachZohoUser() : undefined;

  try {
    await transporterResult.transporter.sendMail({
      from,
      replyTo,
      to,
      cc: cc?.trim() || undefined,
      subject,
      text,
      attachments: buildNodemailerAttachments(attachments),
    });
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Email send failed.",
    };
  }
}
