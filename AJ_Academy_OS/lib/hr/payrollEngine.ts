/**
 * Server-side payroll calculation engine.
 * Deterministic: given the same inputs + policy snapshots, produces the same result.
 * Does not invent salary values — missing structures / unresolved issues become errors.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deriveAttendanceForDay,
  isWeeklyOffDay,
  type AttendancePolicy,
  type AttendanceRecordInput,
} from "@/lib/hr/attendanceStatus";
import { resolveAttendancePolicyForDate } from "@/lib/hr/attendancePolicy";
import {
  resolveSalaryStructureForDate,
  type SalaryStructureRow,
} from "@/lib/hr/salaryStructure";
import {
  resolvePayrollSettingsForDate,
  roundMoney,
  type PayrollSettingsRow,
} from "@/lib/hr/payrollSettings";
import {
  emptyAdjustmentTotals,
  loadApprovedAdjustments,
  summarizeApprovedAdjustments,
  type ApprovedAdjustmentTotals,
} from "@/lib/hr/salaryAdjustments";
import { isRecalculable } from "@/lib/hr/payrollWorkflow";

export const PAYROLL_CALCULATION_VERSION = 1;

export type PeriodBounds = { year: number; month: number; periodStart: string; periodEnd: string };

export function monthBounds(year: number, month: number): PeriodBounds {
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { year, month, periodStart, periodEnd };
}

function eachDate(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${startIso}T12:00:00Z`);
  const end = new Date(`${endIso}T12:00:00Z`);
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export type AttendanceTotals = {
  calendarDays: number;
  workingDays: number;
  weeklyOffs: number;
  holidays: number;
  presentDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  halfDays: number;
  absentDays: number;
  missingAttendanceDays: number;
  payableDays: number;
  overtimeHours: number;
  unresolvedMissingCheckouts: number;
};

export type EmployeeCalcResult = {
  employeeId: string;
  salaryStructureId: string | null;
  status: "calculated" | "excluded" | "error";
  errorMessage: string | null;
  attendance: AttendanceTotals;
  earnings: {
    earnedBasic: number;
    earnedHra: number;
    earnedAllowances: number;
    incentives: number;
    bonus: number;
    overtimeAmount: number;
    reimbursements: number;
    arrears: number;
    otherEarnings: number;
    grossEarnings: number;
  };
  deductions: {
    lossOfPay: number;
    absenceDeduction: number;
    lateDeduction: number;
    earlyExitDeduction: number;
    fixedDeductions: number;
    advanceRecovery: number;
    loanRecovery: number;
    penalty: number;
    statutoryDeductions: number;
    otherDeductions: number;
    totalDeductions: number;
  };
  netSalary: number;
  inputSnapshot: Record<string, unknown>;
  componentBreakdown: Record<string, unknown>;
  calculationErrors: string[];
};

type LeaveDay = { date: string; paid: boolean; half: boolean; countsAsPresence: boolean };

function divisorDays(settings: PayrollSettingsRow, attendance: AttendanceTotals): number {
  switch (settings.salary_day_method) {
    case "calendar_days":
      return Math.max(1, attendance.calendarDays);
    case "working_days":
      return Math.max(1, attendance.workingDays);
    case "configured_days":
      return Math.max(1, Number(settings.configured_payroll_days) || attendance.workingDays || 30);
    case "fixed_30":
    default:
      return 30;
  }
}

function proRate(amount: number, payable: number, divisor: number): number {
  if (divisor <= 0) return 0;
  return (amount * payable) / divisor;
}

export async function buildAttendanceTotalsForEmployee(
  admin: SupabaseClient,
  employeeId: string,
  periodStart: string,
  periodEnd: string,
  policy: AttendancePolicy,
): Promise<{ totals: AttendanceTotals; dayDetails: Record<string, unknown>[] }> {
  const dates = eachDate(periodStart, periodEnd);
  const [{ data: records }, { data: holidays }, { data: leaves }] = await Promise.all([
    admin
      .from("attendance_records")
      .select(
        "id, attendance_date, check_in_time, check_out_time, total_working_minutes, status, location_type",
      )
      .eq("employee_id", employeeId)
      .gte("attendance_date", periodStart)
      .lte("attendance_date", periodEnd),
    admin.from("holidays").select("holiday_date, is_paid").gte("holiday_date", periodStart).lte("holiday_date", periodEnd),
    admin
      .from("leave_applications")
      .select("start_date, end_date, is_half_day, leave_types(is_paid, counts_as_presence)")
      .eq("employee_id", employeeId)
      .eq("status", "approved")
      .lte("start_date", periodEnd)
      .gte("end_date", periodStart),
  ]);

  const recordByDate = new Map(
    (records ?? []).map((r: AttendanceRecordInput & { id: string }) => [r.attendance_date, r]),
  );
  const holidaySet = new Map(
    (holidays ?? []).map((h: { holiday_date: string; is_paid: boolean }) => [h.holiday_date, h.is_paid]),
  );

  const leaveByDate = new Map<string, LeaveDay>();
  for (const app of leaves ?? []) {
    const rawLt = app.leave_types as
      | { is_paid: boolean; counts_as_presence: boolean }
      | { is_paid: boolean; counts_as_presence: boolean }[]
      | null;
    const lt = Array.isArray(rawLt) ? rawLt[0] ?? null : rawLt;
    const start = app.start_date as string;
    const end = app.end_date as string;
    for (const d of eachDate(start, end)) {
      if (d < periodStart || d > periodEnd) continue;
      leaveByDate.set(d, {
        date: d,
        paid: !!lt?.is_paid,
        half: !!app.is_half_day,
        countsAsPresence: !!lt?.counts_as_presence,
      });
    }
  }

  const totals: AttendanceTotals = {
    calendarDays: dates.length,
    workingDays: 0,
    weeklyOffs: 0,
    holidays: 0,
    presentDays: 0,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    halfDays: 0,
    absentDays: 0,
    missingAttendanceDays: 0,
    payableDays: 0,
    overtimeHours: 0,
    unresolvedMissingCheckouts: 0,
  };

  const dayDetails: Record<string, unknown>[] = [];

  for (const date of dates) {
    const isHoliday = holidaySet.has(date);
    const weeklyOff = isWeeklyOffDay(date, policy.weeklyOffDays);
    const leave = leaveByDate.get(date) ?? null;
    const record = recordByDate.get(date) ?? null;

    const derived = deriveAttendanceForDay(
      record,
      {
        isHoliday,
        isWeeklyOff: weeklyOff,
        approvedLeave: leave && !leave.countsAsPresence ? { paid: leave.paid } : null,
        approvedWfh: leave?.countsAsPresence === true,
      },
      policy,
    );

    if (weeklyOff && !record) totals.weeklyOffs += 1;
    else if (isHoliday && !record) totals.holidays += 1;
    else if (!weeklyOff && !isHoliday) totals.workingDays += 1;

    if (derived.status === "missing_checkout") {
      totals.unresolvedMissingCheckouts += 1;
      totals.missingAttendanceDays += 1;
    } else if (derived.status === "present" || derived.status === "work_from_home") {
      totals.presentDays += 1;
    } else if (derived.status === "half_day") {
      totals.halfDays += 0.5;
      totals.presentDays += 0.5;
    } else if (derived.status === "paid_leave") {
      totals.paidLeaveDays += leave?.half ? 0.5 : 1;
    } else if (derived.status === "unpaid_leave") {
      totals.unpaidLeaveDays += leave?.half ? 0.5 : 1;
    } else if (derived.status === "holiday") {
      // already counted
    } else if (derived.status === "weekly_off") {
      // already counted
    } else if (derived.status === "absent") {
      if (!weeklyOff && !isHoliday) totals.absentDays += 1;
    } else if (derived.status === "pending_review") {
      totals.missingAttendanceDays += 1;
    }

    if (derived.flags.includes("overtime") && policy.overtimeEligible) {
      const otMin = Math.max(0, derived.workingMinutes - policy.minFullDayMinutes);
      totals.overtimeHours += otMin / 60;
    }

    dayDetails.push({
      date,
      status: derived.status,
      flags: derived.flags,
      workingMinutes: derived.workingMinutes,
      needsReview: derived.needsReview,
    });
  }

  // Payable days: present + paid leave + holidays (if paid treatment) + weekly offs (for fixed_30 divisor methods
  // the engine uses divisor separately; payable is what the employee "earns" against).
  const holidayPayable =
    policy.holidayTreatment === "paid_holiday" ? totals.holidays : 0;
  totals.payableDays =
    totals.presentDays +
    totals.paidLeaveDays +
    holidayPayable +
    // Weekly offs are typically paid for monthly salaried staff under fixed_30 / calendar methods
    totals.weeklyOffs;

  // Cap payable days at calendar days to avoid overpay anomalies
  totals.payableDays = Math.min(totals.payableDays, totals.calendarDays);

  return { totals, dayDetails };
}

export function calculateEmployeePayroll(args: {
  employeeId: string;
  structure: SalaryStructureRow | null;
  settings: PayrollSettingsRow;
  policy: AttendancePolicy;
  attendance: AttendanceTotals;
  dayDetails: Record<string, unknown>[];
  adjustments?: ApprovedAdjustmentTotals;
}): EmployeeCalcResult {
  const {
    employeeId,
    structure,
    settings,
    policy,
    attendance,
    dayDetails,
    adjustments = emptyAdjustmentTotals(),
  } = args;
  const errors: string[] = [];

  if (!structure) {
    return {
      employeeId,
      salaryStructureId: null,
      status: "error",
      errorMessage: "No active salary structure for this period. Configure one before calculating payroll.",
      attendance,
      earnings: emptyEarnings(),
      deductions: emptyDeductions(),
      netSalary: 0,
      inputSnapshot: { attendance, dayDetails, policyId: policy.id },
      componentBreakdown: {},
      calculationErrors: ["missing_salary_structure"],
    };
  }

  if (structure.payroll_status === "excluded" || structure.payroll_status === "on_hold") {
    return {
      employeeId,
      salaryStructureId: structure.id,
      status: "excluded",
      errorMessage: `Employee payroll status is ${structure.payroll_status}.`,
      attendance,
      earnings: emptyEarnings(),
      deductions: emptyDeductions(),
      netSalary: 0,
      inputSnapshot: { structure, attendance, policyId: policy.id },
      componentBreakdown: {},
      calculationErrors: ["excluded"],
    };
  }

  if (settings.require_attendance_review_clearance && attendance.unresolvedMissingCheckouts > 0) {
    errors.push(
      `${attendance.unresolvedMissingCheckouts} unresolved missing check-out(s). Clear Attendance Review before finalizing (or disable clearance requirement in Payroll Settings).`,
    );
  }

  const divisor = divisorDays(settings, attendance);
  let payable = attendance.payableDays;

  // Unpaid leave and absences reduce payable relative to divisor for LOP
  const unpaidAndAbsent = attendance.unpaidLeaveDays + attendance.absentDays;
  // For monthly: earn for payable days; LOP = monthly_gross * unpaid_and_absent / divisor
  if (payable < 0) {
    errors.push("Negative payable days — check attendance/leave data.");
    payable = 0;
  }

  const basic = Number(structure.basic_salary) || 0;
  const hra = Number(structure.hra) || 0;
  const allowances =
    Number(structure.special_allowance || 0) +
    Number(structure.travel_allowance || 0) +
    Number(structure.communication_allowance || 0) +
    Number(structure.other_allowances || 0);
  const incentive = Number(structure.incentive) || 0;
  const fixedDed = Number(structure.fixed_deductions) || 0;
  const monthlyGross =
    Number(structure.monthly_gross) || basic + hra + allowances + incentive;

  let earnedBasic = 0;
  let earnedHra = 0;
  let earnedAllowances = 0;
  let earnedIncentive = 0;
  let lossOfPay = 0;
  let absenceDeduction = 0;

  if (structure.salary_type === "daily") {
    const rate = Number(structure.daily_rate) || monthlyGross;
    earnedBasic = roundMoney(rate * payable, settings.rounding_method);
  } else if (structure.salary_type === "hourly") {
    const rate = Number(structure.hourly_rate) || 0;
    const hours = (attendance.presentDays + attendance.halfDays) * (policy.minFullDayMinutes / 60);
    earnedBasic = roundMoney(rate * hours, settings.rounding_method);
  } else {
    // monthly / stipend / consultant / commission — pro-rate components
    earnedBasic = roundMoney(proRate(basic, payable, divisor), settings.rounding_method);
    earnedHra = roundMoney(proRate(hra, payable, divisor), settings.rounding_method);
    earnedAllowances = roundMoney(proRate(allowances, payable, divisor), settings.rounding_method);
    earnedIncentive = roundMoney(proRate(incentive, payable, divisor), settings.rounding_method);
    lossOfPay = roundMoney(proRate(monthlyGross, unpaidAndAbsent, divisor), settings.rounding_method);
    absenceDeduction = 0; // included in LOP
  }

  // Approved one-time adjustments (Phase 9) — pending adjustments never apply
  const adjIncentives = roundMoney(adjustments.incentives, settings.rounding_method);
  const adjBonus = roundMoney(adjustments.bonus, settings.rounding_method);
  const adjOvertime = roundMoney(adjustments.overtime, settings.rounding_method);
  const adjReimb = roundMoney(adjustments.reimbursements, settings.rounding_method);
  const adjArrears = roundMoney(adjustments.arrears, settings.rounding_method);
  const adjOtherEarn = roundMoney(adjustments.otherEarnings, settings.rounding_method);
  const adjAdvance = roundMoney(adjustments.advanceRecovery, settings.rounding_method);
  const adjLoan = roundMoney(adjustments.loanRecovery, settings.rounding_method);
  const adjPenalty = roundMoney(adjustments.penalty, settings.rounding_method);
  const adjOtherDed = roundMoney(adjustments.otherDeductions, settings.rounding_method);

  // Statutory — only if enabled AND verified; otherwise stay 0 with a label in snapshot
  let statutory = 0;
  if (settings.statutory_enabled && settings.statutory_label === "verified") {
    // Rules are company-specific; without verified rules we refuse to invent amounts.
    errors.push(
      "Statutory deductions are enabled and labelled verified, but no rule engine rates are configured in statutory_rules. Configure verified rates or set statutory_enabled=false.",
    );
  }

  const totalIncentives = earnedIncentive + adjIncentives;
  const gross =
    earnedBasic +
    earnedHra +
    earnedAllowances +
    totalIncentives +
    adjBonus +
    adjOvertime +
    adjReimb +
    adjArrears +
    adjOtherEarn;
  const totalDeductions =
    lossOfPay +
    absenceDeduction +
    fixedDed +
    statutory +
    adjAdvance +
    adjLoan +
    adjPenalty +
    adjOtherDed;
  let net = roundMoney(gross - totalDeductions, settings.rounding_method);

  if (net < 0) {
    errors.push(`Calculated net salary is negative (${net}). Review payable days and deductions.`);
    net = 0;
  }

  const status: EmployeeCalcResult["status"] =
    settings.require_attendance_review_clearance && attendance.unresolvedMissingCheckouts > 0
      ? "error"
      : errors.some((e) => e.toLowerCase().includes("negative"))
        ? "error"
        : "calculated";

  return {
    employeeId,
    salaryStructureId: structure.id,
    status,
    errorMessage: errors.length ? errors.join(" ") : null,
    attendance,
    earnings: {
      earnedBasic,
      earnedHra,
      earnedAllowances,
      incentives: totalIncentives,
      bonus: adjBonus,
      overtimeAmount: adjOvertime,
      reimbursements: adjReimb,
      arrears: adjArrears,
      otherEarnings: adjOtherEarn,
      grossEarnings: gross,
    },
    deductions: {
      lossOfPay,
      absenceDeduction,
      lateDeduction: 0,
      earlyExitDeduction: 0,
      fixedDeductions: fixedDed,
      advanceRecovery: adjAdvance,
      loanRecovery: adjLoan,
      penalty: adjPenalty,
      statutoryDeductions: statutory,
      otherDeductions: adjOtherDed,
      totalDeductions,
    },
    netSalary: net,
    inputSnapshot: {
      structure,
      attendance,
      dayDetails,
      policyId: policy.id,
      settingsId: settings.id,
      divisor,
      payable,
      unpaidAndAbsent,
      statutoryLabel: settings.statutory_label,
      statutoryEnabled: settings.statutory_enabled,
      approvedAdjustments: adjustments.rows.map((r) => ({
        id: r.id,
        type: r.adjustment_type,
        direction: r.direction,
        amount: r.amount,
        reason: r.reason,
      })),
      calculationVersion: PAYROLL_CALCULATION_VERSION,
    },
    componentBreakdown: {
      basic,
      hra,
      allowances,
      incentive,
      monthlyGross,
      earnedBasic,
      earnedHra,
      earnedAllowances,
      earnedIncentive,
      adjustments: {
        incentives: adjIncentives,
        bonus: adjBonus,
        overtime: adjOvertime,
        reimbursements: adjReimb,
        arrears: adjArrears,
        otherEarnings: adjOtherEarn,
        advance: adjAdvance,
        loan: adjLoan,
        penalty: adjPenalty,
        otherDeductions: adjOtherDed,
      },
      lossOfPay,
      fixedDed,
    },
    calculationErrors: errors,
  };
}

function emptyEarnings() {
  return {
    earnedBasic: 0,
    earnedHra: 0,
    earnedAllowances: 0,
    incentives: 0,
    bonus: 0,
    overtimeAmount: 0,
    reimbursements: 0,
    arrears: 0,
    otherEarnings: 0,
    grossEarnings: 0,
  };
}

function emptyDeductions() {
  return {
    lossOfPay: 0,
    absenceDeduction: 0,
    lateDeduction: 0,
    earlyExitDeduction: 0,
    fixedDeductions: 0,
    advanceRecovery: 0,
    loanRecovery: 0,
    penalty: 0,
    statutoryDeductions: 0,
    otherDeductions: 0,
    totalDeductions: 0,
  };
}

/**
 * Ensure a payroll period exists for year/month, then calculate (or recalculate) all
 * active employees. Refuses to recalculate locked/paid/approved periods.
 */
