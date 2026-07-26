import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_ATTENDANCE_POLICY,
  computeLateAfterTime,
  type AttendancePolicy,
  type AttendanceRoundingRule,
  type EarlyExitRule,
  type HolidayTreatment,
  type LateArrivalRule,
  type MissingCheckoutTreatment,
  type PermissionHourPolicy,
  type SalaryDayMethod,
  type WfhPolicy,
} from "@/lib/hr/attendanceStatus";

/** Raw row shape from public.attendance_policies */
export type AttendancePolicyRow = {
  id: string;
  name: string;
  effective_from: string;
  effective_to: string | null;
  office_start_time: string;
  office_end_time: string;
  grace_minutes: number;
  min_full_day_minutes: number;
  min_half_day_minutes: number;
  max_break_minutes: number;
  late_arrival_rule: LateArrivalRule;
  early_exit_rule: EarlyExitRule;
  missing_checkout_treatment: MissingCheckoutTreatment;
  weekly_off_days: number[];
  holiday_treatment: HolidayTreatment;
  wfh_policy: WfhPolicy;
  permission_hour_policy: PermissionHourPolicy;
  overtime_eligible: boolean;
  overtime_min_minutes: number;
  overtime_requires_approval: boolean;
  attendance_rounding_rule: AttendanceRoundingRule;
  salary_day_method: SalaryDayMethod;
  configured_payroll_days: number | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

function timeToHhmm(value: string | null | undefined): string {
  if (!value) return "00:00";
  // Postgres time may come as "10:00:00" or "10:00:00.000"
  return value.slice(0, 5);
}

export function policyRowToAttendancePolicy(row: AttendancePolicyRow): AttendancePolicy {
  const start = timeToHhmm(row.office_start_time);
  const grace = Number(row.grace_minutes) || 0;
  return {
    id: row.id,
    name: row.name,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    standardCheckInTime: start,
    standardCheckOutTime: timeToHhmm(row.office_end_time),
    graceMinutes: grace,
    lateAfterTime: computeLateAfterTime(start, grace),
    minFullDayMinutes: Number(row.min_full_day_minutes) || 480,
    minHalfDayMinutes: Number(row.min_half_day_minutes) || 240,
    maxBreakMinutes: Number(row.max_break_minutes) || 0,
    lateArrivalRule: row.late_arrival_rule,
    earlyExitRule: row.early_exit_rule,
    missingCheckoutTreatment: row.missing_checkout_treatment,
    weeklyOffDays: Array.isArray(row.weekly_off_days) ? row.weekly_off_days.map(Number) : [0],
    holidayTreatment: row.holiday_treatment,
    wfhPolicy: row.wfh_policy,
    permissionHourPolicy: row.permission_hour_policy,
    overtimeEligible: !!row.overtime_eligible,
    overtimeMinMinutes: Number(row.overtime_min_minutes) || 0,
    overtimeRequiresApproval: !!row.overtime_requires_approval,
    attendanceRoundingRule: row.attendance_rounding_rule,
    salaryDayMethod: row.salary_day_method,
    configuredPayrollDays: row.configured_payroll_days,
  };
}

/**
 * Resolve the attendance policy effective on `dateIso` (YYYY-MM-DD).
 * Falls back to DEFAULT_ATTENDANCE_POLICY when the table is empty/missing.
 */
export async function resolveAttendancePolicyForDate(
  admin: SupabaseClient,
  dateIso: string,
): Promise<{ policy: AttendancePolicy; row: AttendancePolicyRow | null; source: "db" | "default" }> {
  const { data, error } = await admin
    .from("attendance_policies")
    .select("*")
    .lte("effective_from", dateIso)
    .or(`effective_to.is.null,effective_to.gte.${dateIso}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { policy: DEFAULT_ATTENDANCE_POLICY, row: null, source: "default" };
  }

  const row = data as AttendancePolicyRow;
  return { policy: policyRowToAttendancePolicy(row), row, source: "db" };
}

export async function listAttendancePolicies(
  admin: SupabaseClient,
): Promise<AttendancePolicyRow[]> {
  const { data, error } = await admin
    .from("attendance_policies")
    .select("*")
    .order("effective_from", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as AttendancePolicyRow[];
}

export type AttendancePolicyInput = {
  name?: string;
  effectiveFrom: string;
  officeStartTime: string;
  officeEndTime: string;
  graceMinutes: number;
  minFullDayMinutes: number;
  minHalfDayMinutes: number;
  maxBreakMinutes: number;
  lateArrivalRule: LateArrivalRule;
  earlyExitRule: EarlyExitRule;
  missingCheckoutTreatment: MissingCheckoutTreatment;
  weeklyOffDays: number[];
  holidayTreatment: HolidayTreatment;
  wfhPolicy: WfhPolicy;
  permissionHourPolicy: PermissionHourPolicy;
  overtimeEligible: boolean;
  overtimeMinMinutes: number;
  overtimeRequiresApproval: boolean;
  attendanceRoundingRule: AttendanceRoundingRule;
  salaryDayMethod: SalaryDayMethod;
  configuredPayrollDays: number | null;
  notes?: string | null;
};

function dayBefore(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Create a new policy starting on `effectiveFrom`. Closes any currently open
 * policy (effective_to = day before) so history is preserved and locked payroll
 * can still resolve the prior policy by date.
 */
export async function createAttendancePolicyVersion(
  admin: SupabaseClient,
  input: AttendancePolicyInput,
  actorId: string | null,
): Promise<AttendancePolicyRow> {
  if (input.minHalfDayMinutes > input.minFullDayMinutes) {
    throw new Error("Minimum half-day minutes cannot exceed full-day minutes.");
  }
  if (input.salaryDayMethod === "configured_days" && !input.configuredPayrollDays) {
    throw new Error("Configured payroll days is required when salary-day method is configured_days.");
  }

  // Close open-ended policies before inserting the new one.
  const { data: openPolicies } = await admin
    .from("attendance_policies")
    .select("id, effective_from")
    .is("effective_to", null);

  for (const open of openPolicies ?? []) {
    const closeOn = dayBefore(input.effectiveFrom);
    if (closeOn < open.effective_from) {
      throw new Error(
        `New effective_from (${input.effectiveFrom}) must be after the current open policy start (${open.effective_from}).`,
      );
    }
    const { error: closeErr } = await admin
      .from("attendance_policies")
      .update({ effective_to: closeOn, updated_by: actorId })
      .eq("id", open.id);
    if (closeErr) throw new Error(closeErr.message);
  }

  const { data, error } = await admin
    .from("attendance_policies")
    .insert({
      name: input.name?.trim() || "Attendance policy",
      effective_from: input.effectiveFrom,
      effective_to: null,
      office_start_time: input.officeStartTime,
      office_end_time: input.officeEndTime,
      grace_minutes: input.graceMinutes,
      min_full_day_minutes: input.minFullDayMinutes,
      min_half_day_minutes: input.minHalfDayMinutes,
      max_break_minutes: input.maxBreakMinutes,
      late_arrival_rule: input.lateArrivalRule,
      early_exit_rule: input.earlyExitRule,
      missing_checkout_treatment: input.missingCheckoutTreatment,
      weekly_off_days: input.weeklyOffDays,
      holiday_treatment: input.holidayTreatment,
      wfh_policy: input.wfhPolicy,
      permission_hour_policy: input.permissionHourPolicy,
      overtime_eligible: input.overtimeEligible,
      overtime_min_minutes: input.overtimeMinMinutes,
      overtime_requires_approval: input.overtimeRequiresApproval,
      attendance_rounding_rule: input.attendanceRoundingRule,
      salary_day_method: input.salaryDayMethod,
      configured_payroll_days: input.configuredPayrollDays,
      notes: input.notes ?? null,
      created_by: actorId,
      updated_by: actorId,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as AttendancePolicyRow;
}
