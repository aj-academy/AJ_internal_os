/** Allowed / suggested values for College Visits (DB stores free text; these drive filters + forms). */

export const CV_TAB_IDS = [
  "overview",
  "all-colleges",
  "follow-ups",
  "pipeline",
  "converted",
  "mou",
  "proposal",
  "timeline",
  "reports",
  "settings",
] as const;

export type CvTabId = (typeof CV_TAB_IDS)[number];

export const CV_TAB_LABELS: Record<CvTabId, string> = {
  overview: "Overview",
  "all-colleges": "All Colleges",
  "follow-ups": "Follow-ups",
  pipeline: "Pipeline",
  converted: "Converted Colleges",
  mou: "MOU Tracker",
  proposal: "Proposal Tracker",
  timeline: "Activity Timeline",
  reports: "Reports",
  settings: "Settings",
};

export const CV_PROPOSAL_STATUSES = [
  "Not Sent",
  "Drafted",
  "Sent",
  "Accepted",
  "Rejected",
  "Revision Needed",
] as const;

export type CvProposalStatus = (typeof CV_PROPOSAL_STATUSES)[number];

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
  "Whom visited to the college",
  "Other",
] as const;

/** Preset roles shown in the dropdown (excludes Other — that opens a free-text field). */
export const CONNECTED_PERSON_ROLE_PRESETS = CONNECTED_PERSON_ROLES.filter((r) => r !== "Other");

export function isCollegeContactCustomRole(role: string | null | undefined): boolean {
  const r = (role ?? "").trim();
  if (!r) return false;
  if (r === "Other") return true;
  return !(CONNECTED_PERSON_ROLE_PRESETS as readonly string[]).includes(r);
}

export function collegeContactRoleSelectValue(role: string | null | undefined): string {
  const r = (role ?? "").trim();
  if (!r) return "";
  if ((CONNECTED_PERSON_ROLE_PRESETS as readonly string[]).includes(r)) return r;
  return "Other";
}

export type VisitStatus = (typeof VISIT_STATUSES)[number];
export type MouStatus = (typeof MOU_STATUSES)[number];
export type FollowUpStage = (typeof FOLLOW_UP_STAGES)[number];
export type CollegePriority = (typeof COLLEGE_PRIORITIES)[number];
export type FinalStatus = (typeof FINAL_STATUSES)[number];
