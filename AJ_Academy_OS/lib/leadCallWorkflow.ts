/** Call / follow-up workflow constants and outcome rules for Student Lead Master. */

export const CALL_SESSION_STATUSES = [
  "initiated",
  "outcome_pending",
  "completed",
  "cancelled",
  "stale",
] as const;

export type CallSessionStatus = (typeof CALL_SESSION_STATUSES)[number];

export const CALL_OUTCOMES = [
  "Connected – Interested",
  "Connected – Needs Follow-up",
  "Connected – Not Interested",
  "Connected – Requested Brochure",
  "Connected – Requested Payment Details",
  "Connected – Ready to Join",
  "Connected – Admission Confirmed",
  "No Answer",
  "Busy",
  "Switched Off",
  "Invalid Number",
  "Call Back Later",
  "Language Issue",
  "Already Joined Elsewhere",
  "Duplicate Lead",
  "Other",
] as const;

export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const CALL_FOLLOW_UP_TYPES = [
  "Phone Call",
  "WhatsApp",
  "Brochure Confirmation",
  "Payment Follow-up",
  "Demo Reminder",
  "Counselling Session",
  "Admission Confirmation",
  "Document Collection",
  "Other",
  // legacy UI values kept for existing rows
  "Call",
  "Meeting",
  "Email",
] as const;

export type CallWorkflowFollowUpType = (typeof CALL_FOLLOW_UP_TYPES)[number];

export type CallOutcomeRule = {
  suggestedStatus: string | null;
  suggestedStage: string | null;
  suggestedPriority: string | null;
  requireFollowUp: boolean;
  askFollowUp: boolean;
  requireLostReason: boolean;
  requireNotes: boolean;
  requireNextAction: boolean;
  incrementAttemptOnly: boolean;
  markBrochureAction?: boolean;
  markPaymentAction?: boolean;
};

export const CALL_OUTCOME_RULES: Record<CallOutcome, CallOutcomeRule> = {
  "Connected – Interested": {
    suggestedStatus: "Interested",
    suggestedStage: "Counselling",
    suggestedPriority: null,
    requireFollowUp: false,
    askFollowUp: true,
    requireLostReason: false,
    requireNotes: true,
    requireNextAction: true,
    incrementAttemptOnly: false,
  },
  "Connected – Needs Follow-up": {
    suggestedStatus: "Follow-up",
    suggestedStage: "Counselling",
    suggestedPriority: null,
    requireFollowUp: true,
    askFollowUp: false,
    requireLostReason: false,
    requireNotes: true,
    requireNextAction: true,
    incrementAttemptOnly: false,
  },
  "Connected – Not Interested": {
    suggestedStatus: "Not Interested",
    suggestedStage: "Closed",
    suggestedPriority: null,
    requireFollowUp: false,
    askFollowUp: false,
    requireLostReason: true,
    requireNotes: true,
    requireNextAction: false,
    incrementAttemptOnly: false,
  },
  "Connected – Requested Brochure": {
    suggestedStatus: "Follow-up",
    suggestedStage: "Brochure Shared",
    suggestedPriority: null,
    requireFollowUp: true,
    askFollowUp: false,
    requireLostReason: false,
    requireNotes: true,
    requireNextAction: true,
    incrementAttemptOnly: false,
    markBrochureAction: true,
  },
  "Connected – Requested Payment Details": {
    suggestedStatus: "Fee Discussed",
    suggestedStage: "Payment Follow-up",
    suggestedPriority: "Hot",
    requireFollowUp: true,
    askFollowUp: false,
    requireLostReason: false,
    requireNotes: true,
    requireNextAction: true,
    incrementAttemptOnly: false,
    markPaymentAction: true,
  },
  "Connected – Ready to Join": {
    suggestedStatus: "Interested",
    suggestedStage: "Ready to Join",
    suggestedPriority: "Hot",
    requireFollowUp: true,
    askFollowUp: false,
    requireLostReason: false,
    requireNotes: true,
    requireNextAction: true,
    incrementAttemptOnly: false,
  },
  "Connected – Admission Confirmed": {
    suggestedStatus: "Admitted",
    suggestedStage: "Admission",
    suggestedPriority: null,
    requireFollowUp: false,
    askFollowUp: false,
    requireLostReason: false,
    requireNotes: true,
    requireNextAction: false,
    incrementAttemptOnly: false,
  },
  "No Answer": {
    suggestedStatus: "Contacted",
    suggestedStage: "Call Attempted",
    suggestedPriority: null,
    requireFollowUp: true,
    askFollowUp: false,
    requireLostReason: false,
    requireNotes: false,
    requireNextAction: true,
    incrementAttemptOnly: true,
  },
  Busy: {
    suggestedStatus: "Contacted",
    suggestedStage: "Call Attempted",
    suggestedPriority: null,
    requireFollowUp: true,
    askFollowUp: false,
    requireLostReason: false,
    requireNotes: false,
    requireNextAction: true,
    incrementAttemptOnly: true,
  },
  "Switched Off": {
    suggestedStatus: "Contacted",
    suggestedStage: "Call Attempted",
    suggestedPriority: null,
    requireFollowUp: true,
    askFollowUp: false,
    requireLostReason: false,
    requireNotes: false,
    requireNextAction: true,
    incrementAttemptOnly: true,
  },
  "Invalid Number": {
    suggestedStatus: "Lost",
    suggestedStage: "Invalid Lead",
    suggestedPriority: null,
    requireFollowUp: false,
    askFollowUp: false,
    requireLostReason: false,
    requireNotes: true,
    requireNextAction: false,
    incrementAttemptOnly: false,
  },
  "Call Back Later": {
    suggestedStatus: "Follow-up",
    suggestedStage: "Call Attempted",
    suggestedPriority: null,
    requireFollowUp: true,
    askFollowUp: false,
    requireLostReason: false,
    requireNotes: false,
    requireNextAction: true,
    incrementAttemptOnly: true,
  },
  "Language Issue": {
    suggestedStatus: "Follow-up",
    suggestedStage: "Call Attempted",
    suggestedPriority: null,
    requireFollowUp: true,
    askFollowUp: false,
    requireLostReason: false,
    requireNotes: true,
    requireNextAction: true,
    incrementAttemptOnly: false,
  },
  "Already Joined Elsewhere": {
    suggestedStatus: "Lost",
    suggestedStage: "Closed",
    suggestedPriority: null,
    requireFollowUp: false,
    askFollowUp: false,
    requireLostReason: true,
    requireNotes: true,
    requireNextAction: false,
    incrementAttemptOnly: false,
  },
  "Duplicate Lead": {
    suggestedStatus: "Lost",
    suggestedStage: "Closed",
    suggestedPriority: null,
    requireFollowUp: false,
    askFollowUp: false,
    requireLostReason: false,
    requireNotes: true,
    requireNextAction: false,
    incrementAttemptOnly: false,
  },
  Other: {
    suggestedStatus: "Contacted",
    suggestedStage: null,
    suggestedPriority: null,
    requireFollowUp: false,
    askFollowUp: true,
    requireLostReason: false,
    requireNotes: true,
    requireNextAction: true,
    incrementAttemptOnly: false,
  },
};

