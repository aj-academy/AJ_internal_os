import type { ReimbursementClaimRow, ReimbursementPolicySettings } from "@/types/reimbursement";

export const REIMBURSEMENT_CLAIM_SELECT =
  "id,claim_code,employee_id,expense_type,category,budget_type,amount,expense_date,payment_method,receipt_url,bill_urls,reason,approval_status,approved_by,approved_at,rejection_reason,created_at,updated_at";

export const DEFAULT_REIMBURSEMENT_CATEGORIES = [
  "Travel",
  "Food",
  "Client Meeting",
  "Office Purchase",
  "Internet",
  "Software",
  "Printing",
] as const;

export const BUDGET_TYPES = ["Low Budget", "Standard"] as const;

export function formatInr(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function randClaimSuffix() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function makeReimbursementCode() {
  return `RMB-${todayISO().replace(/-/g, "")}-${randClaimSuffix()}`;
}

export function parseCategories(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getBudgetLimit(policy: ReimbursementPolicySettings, budgetType: string | null | undefined) {
  return budgetType === "Standard" ? Number(policy.standard_limit) : Number(policy.low_budget_limit);
}

export function getLimitLabel(
  claim: Pick<ReimbursementClaimRow, "amount" | "budget_type">,
  policy: ReimbursementPolicySettings,
): "Over Limit" | "Within Limit" {
  const limit = getBudgetLimit(policy, claim.budget_type);
  return Number(claim.amount) > limit ? "Over Limit" : "Within Limit";
}

export function resolveInitialClaimStatus(
  amount: number,
  budgetType: string,
  policy: ReimbursementPolicySettings,
): ReimbursementClaimRow["approval_status"] {
  const limit = getBudgetLimit(policy, budgetType);
  if (amount > limit && policy.allow_special_approval) {
    return "Special Approval Required";
  }
  return "Pending";
}

export function formatSubmittedAt(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isMissingReimbursementSchema(msg: string) {
  const m = msg.toLowerCase();
  return (
    m.includes("expense_claims") ||
    m.includes("reimbursement_policy") ||
    m.includes("pgrst205")
  );
}

export const STATUS_BADGE_CLASS: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-700 border-slate-200",
  Pending: "bg-amber-100 text-amber-800 border-amber-200",
  Approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Rejected: "bg-rose-100 text-rose-800 border-rose-200",
  "Special Approval Required": "bg-violet-100 text-violet-800 border-violet-200",
  Reimbursed: "bg-blue-100 text-blue-800 border-blue-200",
};
