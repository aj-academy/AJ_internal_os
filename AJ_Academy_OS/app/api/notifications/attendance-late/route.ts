import { NextResponse } from "next/server";
import { Resend } from "resend";
import { enforceRateLimit } from "@/lib/security";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAttendancePolicyForDate } from "@/lib/hr/attendancePolicy";
import { isLateArrival } from "@/lib/hr/attendanceStatus";
import { notifyLateCheckIn } from "@/lib/hr/payrollNotifications";
import { buildLateAttendanceNotice } from "@/lib/hr/lateAttendanceEmail";
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

function resendFromAddress() {
  const from = process.env.TASK_EMAIL_FROM?.trim() || "";
  // Shared Resend sandbox From addresses are heavily spam-foldered — skip Resend unless a real domain is set.
  if (!from || /onboarding@resend\.dev/i.test(from)) return null;
  return from;
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
  const notice = buildLateAttendanceNotice({
    name: args.name,
    attendanceDate: args.today,
    checkInLabel: args.checkInLabel,
    officeStart: args.officeStart,
    lateAfter: args.lateAfter,
    graceMinutes: args.graceMinutes,
  });

  // Prefer company SMTP (Zoho / Gmail) for deliverability — real ajacademy.co.in From.
  for (const provider of ["zoho", "gmail"] as const) {
    const result = await sendOutreachEmail({
      provider,
      to: args.to,
      subject: notice.subject,
      text: notice.text,
    });
    if (result.ok) return { emailed: true, via: provider };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = resendFromAddress();
  if (apiKey && from) {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: [args.to],
      subject: notice.subject,
      html: notice.html,
      text: notice.text,
    });
    if (!error) return { emailed: true, via: "resend" };
    return { emailed: false, error: error.message || "Resend send failed" };
  }

  return {
    emailed: false,
    reason:
      "Company mail (Zoho/Gmail) not configured. Set ZOHO_SMTP_PASSWORD or GMAIL_OUTREACH_APP_PASSWORD. Avoid Resend onboarding@resend.dev — it lands in spam.",
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
  const notice = buildLateAttendanceNotice({
    name,
    attendanceDate: today,
    checkInLabel,
    officeStart: policy.standardCheckInTime,
    lateAfter,
    graceMinutes: policy.graceMinutes,
  });

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
      pushTitle: notice.pushTitle,
      pushMessage: notice.pushMessage,
    });
  }

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
