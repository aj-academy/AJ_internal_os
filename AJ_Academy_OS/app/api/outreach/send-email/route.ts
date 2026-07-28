import { NextResponse } from "next/server";
import { requireStaffApiSession, enforceRateLimit } from "@/lib/security";
import { sendOutreachEmail, type OutreachEmailProvider } from "@/lib/email/outreachEmail";
import { MAX_EMAIL_MESSAGE_LENGTH } from "@/lib/whatsappOutreach";
import { isValidEmail } from "@/lib/security/validate";

type AttachmentPayload = {
  filename?: string;
  contentType?: string;
  contentBase64?: string;
};

type Body = {
  provider?: OutreachEmailProvider;
  to?: string;
  cc?: string;
  subject?: string;
  body?: string;
  attachments?: AttachmentPayload[];
};

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "email:outreach", {
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const { response } = await requireStaffApiSession();
  if (response) return response;

  let payload: Body;
  try {
    payload = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const to = (payload.to ?? "").trim().toLowerCase();
  if (!isValidEmail(to)) {
    return NextResponse.json({ error: "Valid recipient email is required." }, { status: 400 });
  }

  const provider: OutreachEmailProvider = payload.provider === "zoho" ? "zoho" : "gmail";
  const cc = (payload.cc ?? "").trim();
  if (cc) {
    const ccList = cc
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
    if (!ccList.every((v) => isValidEmail(v))) {
      return NextResponse.json({ error: "CC must contain valid email addresses (comma separated)." }, { status: 400 });
    }
  }

  const subject = (payload.subject ?? "").trim();
  if (!subject || subject.length > 200) {
    return NextResponse.json({ error: "Subject is required (max 200 characters)." }, { status: 400 });
  }

  const text = (payload.body ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "Message body is required." }, { status: 400 });
  }
  if (text.length > MAX_EMAIL_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message is too long (max ${MAX_EMAIL_MESSAGE_LENGTH} characters).` },
      { status: 400 },
    );
  }

  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  if (attachments.length > 5) {
    return NextResponse.json({ error: "Maximum 5 attachments allowed." }, { status: 400 });
  }
  const normalizedAttachments = attachments.map((a) => ({
    filename: String(a.filename ?? "").trim(),
    contentType: String(a.contentType ?? "application/octet-stream"),
    contentBase64: String(a.contentBase64 ?? "").trim(),
  }));
  if (normalizedAttachments.some((a) => !a.filename || !a.contentBase64)) {
    return NextResponse.json({ error: "Each attachment must include filename and content." }, { status: 400 });
  }

  const result = await sendOutreachEmail({
    provider,
    to,
    cc,
    subject,
    text,
    attachments: normalizedAttachments,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
