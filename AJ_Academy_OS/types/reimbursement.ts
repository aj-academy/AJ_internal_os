import type { ReimbursementBill } from "@/lib/reimbursementBills";

export type ReimbursementTabId =
  | "overview"
  | "all"
  | "pending"
  | "special"
  | "reimbursed"
  | "policy"
  | "reports";

export type ReimbursementApprovalStatus =
  | "Draft"
  | "Pending"
  | "Approved"
  | "Rejected"
  | "Special Approval Required"
  | "Reimbursed";

export interface ReimbursementPolicySettings {
  id: string;
  low_budget_limit: number;
  standard_limit: number;
  allow_special_approval: boolean;
  max_file_size_mb: number;
  processing_days: number;
  approval_required: boolean;
  allowed_categories: string;
  updated_at: string;
}

export interface ReimbursementClaimRow {
  id: string;
  claim_code: string | null;
  employee_id: string;
  expense_type: string | null;
  category: string | null;
  budget_type: string | null;
  amount: number;
  expense_date: string;
  payment_method: string | null;
  receipt_url: string | null;
  bill_urls?: ReimbursementBill[];
  reason: string | null;
  approval_status: ReimbursementApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}
