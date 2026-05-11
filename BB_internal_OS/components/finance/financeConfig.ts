import type { FinanceTabId } from "@/types/finance";

export const FINANCE_TAB_ORDER: FinanceTabId[] = [
  "overview",
  "income",
  "expenses",
  "claims",
  "payments",
  "dues",
  "pnl",
  "reports",
  "transactions",
  "settings",
];

export const FINANCE_TAB_LABELS: Record<FinanceTabId, string> = {
  overview: "Overview",
  income: "Income",
  expenses: "Expenses",
  claims: "Expense Claims",
  payments: "Payments",
  dues: "Pending Dues",
  pnl: "Profit & Loss",
  reports: "Financial Reports",
  transactions: "Transactions",
  settings: "Settings",
};

export const PAYMENT_METHODS = [
  "Cash",
  "Bank Transfer",
  "UPI",
  "Credit Card",
  "Cheque",
  "Online Gateway",
] as const;

export const INCOME_CATEGORIES = [
  "Project Payment",
  "Advance Payment",
  "Retainer",
  "Consultation",
  "Marketing Service",
  "Website Development",
  "Branding",
  "Other",
] as const;

export const EXPENSE_CATEGORIES = [
  "Office Rent",
  "Internet",
  "Electricity",
  "Software",
  "Marketing",
  "Employee Salary",
  "Travel",
  "Food",
  "Printing",
  "Hardware",
  "Miscellaneous",
] as const;

export const PAYMENT_STATUSES = ["Paid", "Partial", "Pending", "Overdue"] as const;