export async function runPayrollCalculation(
  admin: SupabaseClient,
  year: number,
  month: number,
  actorId: string | null,
): Promise<{
  periodId: string;
  status: string;
  results: EmployeeCalcResult[];
  summary: {
    employees: number;
    calculated: number;
    errors: number;
    excluded: number;
    totalGross: number;
    totalNet: number;
  };
}> {
  const bounds = monthBounds(year, month);
  const settings = await resolvePayrollSettingsForDate(admin, bounds.periodEnd);
  if (!settings) {
    throw new Error(
      "No payroll settings found for this period. Run hr_payroll_06_payroll_settings.sql and configure Payroll Settings.",
    );
  }

  const { policy, row: policyRow } = await resolveAttendancePolicyForDate(admin, bounds.periodEnd);

  // Load or create period
  let { data: period } = await admin
    .from("payroll_periods")
    .select("*")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (period && !isRecalculable(period.status)) {
    throw new Error(
      `Payroll ${year}-${String(month).padStart(2, "0")} is ${period.status} and cannot be recalculated. Reopen (super admin) first.`,
    );
  }

  if (!period) {
    const { data: created, error } = await admin
      .from("payroll_periods")
      .insert({
        year,
        month,
        period_start: bounds.periodStart,
        period_end: bounds.periodEnd,
        status: "draft",
        payroll_settings_id: settings.id,
        attendance_policy_id: policyRow?.id ?? null,
        settings_snapshot: settings,
        policy_snapshot: policy,
        created_by: actorId,
        updated_by: actorId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    period = created;
  } else {
    await admin
      .from("payroll_periods")
      .update({
        payroll_settings_id: settings.id,
        attendance_policy_id: policyRow?.id ?? null,
        settings_snapshot: settings,
        policy_snapshot: policy,
        updated_by: actorId,
      })
      .eq("id", period.id);
  }

  const approvedAdjustments = await loadApprovedAdjustments(admin, year, month);
  // Link any approved adjustments that don't yet have a period id
  if (approvedAdjustments.length) {
    await admin
      .from("salary_adjustments")
      .update({ payroll_period_id: period.id })
      .eq("year", year)
      .eq("month", month)
      .eq("status", "approved")
      .is("payroll_period_id", null);
  }
  const adjustmentsByEmployee = new Map<string, typeof approvedAdjustments>();
  for (const adj of approvedAdjustments) {
    const list = adjustmentsByEmployee.get(adj.employee_id) ?? [];
    list.push(adj);
    adjustmentsByEmployee.set(adj.employee_id, list);
  }

  const { data: employees, error: empErr } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("role", "employee")
    .eq("status", "active");
  if (empErr) throw new Error(empErr.message);

  const results: EmployeeCalcResult[] = [];

  for (const emp of employees ?? []) {
    const structure = await resolveSalaryStructureForDate(admin, emp.id, bounds.periodEnd);
    const { totals, dayDetails } = await buildAttendanceTotalsForEmployee(
      admin,
      emp.id,
      bounds.periodStart,
      bounds.periodEnd,
      policy,
    );
    const empAdj = summarizeApprovedAdjustments(adjustmentsByEmployee.get(emp.id) ?? []);
    const calc = calculateEmployeePayroll({
      employeeId: emp.id,
      structure,
      settings,
      policy,
      attendance: totals,
      dayDetails,
      adjustments: empAdj,
    });
    results.push(calc);

    const row = {
      payroll_period_id: period.id,
      employee_id: emp.id,
      salary_structure_id: calc.salaryStructureId,
      calendar_days: calc.attendance.calendarDays,
      working_days: calc.attendance.workingDays,
      weekly_offs: calc.attendance.weeklyOffs,
      holidays: calc.attendance.holidays,
      present_days: calc.attendance.presentDays,
      paid_leave_days: calc.attendance.paidLeaveDays,
      unpaid_leave_days: calc.attendance.unpaidLeaveDays,
      half_days: calc.attendance.halfDays,
      absent_days: calc.attendance.absentDays,
      missing_attendance_days: calc.attendance.missingAttendanceDays,
      payable_days: calc.attendance.payableDays,
      overtime_hours: calc.attendance.overtimeHours,
      earned_basic: calc.earnings.earnedBasic,
      earned_hra: calc.earnings.earnedHra,
      earned_allowances: calc.earnings.earnedAllowances,
      incentives: calc.earnings.incentives,
      bonus: calc.earnings.bonus,
      overtime_amount: calc.earnings.overtimeAmount,
      reimbursements: calc.earnings.reimbursements,
      arrears: calc.earnings.arrears,
      other_earnings: calc.earnings.otherEarnings,
      gross_earnings: calc.earnings.grossEarnings,
      loss_of_pay: calc.deductions.lossOfPay,
      absence_deduction: calc.deductions.absenceDeduction,
      late_deduction: calc.deductions.lateDeduction,
      early_exit_deduction: calc.deductions.earlyExitDeduction,
      fixed_deductions: calc.deductions.fixedDeductions,
      advance_recovery: calc.deductions.advanceRecovery,
      loan_recovery: calc.deductions.loanRecovery,
      penalty: calc.deductions.penalty,
      statutory_deductions: calc.deductions.statutoryDeductions,
      other_deductions: calc.deductions.otherDeductions,
      total_deductions: calc.deductions.totalDeductions,
      net_salary: calc.netSalary,
      input_snapshot: calc.inputSnapshot,
      component_breakdown: calc.componentBreakdown,
      calculation_version: PAYROLL_CALCULATION_VERSION,
      calculation_errors: calc.calculationErrors,
      status: calc.status,
      error_message: calc.errorMessage,
    };

    const { error: upsertErr } = await admin
      .from("payroll_items")
      .upsert(row, { onConflict: "payroll_period_id,employee_id" });
    if (upsertErr) throw new Error(`Failed to save payroll item for ${emp.id}: ${upsertErr.message}`);
  }

  const nextVersion = Number(period.calculation_version || 1) + (period.calculated_at ? 1 : 0);
  await admin
    .from("payroll_periods")
    .update({
      status: "calculated",
      calculation_version: nextVersion || 1,
      calculated_at: new Date().toISOString(),
      calculated_by: actorId,
      updated_by: actorId,
    })
    .eq("id", period.id);

  const summary = {
    employees: results.length,
    calculated: results.filter((r) => r.status === "calculated").length,
    errors: results.filter((r) => r.status === "error").length,
    excluded: results.filter((r) => r.status === "excluded").length,
    totalGross: results.reduce((s, r) => s + r.earnings.grossEarnings, 0),
    totalNet: results.reduce((s, r) => s + r.netSalary, 0),
  };

  return { periodId: period.id, status: "calculated", results, summary };
}
