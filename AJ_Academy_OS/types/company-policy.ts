export type PolicyCategory = "employee" | "freelancer";

export interface CompanyPolicy {
  id: string;
  name: string;
  policy_url: string;
  policy_category: PolicyCategory;
  created_at: string;
}
