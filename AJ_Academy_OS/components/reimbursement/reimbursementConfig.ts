import type { ReimbursementTabId } from "@/types/reimbursement";

export const REIMBURSEMENT_TAB_ORDER: ReimbursementTabId[] = [
  "overview",
  "all",
  "pending",
  "special",
  "reimbursed",
  "policy",
  "reports",
];

export const REIMBURSEMENT_TAB_LABELS: Record<ReimbursementTabId, string> = {
  overview: "Overview",
  all: "All Claims",
  pending: "Pending Approvals",
  special: "Special Approvals",
  reimbursed: "Reimbursed Claims",
  policy: "Policy Settings",
  reports: "Reports",
};
