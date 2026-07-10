import { NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/requireStaffApi";
import { sendOutreachEmail } from "@/lib/email/outreachEmail";
import { MAX_EMAIL_MESSAGE_LENGTH } from "@/lib/whatsappOutreach";

type Body = {
  to?: string;
  subject?: string;
  body?: string;
};

export async function POST(request: Request) {
  const { response } = await requireStaffApiSession();
  if (response) return response;

  let payload: Body;
  try {
    payload = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const to = (payload.to ?? "").trim().toLowerCase();
  if (!to.includes("@")) {
    return NextResponse.json({ error: "Valid recipient email is required." }, { status: 400 });
  }

  const subject = (payload.subject ?? "").trim();
  if (!subject) {
    return NextResponse.json({ error: "Subject is required." }, { status: 400 });
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

  const result = await sendOutreachEmail({ to, subject, text });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
