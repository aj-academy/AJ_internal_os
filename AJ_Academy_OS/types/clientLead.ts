export type LeadStatus = "Lead" | "Contacted" | "Converted" | "Lost";

export type LeadSource = "Meta Ads" | "Referral" | "LinkedIn";

export interface ClientLeadRecord {
  id: string;
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  source: LeadSource | null;
  status: LeadStatus | null;
  budget: number | null;
  assigned_to: string | null;
  follow_up_date: string | null;
  requirement: string | null;
  notes: string | null;
  created_at: string;
}
