import type { SupabaseClient } from "@supabase/supabase-js";
import type { SalaryDayMethod } from "@/lib/hr/attendanceStatus";

export type RoundingMethod = "none" | "nearest_rupee" | "floor_rupee" | "ceil_rupee";

export type PayrollSettingsRow = {
  id: string;
  name: string;
  effective_from: string;
  effective_to: string | null;
  company_name: string;
  company_address: string | null;
  company_logo_url: string | null;
  currency: string;
  period_start_day: number;
  salary_payment_day: number;
  salary_day_method: SalaryDayMethod;
  configured_payroll_days: number | null;
  rounding_method: RoundingMethod;
  attendance_cutoff_day: number;
  leave_cutoff_day: number;
  adjustment_cutoff_day: number;
  payslip_number_prefix: string;
  payslip_number_format: string;
  require_attendance_review_clearance: boolean;
  auto_release_payslips_on_lock: boolean;
  notify_employees_on_release: boolean;
  statutory_enabled: boolean;
  statutory_label: string;
  statutory_rules: Record<string, unknown>;
  notes: string | null;
};

export type PayrollSettingsInput = {
  name?: string;
  effectiveFrom: string;
  companyName: string;
  companyAddress?: string | null;
  companyLogoUrl?: string | null;
  currency?: string;
  periodStartDay?: number;
  salaryPaymentDay?: number;
  salaryDayMethod: SalaryDayMethod;
  configuredPayrollDays?: number | null;
  roundingMethod?: RoundingMethod;
  attendanceCutoffDay?: number;
  leaveCutoffDay?: number;
  adjustmentCutoffDay?: number;
  payslipNumberPrefix?: string;
  payslipNumberFormat?: string;
  requireAttendanceReviewClearance?: boolean;
  autoReleasePayslipsOnLock?: boolean;
  notifyEmployeesOnRelease?: boolean;
  statutoryEnabled?: boolean;
  statutoryLabel?: string;
  statutoryRules?: Record<string, unknown>;
  notes?: string | null;
};

function dayBefore(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function resolvePayrollSettingsForDate(
  admin: SupabaseClient,
  dateIso: string,
): Promise<PayrollSettingsRow | null> {
  const { data, error } = await admin
    .from("payroll_settings")
    .select("*")
    .lte("effective_from", dateIso)
    .or(`effective_to.is.null,effective_to.gte.${dateIso}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PayrollSettingsRow) ?? null;
}

export async function createPayrollSettingsVersion(
  admin: SupabaseClient,
  input: PayrollSettingsInput,
  actorId: string | null,
): Promise<PayrollSettingsRow> {
  if (!input.companyName?.trim()) throw new Error("Company name is required.");
  if (input.salaryDayMethod === "configured_days" && !input.configuredPayrollDays) {
    throw new Error("Configured payroll days is required for that salary-day method.");
  }

  const { data: openRows } = await admin
    .from("payroll_settings")
    .select("id, effective_from")
    .is("effective_to", null);

  for (const open of openRows ?? []) {
    const closeOn = dayBefore(input.effectiveFrom);
    if (closeOn < open.effective_from) {
      throw new Error(
        `New effective_from (${input.effectiveFrom}) must be after the current open settings start (${open.effective_from}).`,
      );
    }
    const { error: closeErr } = await admin
      .from("payroll_settings")
      .update({ effective_to: closeOn, updated_by: actorId })
      .eq("id", open.id);
    if (closeErr) throw new Error(closeErr.message);
  }

  const { data, error } = await admin
    .from("payroll_settings")
    .insert({
      name: input.name?.trim() || "Payroll settings",
      effective_from: input.effectiveFrom,
      effective_to: null,
      company_name: input.companyName.trim(),
      company_address: input.companyAddress ?? null,
      company_logo_url: input.companyLogoUrl ?? null,
      currency: input.currency || "INR",
      period_start_day: input.periodStartDay ?? 1,
      salary_payment_day: input.salaryPaymentDay ?? 1,
      salary_day_method: input.salaryDayMethod,
      configured_payroll_days: input.configuredPayrollDays ?? null,
      rounding_method: input.roundingMethod ?? "nearest_rupee",
      attendance_cutoff_day: input.attendanceCutoffDay ?? 0,
      leave_cutoff_day: input.leaveCutoffDay ?? 0,
      adjustment_cutoff_day: input.adjustmentCutoffDay ?? 0,
      payslip_number_prefix: input.payslipNumberPrefix || "PSL",
      payslip_number_format: input.payslipNumberFormat || "{PREFIX}-{YYYY}{MM}-{SEQ4}",
      require_attendance_review_clearance: input.requireAttendanceReviewClearance !== false,
      auto_release_payslips_on_lock: !!input.autoReleasePayslipsOnLock,
      notify_employees_on_release: input.notifyEmployeesOnRelease !== false,
      statutory_enabled: !!input.statutoryEnabled,
      statutory_label: input.statutoryLabel || "not_verified",
      statutory_rules: input.statutoryRules || {},
      notes: input.notes ?? null,
      created_by: actorId,
      updated_by: actorId,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as PayrollSettingsRow;
}

export function roundMoney(amount: number, method: RoundingMethod): number {
  if (!Number.isFinite(amount)) return 0;
  if (method === "none") return Math.round(amount * 100) / 100;
  if (method === "floor_rupee") return Math.floor(amount);
  if (method === "ceil_rupee") return Math.ceil(amount);
  return Math.round(amount);
}
