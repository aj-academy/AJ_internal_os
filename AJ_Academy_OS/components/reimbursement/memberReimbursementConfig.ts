export type MemberReimbursementTabId = "overview" | "submit" | "claims" | "import" | "policy";

export const MEMBER_REIMBURSEMENT_TAB_ORDER: MemberReimbursementTabId[] = [
  "overview",
  "submit",
  "claims",
  "import",
  "policy",
];

export const MEMBER_REIMBURSEMENT_TAB_LABELS: Record<MemberReimbursementTabId, string> = {
  overview: "Overview",
  submit: "Submit Claim",
  claims: "My Claims",
  import: "Import Bills",
  policy: "Policy & Limits",
};
