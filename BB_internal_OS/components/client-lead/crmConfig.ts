export const CRM_TAB_IDS = [
  "overview",
  "all-leads",
  "follow-ups",
  "pipeline",
  "converted",
  "proposal",
  "timeline",
  "reports",
  "settings",
] as const;

export type CrmTabId = (typeof CRM_TAB_IDS)[number];

export const CRM_SOURCES = [
  "Meta Ads",
  "Google Ads",
  "Website",
  "WhatsApp",
  "Referral",
  "LinkedIn",
  "Instagram",
  "Cold Call",
  "Walk-in",
  "Existing Client",
  "Other",
] as const;

export const CRM_SERVICES = [
  "Branding",
  "Logo Design",
  "Social Media Marketing",
  "Meta Ads",
  "Google Ads",
  "Website Development",
  "Video Editing",
  "Catalogue Design",
  "Marketing Strategy",
  "Automation",
  "Consulting",
] as const;

export const CRM_LEAD_STATUSES = [
  "New Lead",
  "Contacted",
  "Interested",
  "Meeting Scheduled",
  "Proposal Sent",
  "Negotiation",
  "Converted",
  "Lost",
  "Not Interested",
] as const;

export const CRM_PRIORITIES = ["Hot", "Warm", "Cold"] as const;

export const CRM_FOLLOW_UP_TYPES_UI = ["Call", "WhatsApp", "Meeting", "Email"] as const;

export const CRM_PROPOSAL_STATUSES = [
  "Not Sent",
  "Drafted",
  "Sent",
  "Accepted",
  "Rejected",
  "Revision Needed",
] as const;

export const FOLLOWUP_ROW_STATUSES = ["Pending", "Completed", "Missed", "Rescheduled"] as const;

export type CrmLeadStatus = (typeof CRM_LEAD_STATUSES)[number];
export type CrmSource = (typeof CRM_SOURCES)[number];
export type CrmPriority = (typeof CRM_PRIORITIES)[number];
export type CrmProposalStatus = (typeof CRM_PROPOSAL_STATUSES)[number];
