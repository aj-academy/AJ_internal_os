export type FinanceTabId =
  | "overview"
  | "income"
  | "expenses"
  | "claims"
  | "payments"
  | "dues"
  | "pnl"
  | "reports"
  | "transactions"
  | "settings";

export type FinanceVariant = "admin" | "accounts" | "manager" | "employee";

export interface FinanceTransactionRow {
  id: string;
  transaction_code: string | null;
  transaction_type: "Income" | "Expense";
  category: string | null;
  amount: number;
  payment_method: string | null;
  payment_status: string | null;
  transaction_date: string;
  project_id: string | null;
  client_id: string | null;
  employee_id: string | null;
  description: string | null;
  reference_number: string | null;
  attachment_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseClaimRow {
  id: string;
  claim_code: string | null;
  employee_id: string;
  expense_type: string | null;
  amount: number;
  expense_date: string;
  payment_method: string | null;
  receipt_url: string | null;
  reason: string | null;
  approval_status: "Pending" | "Approved" | "Rejected";
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectPaymentRow {
  id: string;
  project_id: string;
  client_id: string | null;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  payment_status: string;
  invoice_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface FinanceCategoryRow {
  id: string;
  category_name: string;
  category_type: "Income" | "Expense";
  created_at: string;
}

export interface FinanceActivityRow {
  id: string;
  activity_type: string;
  reference_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}
