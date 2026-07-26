/**
 * Pure, deterministic attendance-day derivation used by the Attendance Review
 * queue and (later) the payroll engine. No database access, no mock data.
 *
 * Callers should pass a policy resolved for the attendance date (Phase 2
 * attendance_policies) so history stays reproducible. Nothing here computes salary.
 */

export type DerivedAttendanceStatus =
  | "present"
  | "half_day"
  | "absent"
  | "weekly_off"
  | "holiday"
  | "paid_leave"
  | "unpaid_leave"
  | "work_from_home"
  | "permission"
  | "missing_checkout"
  | "pending_review";

export type LateArrivalRule = "mark_late" | "ignore" | "deduct_half_day" | "send_to_review";
export type EarlyExitRule = "mark_early_exit" | "ignore" | "deduct_half_day" | "send_to_review";
export type MissingCheckoutTreatment =
  | "send_to_review"
  | "assume_standard_hours"
  | "mark_absent"
  | "mark_half_day";
export type HolidayTreatment = "paid_holiday" | "unpaid" | "working_day";
export type WfhPolicy = "allowed" | "allowed_with_approval" | "not_allowed";
export type PermissionHourPolicy = "track_only" | "deduct_from_hours" | "send_to_review";
export type AttendanceRoundingRule = "none" | "nearest_15" | "nearest_30" | "ceil_15" | "floor_15";
export type SalaryDayMethod = "calendar_days" | "fixed_30" | "working_days" | "configured_days";

export type AttendancePolicy = {
  id?: string | null;
  name?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  /** "HH:MM" 24h */
  standardCheckInTime: string;
  standardCheckOutTime: string;
  graceMinutes: number;
  /** Arrival later than this counts as late (start + grace). "HH:MM" */
  lateAfterTime: string;
  minFullDayMinutes: number;
  minHalfDayMinutes: number;
  maxBreakMinutes: number;
  lateArrivalRule: LateArrivalRule;
  earlyExitRule: EarlyExitRule;
  missingCheckoutTreatment: MissingCheckoutTreatment;
  /** 0=Sunday ... 6=Saturday */
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
};

