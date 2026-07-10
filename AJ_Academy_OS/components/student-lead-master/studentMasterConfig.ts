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
  "College Drive",
  "Seminar",
  "Other",
] as const;

/** @deprecated Prefer INTERESTED_PROGRAMS for Student Master */
export const CRM_SERVICES = [
  "Full Stack Development",
  "Data Science",
  "Digital Marketing",
  "UI/UX Design",
  "Cloud / DevOps",
  "Business Analytics",
  "Other",
] as const;

export const INTERESTED_PROGRAMS = [
  "Full Stack Development",
  "Data Science",
  "Digital Marketing",
  "UI/UX Design",
  "Cloud / DevOps",
  "Business Analytics",
  "Other",
] as const;

/** Select value when admin adds a new global program from the form */
export const NEW_PROGRAM_OPTION = "__new_program__";

export const CURRENT_PROFILES = [
  "Student",
  "Fresher",
  "Working Professional",
  "Career Switcher",
  "Other",
] as const;

export const EMPLOYMENT_STATUSES = [
  "Student",
  "Unemployed",
  "Employed",
  "Self-employed",
  "Freelancer",
] as const;

export const SKILL_LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;

export const JOINING_TIMELINES = [
  "Immediate",
  "This week",
  "This month",
  "1-3 months",
  "Later",
] as const;

export const PAYMENT_PLANS = ["Full Payment", "Instalment"] as const;

export const YES_NO_OPTIONS = ["Yes", "No"] as const;

export const DECISION_MAKERS = ["Self", "Parent", "Spouse", "Guardian", "Other"] as const;

export const PREFERRED_BATCHES = [
  "Offline",
  "Online",
  "Weekday Morning",
  "Weekday Evening",
  "Weekend",
  "Flexible",
] as const;

export const LAPTOP_AVAILABILITY = ["Yes", "No", "Need assistance"] as const;

export const LEAD_STAGES = [
  "Inquiry",
  "Counselling",
  "Demo",
  "Negotiation",
  "Admission",
  "Closed",
] as const;

export const CRM_LEAD_STATUSES = [
  "New",
  "Contacted",
  "Interested",
  "Follow-up",
  "Counselling Scheduled",
  "Fee Discussed",
  "Admitted",
  "Lost",
  "Not Interested",
] as const;

export const CRM_PRIORITIES = ["Hot", "Warm", "Cold"] as const;

export const PAYMENT_STATUSES = ["Not Paid", "Partial", "Paid", "Refunded"] as const;

export const ADMISSION_STATUSES = [
  "Not Started",
  "In Progress",
  "Admitted",
  "Deferred",
  "Cancelled",
] as const;

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
