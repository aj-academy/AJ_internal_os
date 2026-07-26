import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/hr/auditLog";
import {
  actionTargetStatus,
  buildWorkflowPatch,
  canTransition,
  type PayrollPeriodStatus,
  type WorkflowAction,
} from "@/lib/hr/payrollWorkflow";

export const dynamic = "force-dynamic";

const ACTIONS: WorkflowAction[] = [
  "mark_attendance_review",
  "mark_pending_adjustments",
  "submit_for_review",
  "approve",
  "lock",
  "mark_paid",
  "reopen",
  "cancel",
  "back_to_draft",
];

// POST /api/hr/payroll/workflow — transition payroll period status
export async function POST(request: Request) {
  const { response, profile } = await requireAdminApiSession();
  if (response || !profile) return response!;

  let body: {
    year?: number;
    month?: number;
    periodId?: string;
    action?: WorkflowAction;
    reason?: string;
    paymentReference?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action;
  if (!action || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Valid action is required" }, { status: 400 });
  }

  if (action === "reopen" && profile.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only Super Admin can reopen locked/approved/paid payroll." },
      { status: 403 },
    );
  }
  if ((action === "reopen" || action === "cancel") && !body.reason?.trim()) {
    if (action === "reopen") {
      return NextResponse.json({ error: "A reopen reason is required." }, { status: 400 });
    }
  }

  const admin = createAdminClient();

  let periodQuery = admin.from("payroll_periods").select("*");
  if (body.periodId) {
    periodQuery = periodQuery.eq("id", body.periodId);
  } else if (body.year && body.month) {
    periodQuery = periodQuery.eq("year", body.year).eq("month", body.month);
  } else {
    return NextResponse.json({ error: "periodId or year+month is required" }, { status: 400 });
  }

  const { data: period, error: loadErr } = await periodQuery.maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!period) return NextResponse.json({ error: "Payroll period not found. Calculate first." }, { status: 404 });

  const from = period.status as PayrollPeriodStatus;
  const to = actionTargetStatus(action);

  // Reopen is special: allowed from approved/locked/paid/cancelled even if not in generic graph
  const reopenSources: PayrollPeriodStatus[] = ["approved", "locked", "paid", "cancelled", "pending_review"];
  if (action === "reopen") {
    if (!reopenSources.includes(from)) {
      return NextResponse.json(
        { error: `Cannot reopen from status "${from}".` },
        { status: 409 },
      );
    }
  } else if (!canTransition(from, to)) {
    return NextResponse.json(
      { error: `Invalid transition: ${from} → ${to} via ${action}.` },
      { status: 409 },
    );
  }

  // Guardrails before review/approve: no employee calculation errors
  if (action === "submit_for_review" || action === "approve") {
    const { data: errorItems } = await admin
      .from("payroll_items")
      .select("id")
      .eq("payroll_period_id", period.id)
      .eq("status", "error")
      .limit(1);
    if (errorItems && errorItems.length > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot proceed: one or more employees have calculation errors. Fix salary structures / attendance issues and recalculate.",
        },
        { status: 400 },
      );
    }
  }

  if (action === "approve" && from !== "pending_review") {
    return NextResponse.json(
      { error: "Submit for review before approving (status must be pending_review)." },
      { status: 409 },
    );
  }

  if (action === "lock" && from !== "approved") {
    return NextResponse.json({ error: "Only approved payroll can be locked." }, { status: 409 });
  }

  const patch = buildWorkflowPatch({
    action,
    actorId: profile.id,
    reason: body.reason,
    paymentReference: body.paymentReference,
  });

  // After reopen, move immediately to draft so recalculation is allowed
  if (action === "reopen") {
    patch.status = "draft";
  }

  const { data: updated, error } = await admin
    .from("payroll_periods")
    .update(patch)
    .eq("id", period.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // On approve/lock, mirror item statuses
  if (action === "approve") {
    await admin
      .from("payroll_items")
      .update({ status: "approved" })
      .eq("payroll_period_id", period.id)
      .eq("status", "calculated");
  }
  if (action === "lock") {
    await admin
      .from("payroll_items")
      .update({ status: "locked" })
      .eq("payroll_period_id", period.id)
      .in("status", ["calculated", "approved"]);
  }
  if (action === "mark_paid") {
    await admin
      .from("payroll_items")
      .update({ status: "paid" })
      .eq("payroll_period_id", period.id)
      .in("status", ["locked", "approved"]);
  }
  if (action === "reopen") {
    await admin
      .from("payroll_items")
      .update({ status: "calculated" })
      .eq("payroll_period_id", period.id)
      .in("status", ["approved", "locked", "paid"]);
  }

  await writeAuditLog(admin, {
    actorId: profile.id,
    action: `payroll_${action}`,
    targetTable: "payroll_periods",
    targetId: period.id,
    oldData: { status: from },
    newData: { status: updated.status, reason: body.reason ?? null, paymentReference: body.paymentReference ?? null },
  });

  // Phase 14: on lock, optionally queue auto payslip generate+release (idempotent cron/job)
  if (action === "lock") {
    try {
      const settings = await import("@/lib/hr/payrollSettings").then(({ resolvePayrollSettingsForDate }) =>
        resolvePayrollSettingsForDate(admin, period.period_end || `${period.year}-${String(period.month).padStart(2, "0")}-28`),
      );
      if (settings?.auto_release_payslips_on_lock) {
        const { enqueueAutoGeneratePayslips } = await import("@/lib/hr/payrollAutomation");
        await enqueueAutoGeneratePayslips(admin, {
          year: period.year,
          month: period.month,
          periodId: period.id,
        });
        // Process immediately so lock doesn't wait for nightly cron
        const { processPayrollAutomation } = await import("@/lib/hr/payrollAutomation");
        void processPayrollAutomation(admin, { actorId: profile.id, limit: 10 });
      }
    } catch {
      /* automation must not fail lock */
    }
  }

  return NextResponse.json({ ok: true, period: updated, from, to: updated.status });
}
