import { NextResponse } from "next/server";
import { Resend } from "resend";
import { enforceRateLimit } from "@/lib/security";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAttendancePolicyForDate } from "@/lib/hr/attendancePolicy";
import { isLateArrival } from "@/lib/hr/attendanceStatus";
import { notifyLateCheckIn } from "@/lib/hr/payrollNotifications";
import type { UserRole } from "@/types/profile";

export const dynamic = "force-dynamic";

const ATTENDANCE_ROLES = new Set<UserRole>([
  "employee",
  "freelancer",
  "mentor",
  "student",
  "admin",
  "super_admin",
]);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatCheckInLocal(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function portalAttendanceHref(role: string | null | undefined) {
  switch (role) {
    case "freelancer":
      return "/freelancer/attendance";
    case "mentor":
      return "/mentor/attendance";
    case "student":
      return "/student/attendance";
    default:
      return "/employee/attendance";
  }
}

/**
 * POST /api/notifications/attendance-late
 * After check-in: if punch is late per attendance policy, email the member once per day.
 */
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "email:attendance-late", {
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const session = await verifySessionRole(ATTENDANCE_ROLES);
  if (session.response || !session.user || !session.profile) {
    return session.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const profile = session.profile;
  const admin = createAdminClient();

  let body: { attendanceDate?: string; checkInTime?: string } = {};
  try {
    body = (await request.json()) as { attendanceDate?: string; checkInTime?: string };
  } catch {
    body = {};
  }

  // Prefer server-side attendance row for authenticity.
  const today =
    (typeof body.attendanceDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.attendanceDate)
      ? body.attendanceDate
      : null) || new Date().toISOString().slice(0, 10);

  const { data: record, error: recErr } = await admin
    .from("attendance_records")
    .select("id, employee_id, attendance_date, check_in_time")
    .eq("employee_id", userId)
    .eq("attendance_date", today)
    .maybeSingle();

  if (recErr) {
    return NextResponse.json({ error: recErr.message }, { status: 500 });
  }

  const checkInTime =
    record?.check_in_time ||
    (typeof body.checkInTime === "string" ? body.checkInTime : null);

  if (!checkInTime) {
    return NextResponse.json({ ok: true, skipped: true, reason: "No check-in found" });
  }

  const { policy } = await resolveAttendancePolicyForDate(admin, today);
  if (!isLateArrival(checkInTime, policy)) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Not late" });
  }

  const entityId = `${userId}_${today}`;
  const { data: existing } = await admin
    .from("in_app_notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "hr_attendance_late")
    .eq("entity_id", entityId)
    .maybeSingle();

  if (existing?.id) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Already notified today" });
  }

  const checkInLabel = formatCheckInLocal(checkInTime);
  const lateAfter =
    policy.lateAfterTime ||
    `${policy.standardCheckInTime} + ${policy.graceMinutes}m grace`;
  const name = (profile.full_name || "there").trim();
  const to = (profile.email || "").trim().toLowerCase();
  const attendanceHref = portalAttendanceHref(profile.role);

  // In-app + push first (also acts as idempotency marker).
  await notifyLateCheckIn({
    employeeId: userId,
    attendanceDate: today,
    checkInTimeLabel: checkInLabel,
    portalAttendanceHref: attendanceHref,
  });

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({
      ok: true,
      late: true,
      emailed: false,
      reason: "RESEND_API_KEY not set",
    });
  }
  if (!to.includes("@")) {
    return NextResponse.json({
      ok: true,
      late: true,
      emailed: false,
      reason: "Profile email missing",
    });
  }

  const html = `
  <html>
    <body style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;">
      <h2 style="margin:0 0 12px;">Late check-in recorded</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>Your attendance check-in was recorded as <strong>late</strong> in AJ Academy OS.</p>
      <ul>
        <li><strong>Date:</strong> ${escapeHtml(today)}</li>
        <li><strong>Check-in time:</strong> ${escapeHtml(checkInLabel)}</li>
        <li><strong>Office start:</strong> ${escapeHtml(policy.standardCheckInTime)}</li>
        <li><strong>Late after (incl. grace):</strong> ${escapeHtml(String(lateAfter))}</li>
        <li><strong>Grace minutes:</strong> ${policy.graceMinutes}</li>
      </ul>
      <p>Please open your attendance page in AJ OS if you need to raise a correction.</p>
    </body>
  </html>
  `.trim();

  const resend = new Resend(apiKey);
  const from = process.env.TASK_EMAIL_FROM?.trim() || "AJ Academy <onboarding@resend.dev>";
  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject: `Late check-in on ${today}`,
    html,
  });

  if (error) {
    return NextResponse.json(
      { ok: true, late: true, emailed: false, error: error.message || "Email send failed." },
      { status: 200 },
    );
  }

  return NextResponse.json({ ok: true, late: true, emailed: true });
}
