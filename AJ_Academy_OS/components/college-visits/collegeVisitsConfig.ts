/** Allowed / suggested values for College Visits (DB stores free text; these drive filters + forms). */

export const VISIT_STATUSES = [
  "Not Visited",
  "Scheduled",
  "Contacted",
  "Visited",
  "Revisit Required",
  "On Hold",
] as const;

export const MOU_STATUSES = [
  "Not Signed",
  "In Discussion",
  "Draft Shared",
  "Partially Signed",
  "Signed",
  "Declined",
] as const;

export const FOLLOW_UP_STAGES = [
  "Initial Contact",
  "WhatsApp Follow-up",
  "Meeting Follow-up",
  "Appointment Pending",
  "Visit Completed",
  "Decision Pending",
  "Approval Pending",
  "Details to Share",
  "Proposal Submitted",
  "Proposal Follow-up",
  "Proposal Sent",
  "MOU Discussion",
  "Department Follow-up",
  "Department MOU Follow-up",
  "Collaboration Discussion",
  "Workshop Planning",
  "Program Planning",
  "Follow-up Call",
  "Negotiation",
  "Deferred",
  "Closed",
  "Closed Won",
  "Closed Lost",
] as const;

/** Hot/Warm/Cold + High/Medium/Low (from mapped Excel sheets). */
export const COLLEGE_PRIORITIES = ["Hot", "Warm", "Cold", "High", "Medium", "Low"] as const;

export const FINAL_STATUSES = [
  "Open",
  "In Progress",
  "Converted",
  "Lost",
  "On Hold",
  "Closed - Rejected",
] as const;

export const CONNECTED_PERSON_ROLES = [
  "Principal",
  "HOD",
  "Placement Officer",
  "TPO",
  "Coordinator",
  "Professor",
  "Admin Staff",
  "Chairman",
  "Other",
] as const;

export type VisitStatus = (typeof VISIT_STATUSES)[number];
export type MouStatus = (typeof MOU_STATUSES)[number];
export type FollowUpStage = (typeof FOLLOW_UP_STAGES)[number];
export type CollegePriority = (typeof COLLEGE_PRIORITIES)[number];
export type FinalStatus = (typeof FINAL_STATUSES)[number];
