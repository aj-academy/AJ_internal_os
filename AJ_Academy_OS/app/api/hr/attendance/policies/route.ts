import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/hr/auditLog";
import {
  createAttendancePolicyVersion,
  listAttendancePolicies,
  policyRowToAttendancePolicy,
  resolveAttendancePolicyForDate,
  type AttendancePolicyInput,
} from "@/lib/hr/attendancePolicy";
import type {
  AttendanceRoundingRule,
  EarlyExitRule,
  HolidayTreatment,
  LateArrivalRule,
  MissingCheckoutTreatment,
  PermissionHourPolicy,
  SalaryDayMethod,
  WfhPolicy,
} from "@/lib/hr/attendanceStatus";

export const dynamic = "force-dynamic";

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  return fallback;
}

function parseWeeklyOff(value: unknown): number[] {
  if (!Array.isArray(value)) return [0];
  const days = value
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return days.length ? Array.from(new Set(days)).sort((a, b) => a - b) : [0];
}

function parseBody(body: Record<string, unknown>): AttendancePolicyInput {
  const salaryDayMethod = asEnum(
    body.salaryDayMethod,
    ["calendar_days", "fixed_30", "working_days", "configured_days"] as const,
    "fixed_30",
  );
  const configured =
    body.configuredPayrollDays == null || body.configuredPayrollDays === ""
      ? null
      : Number(body.configuredPayrollDays);

  return {
    name: typeof body.name === "string" ? body.name : "Attendance policy",
    effectiveFrom:
      typeof body.effectiveFrom === "string" && body.effectiveFrom
        ? body.effectiveFrom
        : new Date().toISOString().slice(0, 10),
    officeStartTime: typeof body.officeStartTime === "string" ? body.officeStartTime : "10:00",
    officeEndTime: typeof body.officeEndTime === "string" ? body.officeEndTime : "18:00",
    graceMinutes: Math.max(0, Number(body.graceMinutes) || 0),
    minFullDayMinutes: Math.max(1, Number(body.minFullDayMinutes) || 480),
    minHalfDayMinutes: Math.max(1, Number(body.minHalfDayMinutes) || 240),
    maxBreakMinutes: Math.max(0, Number(body.maxBreakMinutes) || 0),
    lateArrivalRule: asEnum(
      body.lateArrivalRule,
      ["mark_late", "ignore", "deduct_half_day", "send_to_review"] as const,
      "mark_late",
    ) as LateArrivalRule,
    earlyExitRule: asEnum(
      body.earlyExitRule,
      ["mark_early_exit", "ignore", "deduct_half_day", "send_to_review"] as const,
      "mark_early_exit",
    ) as EarlyExitRule,
    missingCheckoutTreatment: asEnum(
      body.missingCheckoutTreatment,
      ["send_to_review", "assume_standard_hours", "mark_absent", "mark_half_day"] as const,
      "send_to_review",
    ) as MissingCheckoutTreatment,
    weeklyOffDays: parseWeeklyOff(body.weeklyOffDays),
    holidayTreatment: asEnum(
      body.holidayTreatment,
      ["paid_holiday", "unpaid", "working_day"] as const,
      "paid_holiday",
    ) as HolidayTreatment,
    wfhPolicy: asEnum(
      body.wfhPolicy,
      ["allowed", "allowed_with_approval", "not_allowed"] as const,
      "allowed_with_approval",
    ) as WfhPolicy,
    permissionHourPolicy: asEnum(
      body.permissionHourPolicy,
      ["track_only", "deduct_from_hours", "send_to_review"] as const,
      "track_only",
    ) as PermissionHourPolicy,
    overtimeEligible: Boolean(body.overtimeEligible),
    overtimeMinMinutes: Math.max(0, Number(body.overtimeMinMinutes) || 0),
    overtimeRequiresApproval: body.overtimeRequiresApproval !== false,
    attendanceRoundingRule: asEnum(
      body.attendanceRoundingRule,
      ["none", "nearest_15", "nearest_30", "ceil_15", "floor_15"] as const,
      "none",
    ) as AttendanceRoundingRule,
    salaryDayMethod: salaryDayMethod as SalaryDayMethod,
    configuredPayrollDays: Number.isFinite(configured as number) ? (configured as number) : null,
    notes: typeof body.notes === "string" ? body.notes : null,
  };
}