/** Clearly-labelled fallback when no DB policy is configured yet. */
export const DEFAULT_ATTENDANCE_POLICY: AttendancePolicy = {
  id: null,
  name: "Built-in default (no DB policy)",
  effectiveFrom: null,
  effectiveTo: null,
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

export type AttendanceRecordInput = {
  attendance_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  total_working_minutes: number | null;
  status?: string | null;
  location_type?: string | null;
};

export type DayContext = {
  isHoliday?: boolean;
  isWeeklyOff?: boolean;
  approvedLeave?: { paid: boolean } | null;
  approvedWfh?: boolean;
  approvedPermission?: boolean;
};

export type DerivedAttendance = {
  status: DerivedAttendanceStatus;
  workingMinutes: number;
  isLate: boolean;
  isEarlyExit: boolean;
  missingCheckIn: boolean;
  missingCheckout: boolean;
  needsReview: boolean;
  flags: string[];
  policyId: string | null;
};

function minutesOfDay(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => Number.parseInt(n, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function minutesToHhmm(total: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.floor(total)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function computeLateAfterTime(startHhmm: string, graceMinutes: number): string {
  return minutesToHhmm(hhmmToMinutes(startHhmm) + Math.max(0, graceMinutes));
}

export function isWeeklyOffDay(dateIso: string, weeklyOffDays: number[]): boolean {
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  return weeklyOffDays.includes(d.getDay());
}

function isWfhLocation(locationType: string | null | undefined): boolean {
  if (!locationType) return false;
  const t = locationType.trim().toLowerCase();
  return t === "wfh" || t === "remote" || t === "work from home";
}

function applyRounding(minutes: number, rule: AttendanceRoundingRule): number {
  if (rule === "none" || minutes <= 0) return minutes;
  if (rule === "nearest_15") return Math.round(minutes / 15) * 15;
  if (rule === "nearest_30") return Math.round(minutes / 30) * 30;
  if (rule === "ceil_15") return Math.ceil(minutes / 15) * 15;
  if (rule === "floor_15") return Math.floor(minutes / 15) * 15;
  return minutes;
}

/**
 * Derive the effective attendance status for a single employee-day.
 * `record` is the attendance row for that day (or null if none exists).
 */
export function deriveAttendanceForDay(
  record: AttendanceRecordInput | null,
  context: DayContext = {},
  policy: AttendancePolicy = DEFAULT_ATTENDANCE_POLICY,
): DerivedAttendance {
  const flags: string[] = [];
  const policyId = policy.id ?? null;

  const weeklyOff =
    context.isWeeklyOff === true ||
    (context.isWeeklyOff !== false &&
      !!record?.attendance_date &&
      isWeeklyOffDay(record.attendance_date, policy.weeklyOffDays));

  const base: DerivedAttendance = {
    status: "absent",
    workingMinutes: 0,
    isLate: false,
    isEarlyExit: false,
    missingCheckIn: false,
    missingCheckout: false,
    needsReview: false,
    flags,
    policyId,
  };

  const hasCheckIn = !!record?.check_in_time;
  const hasCheckOut = !!record?.check_out_time;

  // No physical attendance for the day — resolve from calendar/leave context.
  if (!hasCheckIn && !hasCheckOut) {
    if (context.isHoliday) {
      if (policy.holidayTreatment === "working_day") return { ...base, status: "absent" };
      return { ...base, status: "holiday" };
    }
    if (weeklyOff) return { ...base, status: "weekly_off" };
    if (context.approvedLeave) {
      return { ...base, status: context.approvedLeave.paid ? "paid_leave" : "unpaid_leave" };
    }
    if (context.approvedWfh) return { ...base, status: "work_from_home" };
    if (context.approvedPermission) return { ...base, status: "permission" };
    return { ...base, status: "absent" };
  }

  // Checked in but never checked out.
  if (hasCheckIn && !hasCheckOut) {
    flags.push("missing_checkout");
    const treatment = policy.missingCheckoutTreatment;
    if (treatment === "send_to_review") {
      return {
        ...base,
        status: "missing_checkout",
        missingCheckout: true,
        needsReview: true,
      };
    }
    if (treatment === "mark_absent") {
      return { ...base, status: "absent", missingCheckout: true };
    }
    if (treatment === "mark_half_day") {
      return {
        ...base,
        status: "half_day",
        workingMinutes: policy.minHalfDayMinutes,
        missingCheckout: true,
      };
    }
    // assume_standard_hours
    return {
      ...base,
      status: "present",
      workingMinutes: policy.minFullDayMinutes,
      missingCheckout: true,
      flags: [...flags, "assumed_standard_hours"],
    };
  }

  // Checkout without check-in (data anomaly) → needs review.
  if (!hasCheckIn && hasCheckOut) {
    flags.push("missing_checkin");
    return {
      ...base,
      status: "pending_review",
      missingCheckIn: true,
      needsReview: true,
    };
  }

  // Full attendance: compute hours + late/early flags.
  let workingMinutes = record?.total_working_minutes ?? 0;
  if ((!workingMinutes || workingMinutes <= 0) && record?.check_in_time && record?.check_out_time) {
    const diff = new Date(record.check_out_time).getTime() - new Date(record.check_in_time).getTime();
    workingMinutes = diff > 0 ? Math.ceil(diff / 60000) : 0;
  }
  workingMinutes = applyRounding(workingMinutes, policy.attendanceRoundingRule);

  const lateAfter = policy.lateAfterTime || computeLateAfterTime(policy.standardCheckInTime, policy.graceMinutes);
  const inMin = minutesOfDay(record?.check_in_time ?? null);
  const outMin = minutesOfDay(record?.check_out_time ?? null);
  let isLate = inMin != null && inMin > hhmmToMinutes(lateAfter);
  let isEarlyExit = outMin != null && outMin < hhmmToMinutes(policy.standardCheckOutTime);

  if (isLate && policy.lateArrivalRule === "ignore") isLate = false;
  if (isEarlyExit && policy.earlyExitRule === "ignore") isEarlyExit = false;

  if (isLate) flags.push("late");
  if (isEarlyExit) flags.push("early_exit");

  let needsReview = false;
  if (isLate && policy.lateArrivalRule === "send_to_review") needsReview = true;
  if (isEarlyExit && policy.earlyExitRule === "send_to_review") needsReview = true;

  let status: DerivedAttendanceStatus;
  if (workingMinutes >= policy.minFullDayMinutes) {
    status = "present";
  } else if (workingMinutes >= policy.minHalfDayMinutes) {
    status = "half_day";
    flags.push("short_hours");
  } else {
    status = "half_day";
    flags.push("below_half_day");
  }

  if (isLate && policy.lateArrivalRule === "deduct_half_day" && status === "present") {
    status = "half_day";
    flags.push("late_half_day");
  }
  if (isEarlyExit && policy.earlyExitRule === "deduct_half_day" && status === "present") {
    status = "half_day";
    flags.push("early_exit_half_day");
  }

  if (
    policy.overtimeEligible &&
    workingMinutes > policy.minFullDayMinutes + policy.overtimeMinMinutes
  ) {
    flags.push("overtime");
  }

  if (isWfhLocation(record?.location_type)) {
    flags.push("wfh_location");
  }

  return {
    status,
    workingMinutes,
    isLate,
    isEarlyExit,
    missingCheckIn: false,
    missingCheckout: false,
    needsReview,
    flags,
    policyId,
  };
}
