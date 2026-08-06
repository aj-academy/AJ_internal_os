import { NextResponse } from "next/server";
import { Resend } from "resend";
import { enforceRateLimit } from "@/lib/security";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAttendancePolicyForDate } from "@/lib/hr/attendancePolicy";
import { isLateArrival } from "@/lib/hr/attendanceStatus";
import { notifyLateCheckIn } from "@/lib/hr/payrollNotifications";
import { sendOutreachEmail } from "@/lib/email/outreachEmail";
import { todayDateIST } from "@/lib/datetime";
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

function formatCheckInIst(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
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

async function sendLateEmail(args: {
  to: string;
  name: string;
  today: string;
  checkInLabel: string;
  officeStart: string;
  lateAfter: string;
  graceMinutes: number;
}): Promise<{ emailed: boolean; via?: string; error?: string; reason?: string }> {
  const subject = `Late check-in on ${args.today}`;
  const text = [
    `Hi ${args.name},`,
    "",
    "Your attendance check-in was recorded as late in AJ Academy OS.",
    `Date: ${args.today}`,
    `Check-in time: ${args.checkInLabel}`,
    `Office start: ${args.officeStart}`,
    `Late after (incl. grace): ${args.lateAfter}`,
    `Grace minutes: ${args.graceMinutes}`,
    "",
    "Please open your attendance page in AJ OS if you need to raise a correction.",
  ].join("\n");

  const html = `
  <html>
    <body style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;">
      <h2 style="margin:0 0 12px;">Late check-in recorded</h2>
      <p>Hi ${escapeHtml(args.name)},</p>
      <p>Your attendance check-in was recorded as <strong>late</strong> in AJ Academy OS.</p>
      <ul>
        <li><strong>Date:</strong> ${escapeHtml(args.today)}</li>
        <li><strong>Check-in time:</strong> ${escapeHtml(args.checkInLabel)}</li>
        <li><strong>Office start:</strong> ${escapeHtml(args.officeStart)}</li>
        <li><strong>Late after (incl. grace):</strong> ${escapeHtml(args.lateAfter)}</li>
        <li><strong>Grace minutes:</strong> ${args.graceMinutes}</li>
      </ul>
      <p>Please open your attendance page in AJ OS if you need to raise a correction.</p>
    </body>
  </html>
  `.trim();

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (apiKey) {
    const resend = new Resend(apiKey);
    const from = process.env.TASK_EMAIL_FROM?.trim() || "AJ Academy <onboarding@resend.dev>";
    const { error } = await resend.emails.send({
      from,
      to: [args.to],
      subject,
      html,
    });
    if (!error) return { emailed: true, via: "resend" };
    // Fall through to SMTP outreach if Resend fails.
  }

  for (const provider of ["gmail", "zoho"] as const) {
    const result = await sendOutreachEmail({
      provider,
      to: args.to,
      subject,
      text,
    });
    if (result.ok) return { emailed: true, via: provider };
  }

  return {
    emailed: false,
    reason: apiKey
      ? "Resend and outreach SMTP both failed"
      : "RESEND_API_KEY not set and outreach SMTP not configured",
  };
}

/**
 * POST /api/notifications/attendance-late
 * After check-in: if punch is late per attendance policy (IST), email the member once per day.
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

  const today =
    (typeof body.attendanceDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.attendanceDate)
      ? body.attendanceDate
      : null) || todayDateIST();

  const { data: record, error: recErr } = await admin
    .from("attendance_records")
    .select("id, employee_id, attendance_date, check_in_time")
    .eq("employee_id", userId)
    .eq("attendance_date", today)
    .order("check_in_time", { ascending: false })
    .limit(1)
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
  const late = isLateArrival(checkInTime, policy);
  if (!late) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Not late",
      checkInTime,
      officeStart: policy.standardCheckInTime,
      lateAfter: policy.lateAfterTime,
      graceMinutes: policy.graceMinutes,
    });
  }

  const entityId = `${userId}_${today}`;
  // entity_id lives in meta jsonb (no dedicated column on in_app_notifications).
  const { data: existingRows } = await admin
    .from("in_app_notifications")
    .select("id, meta")
    .eq("user_id", userId)
    .eq("type", "hr_attendance_late")
    .order("created_at", { ascending: false })
    .limit(20);

  const existing = (existingRows ?? []).find((row) => {
    const meta = (row.meta ?? {}) as Record<string, unknown>;
    return meta.entity_id === entityId;
  });
  const existingMeta = (existing?.meta ?? {}) as Record<string, unknown>;
  const alreadyEmailed = Boolean(existingMeta.late_email_sent);

  if (existing?.id && alreadyEmailed) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Already notified today" });
  }

  const checkInLabel = formatCheckInIst(checkInTime);
  const lateAfter = policy.lateAfterTime;
  const name = (profile.full_name || "there").trim();
  const to = (profile.email || "").trim().toLowerCase();
  const attendanceHref = portalAttendanceHref(profile.role);

  let emailResult: { emailed: boolean; via?: string; error?: string; reason?: string } = {
    emailed: false,
    reason: "Profile email missing",
  };
  if (to.includes("@")) {
    emailResult = await sendLateEmail({
      to,
      name,
      today,
      checkInLabel,
      officeStart: policy.standardCheckInTime,
      lateAfter,
      graceMinutes: policy.graceMinutes,
    });
  }

  if (!existing?.id) {
    await notifyLateCheckIn({
      employeeId: userId,
      attendanceDate: today,
      checkInTimeLabel: checkInLabel,
      portalAttendanceHref: attendanceHref,
    });
  }

  // Stamp email success on the notification meta so retries don't spam, but can retry failed sends.
  if (emailResult.emailed) {
    const { data: rows } = await admin
      .from("in_app_notifications")
      .select("id, meta")
      .eq("user_id", userId)
      .eq("type", "hr_attendance_late")
      .order("created_at", { ascending: false })
      .limit(20);
    const row = (rows ?? []).find((r) => {
      const meta = (r.meta ?? {}) as Record<string, unknown>;
      return meta.entity_id === entityId;
    });
    if (row?.id) {
      const meta = {
        ...((row.meta ?? {}) as Record<string, unknown>),
        late_email_sent: true,
        late_email_via: emailResult.via ?? null,
        late_email_at: new Date().toISOString(),
      };
      await admin.from("in_app_notifications").update({ meta }).eq("id", row.id);
    }
  }

  return NextResponse.json({
    ok: true,
    late: true,
    emailed: emailResult.emailed,
    via: emailResult.via ?? null,
    reason: emailResult.emailed ? undefined : emailResult.reason || emailResult.error,
  });
}