// GET /api/hr/attendance/policies?date=YYYY-MM-DD
export async function GET(request: Request) {
  const { response } = await requireAdminApiSession();
  if (response) return response;

  const url = new URL(request.url);
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const admin = createAdminClient();

  try {
    const [policies, resolved] = await Promise.all([
      listAttendancePolicies(admin),
      resolveAttendancePolicyForDate(admin, date),
    ]);

    return NextResponse.json({
      date,
      active: {
        source: resolved.source,
        policy: resolved.policy,
        row: resolved.row,
      },
      policies,
      resolvedPolicies: policies.map(policyRowToAttendancePolicy),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load policies";
    // Table may not exist yet — return empty with clear hint
    if (/attendance_policies|does not exist|PGRST/i.test(message)) {
      return NextResponse.json({
        date,
        active: { source: "default", policy: resolvedFallback(), row: null },
        policies: [],
        resolvedPolicies: [],
        migrationRequired: "hr_payroll_02_attendance_policies.sql",
        warning: message,
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function resolvedFallback() {
  return {
    id: null,
    name: "Built-in default (no DB policy)",
    standardCheckInTime: "10:00",
    standardCheckOutTime: "18:00",
    graceMinutes: 15,
    lateAfterTime: "10:15",
    minFullDayMinutes: 480,
    minHalfDayMinutes: 240,
    maxBreakMinutes: 60,
    lateArrivalRule: "mark_late",
    earlyExitRule: "mark_early_exit",
    missingCheckoutTreatment: "send_to_review",
    weeklyOffDays: [0],
    holidayTreatment: "paid_holiday",
    wfhPolicy: "allowed_with_approval",
    permissionHourPolicy: "track_only",
    overtimeEligible: false,
    overtimeMinMinutes: 30,
    overtimeRequiresApproval: true,
    attendanceRoundingRule: "none",
    salaryDayMethod: "fixed_30",
    configuredPayrollDays: null,
  };
}

// POST /api/hr/attendance/policies — create a new effective-dated version
export async function POST(request: Request) {
  const { response, profile } = await requireAdminApiSession();
  if (response) return response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = parseBody(body);
  const admin = createAdminClient();

  try {
    const created = await createAttendancePolicyVersion(admin, input, profile?.id ?? null);
    await writeAuditLog(admin, {
      actorId: profile?.id ?? null,
      action: "attendance_policy_created",
      targetTable: "attendance_policies",
      targetId: created.id,
      newData: created,
    });
    return NextResponse.json({ ok: true, policy: created });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create policy" },
      { status: 400 },
    );
  }
}

// PATCH /api/hr/attendance/policies — update notes / name of an existing version (not rules mid-period)
export async function PATCH(request: Request) {
  const { response, profile } = await requireAdminApiSession();
  if (response) return response;

  let body: { id?: string; name?: string; notes?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = body.id?.trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: before } = await admin.from("attendance_policies").select("*").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Policy not found" }, { status: 404 });

  const patch: Record<string, unknown> = { updated_by: profile?.id ?? null };
  if (typeof body.name === "string") patch.name = body.name.trim() || before.name;
  if (body.notes !== undefined) patch.notes = body.notes;

  const { data, error } = await admin
    .from("attendance_policies")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(admin, {
    actorId: profile?.id ?? null,
    action: "attendance_policy_updated",
    targetTable: "attendance_policies",
    targetId: id,
    oldData: before,
    newData: data,
  });

  return NextResponse.json({ ok: true, policy: data });
}
