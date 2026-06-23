import { NextResponse } from "next/server";
import { Resend } from "resend";

type Body = {
  studentEmail?: string;
  studentName?: string;
  purpose?: string;
  mode?: string;
  sessionAtIso?: string;
  durationMinutes?: number;
  meetingLink?: string;
  venue?: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ ok: true, skipped: true, reason: "RESEND_API_KEY not set" });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const to = (body.studentEmail ?? "").trim().toLowerCase();
  if (!to.includes("@")) return NextResponse.json({ ok: true, skipped: true, reason: "Student email missing" });

  const studentName = (body.studentName ?? "Student").trim();
  const purpose = (body.purpose ?? "Counselling Session").trim();
  const mode = (body.mode ?? "").trim().toLowerCase() === "offline" ? "offline" : "online";
  const sessionAt = body.sessionAtIso ? new Date(body.sessionAtIso) : null;
  const when = sessionAt && !Number.isNaN(sessionAt.getTime()) ? sessionAt.toLocaleString() : "Scheduled";
  const locationLine = mode === "online" ? (body.meetingLink?.trim() ? `Meeting link: ${body.meetingLink.trim()}` : "Meeting link will be shared soon.") : `Venue: ${body.venue?.trim() || "To be shared by mentor."}`;
  const duration = Number(body.durationMinutes ?? 30) || 30;

  const html = `
  <html>
    <body style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;">
      <h2 style="margin:0 0 12px;">Counselling Session Scheduled</h2>
      <p>Hi ${escapeHtml(studentName)},</p>
      <p>Your counselling session has been scheduled in AJ Academy.</p>
      <ul>
        <li><strong>Purpose:</strong> ${escapeHtml(purpose)}</li>
        <li><strong>Mode:</strong> ${escapeHtml(mode)}</li>
        <li><strong>Date & Time:</strong> ${escapeHtml(when)}</li>
        <li><strong>Duration:</strong> ${duration} minutes</li>
        <li><strong>Details:</strong> ${escapeHtml(locationLine)}</li>
      </ul>
      <p>Please open your student dashboard for the latest updates.</p>
    </body>
  </html>
  `.trim();

  const resend = new Resend(apiKey);
  const from = process.env.TASK_EMAIL_FROM?.trim() || "AJ Academy <onboarding@resend.dev>";

  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject: "Your counselling session is scheduled",
    html,
  });

  if (error) {
    return NextResponse.json({ error: error.message || "Email send failed." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