export type LeadCallSessionRow = {
  id: string;
  lead_id: string;
  employee_id: string;
  employee_name: string | null;
  phone_number: string;
  started_at: string;
  ended_at: string | null;
  approximate_duration_seconds: number | null;
  session_status: CallSessionStatus | string;
  call_outcome: string | null;
  notes: string | null;
  next_action: string | null;
  lead_stage_at_start: string | null;
  lead_stage_after: string | null;
  source_page: string | null;
  created_at?: string;
  updated_at?: string;
  /** Joined for UI */
  lead_name?: string | null;
};

export function isCallOutcome(value: string): value is CallOutcome {
  return (CALL_OUTCOMES as readonly string[]).includes(value);
}

export function formatFollowUpFriendly(dateStr: string | null | undefined, timeStr?: string | null): string {
  if (!dateStr?.trim()) return "—";
  const datePart = dateStr.slice(0, 10);
  const timePart = (timeStr || "").trim().slice(0, 5);
  const d = new Date(`${datePart}T${timePart || "00:00"}:00`);
  if (Number.isNaN(d.getTime())) {
    return timePart ? `${datePart} ${timePart}` : datePart;
  }

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((startTarget.getTime() - startToday.getTime()) / 86400000);

  const timeLabel = d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (dayDiff === 0) return `Today, ${timeLabel}`;
  if (dayDiff === 1) return `Tomorrow, ${timeLabel}`;
  if (dayDiff === -1) return `Yesterday, ${timeLabel}`;

  const dateLabel = d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `${dateLabel}, ${timeLabel}`;
}

export function followUpBadge(dateStr: string | null | undefined, timeStr?: string | null): "overdue" | "today" | "upcoming" | "none" {
  if (!dateStr?.trim()) return "none";
  const datePart = dateStr.slice(0, 10);
  const timePart = (timeStr || "23:59").trim().slice(0, 5);
  const d = new Date(`${datePart}T${timePart}:00`);
  if (Number.isNaN(d.getTime())) return "none";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  if (d < now && d < startToday) return "overdue";
  if (d < now) return "overdue";
  if (d <= endToday) return "today";
  return "upcoming";
}

export function isMissingCallWorkflowSchema(message: string | null | undefined): boolean {
  const m = (message || "").toLowerCase();
  return (
    m.includes("lead_call_sessions") ||
    m.includes("start_lead_call_session") ||
    m.includes("total_call_attempts") ||
    m.includes("current_call_employee_id") ||
    m.includes("last_call_outcome") ||
    (m.includes("could not find the function") && m.includes("call"))
  );
}
