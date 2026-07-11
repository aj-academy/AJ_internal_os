export const VISIT_STATUSES = [
  "Not Visited",
  "Scheduled",
  "Visited",
  "Revisit Required",
  "On Hold",
] as const;

export const MOU_STATUSES = [
  "Not Signed",
  "In Discussion",
  "Draft Shared",
  "Signed",
  "Declined",
] as const;

export const FOLLOW_UP_STAGES = [
  "Initial Contact",
  "Visit Completed",
  "MOU Discussion",
  "Follow-up Call",
  "Proposal Sent",
  "Negotiation",
  "Closed Won",
  "Closed Lost",
] as const;

export const COLLEGE_PRIORITIES = ["Hot", "Warm", "Cold"] as const;

export const FINAL_STATUSES = ["Open", "In Progress", "Converted", "Lost", "On Hold"] as const;

export const CONNECTED_PERSON_ROLES = [
  "Principal",
  "HOD",
  "Placement Officer",
  "TPO",
  "Coordinator",
  "Professor",
  "Admin Staff",
  "Other",
] as const;

export type VisitStatus = (typeof VISIT_STATUSES)[number];
export type MouStatus = (typeof MOU_STATUSES)[number];
export type FollowUpStage = (typeof FOLLOW_UP_STAGES)[number];
export type CollegePriority = (typeof COLLEGE_PRIORITIES)[number];
export type FinalStatus = (typeof FINAL_STATUSES)[number];
