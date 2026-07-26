/**
 * Payroll period status workflow (Phases 8 + 10).
 *
 * Draft → Attendance Review → Pending Adjustments → Calculated → Pending Review
 *   → Approved → Locked → Paid
 * Reopened (super admin only) returns to draft for recalculation.
 * Cancelled is terminal unless reopened (super admin).
 */

export type PayrollPeriodStatus =
  | "draft"
  | "attendance_review"
  | "pending_adjustments"
  | "calculated"
  | "pending_review"
  | "approved"
  | "locked"
  | "paid"
  | "reopened"
  | "cancelled";

const TRANSITIONS: Record<PayrollPeriodStatus, PayrollPeriodStatus[]> = {
  draft: ["attendance_review", "pending_adjustments", "calculated", "cancelled"],
  attendance_review: ["pending_adjustments", "calculated", "draft", "cancelled"],
  pending_adjustments: ["calculated", "attendance_review", "draft", "cancelled"],
  calculated: ["pending_review", "pending_adjustments", "attendance_review", "draft", "cancelled"],
  pending_review: ["approved", "calculated", "cancelled"],
  approved: ["locked", "pending_review"],
  locked: ["paid"],
  paid: [],
  reopened: ["draft", "calculated", "cancelled"],
  cancelled: [],
};

export function canTransition(from: PayrollPeriodStatus, to: PayrollPeriodStatus): boolean {
  if (from === to) return false;
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function isRecalculable(status: string): boolean {
  return ["draft", "attendance_review", "pending_adjustments", "calculated", "pending_review", "reopened"].includes(
    status,
  );
}

export function requiresSuperAdmin(action: "reopen" | "cancel_locked"): boolean {
  return action === "reopen" || action === "cancel_locked";
}

export type WorkflowAction =
  | "mark_attendance_review"
  | "mark_pending_adjustments"
  | "submit_for_review"
  | "approve"
  | "lock"
  | "mark_paid"
  | "reopen"
  | "cancel"
  | "back_to_draft";

export function actionTargetStatus(action: WorkflowAction): PayrollPeriodStatus {
  switch (action) {
    case "mark_attendance_review":
      return "attendance_review";
    case "mark_pending_adjustments":
      return "pending_adjustments";
    case "submit_for_review":
      return "pending_review";
    case "approve":
      return "approved";
    case "lock":
      return "locked";
    case "mark_paid":
      return "paid";
    case "reopen":
      return "reopened";
    case "cancel":
      return "cancelled";
    case "back_to_draft":
      return "draft";
  }
}

export function buildWorkflowPatch(args: {
  action: WorkflowAction;
  actorId: string;
  reason?: string | null;
  paymentReference?: string | null;
}): Record<string, unknown> {
  const now = new Date().toISOString();
  const status = actionTargetStatus(args.action);
  const patch: Record<string, unknown> = {
    status,
    updated_by: args.actorId,
    status_reason: args.reason?.trim() || null,
  };

  if (args.action === "approve") {
    patch.approved_by = args.actorId;
    patch.approved_at = now;
  }
  if (args.action === "lock") {
    patch.locked_by = args.actorId;
    patch.locked_at = now;
  }
  if (args.action === "mark_paid") {
    patch.paid_by = args.actorId;
    patch.paid_at = now;
    patch.payment_reference = args.paymentReference?.trim() || null;
  }
  if (args.action === "reopen") {
    patch.reopened_by = args.actorId;
    patch.reopened_at = now;
    patch.reopen_reason = args.reason?.trim() || null;
    // Clear approval/lock so a fresh cycle is required
    patch.approved_by = null;
    patch.approved_at = null;
    patch.locked_by = null;
    patch.locked_at = null;
  }

  return patch;
}
