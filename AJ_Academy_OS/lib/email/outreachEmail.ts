import nodemailer from "nodemailer";

export const DEFAULT_OUTREACH_EMAIL_FROM = "AJ Academy <ajacademy.co.in@gmail.com>";
export const DEFAULT_OUTREACH_GMAIL_USER = "ajacademy.co.in@gmail.com";

export function getOutreachEmailFrom() {
  return process.env.OUTREACH_EMAIL_FROM?.trim() || DEFAULT_OUTREACH_EMAIL_FROM;
}

export function getOutreachGmailUser() {
  return process.env.GMAIL_OUTREACH_USER?.trim() || DEFAULT_OUTREACH_GMAIL_USER;
}

type SendOutreachEmailInput = {
  to: string;
  subject: string;
  text: string;
};

export async function sendOutreachEmail({ to, subject, text }: SendOutreachEmailInput) {
  const pass = process.env.GMAIL_OUTREACH_APP_PASSWORD?.trim();
  if (!pass) {
    return {
      ok: false as const,
      error:
        "Gmail outreach is not configured. Set GMAIL_OUTREACH_APP_PASSWORD in .env.local (or Vercel env) for ajacademy.co.in@gmail.com.",
    };
  }

  const user = getOutreachGmailUser();
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from: getOutreachEmailFrom(),
      to,
      subject,
      text,
    });
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Email send failed.",
    };
  }
}
