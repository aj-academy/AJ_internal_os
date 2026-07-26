import type { SupabaseClient } from "@supabase/supabase-js";

export type SalaryType =
  | "monthly"
  | "daily"
  | "hourly"
  | "intern_stipend"
  | "consultant"
  | "commission";

export type SalaryPayrollStatus = "active" | "excluded" | "on_hold";

export type SalaryStructureRow = {
  id: string;
  employee_id: string;
  salary_type: SalaryType;
  payroll_status: SalaryPayrollStatus;
  effective_from: string;
  effective_to: string | null;
  currency: string;
  monthly_gross: number;
  annual_ctc: number | null;
  basic_salary: number;
  hra: number;
  special_allowance: number;
  travel_allowance: number;
  communication_allowance: number;
  incentive: number;
  other_allowances: number;
  fixed_deductions: number;
  daily_rate: number | null;
  hourly_rate: number | null;
  change_reason: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SalaryStructureInput = {
  employeeId: string;
  salaryType: SalaryType;
  payrollStatus: SalaryPayrollStatus;
  effectiveFrom: string;
  currency?: string;
  monthlyGross: number;
  annualCtc?: number | null;
  basicSalary: number;
  hra: number;
  specialAllowance: number;
  travelAllowance: number;
  communicationAllowance: number;
  incentive: number;
  otherAllowances: number;
  fixedDeductions: number;
  dailyRate?: number | null;
  hourlyRate?: number | null;
  changeReason: string;
  notes?: string | null;
};

function dayBefore(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function sumComponents(input: {
  basicSalary: number;
  hra: number;
  specialAllowance: number;
  travelAllowance: number;
  communicationAllowance: number;
  incentive: number;
  otherAllowances: number;
}): number {
  return (
    Number(input.basicSalary || 0) +
    Number(input.hra || 0) +
    Number(input.specialAllowance || 0) +
    Number(input.travelAllowance || 0) +
    Number(input.communicationAllowance || 0) +
    Number(input.incentive || 0) +
    Number(input.otherAllowances || 0)
  );
}

export async function resolveSalaryStructureForDate(
  admin: SupabaseClient,
  employeeId: string,
  dateIso: string,
): Promise<SalaryStructureRow | null> {
  const { data, error } = await admin
    .from("employee_salary_structures")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("payroll_status", "active")
    .lte("effective_from", dateIso)
    .or(`effective_to.is.null,effective_to.gte.${dateIso}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SalaryStructureRow) ?? null;
}

export async function createSalaryStructureVersion(
  admin: SupabaseClient,
  input: SalaryStructureInput,
  actorId: string | null,
): Promise<SalaryStructureRow> {
  if (!input.changeReason?.trim()) {
    throw new Error("A change reason is required when creating or revising a salary structure.");
  }
  if (!input.effectiveFrom) throw new Error("effectiveFrom is required.");

  const componentSum = sumComponents(input);
  if (input.salaryType === "monthly" && input.monthlyGross <= 0 && componentSum <= 0) {
    throw new Error("Provide monthly gross or component amounts greater than zero.");
  }

  const monthlyGross =
    input.monthlyGross > 0 ? input.monthlyGross : componentSum > 0 ? componentSum : 0;

  const { data: openRows } = await admin
    .from("employee_salary_structures")
    .select("id, effective_from")
    .eq("employee_id", input.employeeId)
    .is("effective_to", null);

  for (const open of openRows ?? []) {
    const closeOn = dayBefore(input.effectiveFrom);
    if (closeOn < open.effective_from) {
      throw new Error(
        `New effective_from (${input.effectiveFrom}) must be after the current open structure start (${open.effective_from}).`,
      );
    }
    const { error: closeErr } = await admin
      .from("employee_salary_structures")
      .update({ effective_to: closeOn, updated_by: actorId })
      .eq("id", open.id);
    if (closeErr) throw new Error(closeErr.message);
  }

  const { data, error } = await admin
    .from("employee_salary_structures")
    .insert({
      employee_id: input.employeeId,
      salary_type: input.salaryType,
      payroll_status: input.payrollStatus,
      effective_from: input.effectiveFrom,
      effective_to: null,
      currency: input.currency || "INR",
      monthly_gross: monthlyGross,
      annual_ctc: input.annualCtc ?? (monthlyGross > 0 ? monthlyGross * 12 : null),
      basic_salary: input.basicSalary,
      hra: input.hra,
      special_allowance: input.specialAllowance,
      travel_allowance: input.travelAllowance,
      communication_allowance: input.communicationAllowance,
      incentive: input.incentive,
      other_allowances: input.otherAllowances,
      fixed_deductions: input.fixedDeductions,
      daily_rate: input.dailyRate ?? null,
      hourly_rate: input.hourlyRate ?? null,
      change_reason: input.changeReason.trim(),
      notes: input.notes ?? null,
      created_by: actorId,
      updated_by: actorId,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as SalaryStructureRow;
}
