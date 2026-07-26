import type { SupabaseClient } from "@supabase/supabase-js";

export const ADDITION_TYPES = [
  "performance_incentive",
  "sales_incentive",
  "bonus",
  "overtime",
  "arrears",
  "travel_reimbursement",
  "food_reimbursement",
  "other_reimbursement",
  "other_addition",
] as const;

export const DEDUCTION_TYPES = [
  "salary_advance",
  "loan_recovery",
  "penalty",
  "attendance_deduction",
  "asset_recovery",
  "other_deduction",
] as const;

export type AdjustmentType = (typeof ADDITION_TYPES)[number] | (typeof DEDUCTION_TYPES)[number];
export type AdjustmentDirection = "addition" | "deduction";

export type SalaryAdjustmentRow = {
  id: string;
  employee_id: string;
  payroll_period_id: string | null;
  year: number;
  month: number;
  adjustment_type: AdjustmentType;
  direction: AdjustmentDirection;
  amount: number;
  reason: string;
  supporting_document_url: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  review_remarks: string | null;
  created_at: string;
};

export function directionForType(type: AdjustmentType): AdjustmentDirection {
  return (DEDUCTION_TYPES as readonly string[]).includes(type) ? "deduction" : "addition";
}

export type ApprovedAdjustmentTotals = {
  additions: number;
  deductions: number;
  bonus: number;
  incentives: number;
  overtime: number;
  reimbursements: number;
  arrears: number;
  otherEarnings: number;
  advanceRecovery: number;
  loanRecovery: number;
  penalty: number;
  otherDeductions: number;
  rows: SalaryAdjustmentRow[];
};

export function emptyAdjustmentTotals(): ApprovedAdjustmentTotals {
  return {
    additions: 0,
    deductions: 0,
    bonus: 0,
    incentives: 0,
    overtime: 0,
    reimbursements: 0,
    arrears: 0,
    otherEarnings: 0,
    advanceRecovery: 0,
    loanRecovery: 0,
    penalty: 0,
    otherDeductions: 0,
    rows: [],
  };
}

export function summarizeApprovedAdjustments(rows: SalaryAdjustmentRow[]): ApprovedAdjustmentTotals {
  const totals = emptyAdjustmentTotals();
  totals.rows = rows;
  for (const r of rows) {
    const amt = Number(r.amount) || 0;
    if (r.direction === "addition") {
      totals.additions += amt;
      switch (r.adjustment_type) {
        case "bonus":
          totals.bonus += amt;
          break;
        case "performance_incentive":
        case "sales_incentive":
          totals.incentives += amt;
          break;
        case "overtime":
          totals.overtime += amt;
          break;
        case "arrears":
          totals.arrears += amt;
          break;
        case "travel_reimbursement":
        case "food_reimbursement":
        case "other_reimbursement":
          totals.reimbursements += amt;
          break;
        default:
          totals.otherEarnings += amt;
      }
    } else {
      totals.deductions += amt;
      switch (r.adjustment_type) {
        case "salary_advance":
          totals.advanceRecovery += amt;
          break;
        case "loan_recovery":
          totals.loanRecovery += amt;
          break;
        case "penalty":
        case "attendance_deduction":
          totals.penalty += amt;
          break;
        default:
          totals.otherDeductions += amt;
      }
    }
  }
  return totals;
}

export async function loadApprovedAdjustments(
  admin: SupabaseClient,
  year: number,
  month: number,
  employeeId?: string,
): Promise<SalaryAdjustmentRow[]> {
  let query = admin
    .from("salary_adjustments")
    .select("*")
    .eq("year", year)
    .eq("month", month)
    .eq("status", "approved");
  if (employeeId) query = query.eq("employee_id", employeeId);
  const { data, error } = await query;
  if (error) {
    if (/does not exist/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as SalaryAdjustmentRow[];
}
