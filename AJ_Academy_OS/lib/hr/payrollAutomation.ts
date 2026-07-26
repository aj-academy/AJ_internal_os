import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hr/auditLog";
import { resolvePayrollSettingsForDate } from "@/lib/hr/payrollSettings";
import { generatePayslipsForPeriod } from "@/lib/hr/payslipService";
import {
  notifyAdminsCutoff,
  notifyAdminsPendingReview,
  notifyPayslipReleased,
} from "@/lib/hr/payrollNotifications";

export type AutomationJobType =
  | "attendance_cutoff_reminder"
  | "leave_cutoff_reminder"
  | "adjustment_cutoff_reminder"
  | "auto_generate_payslips"
  | "notify_payslip_release"
  | "payroll_pending_review_nudge";

function padMonth(m: number) {
  return String(m).padStart(2, "0");
}

export function buildAutomationIdempotencyKey(
  jobType: AutomationJobType,
  year: number,
  month: number,
  suffix = "default",
): string {
  return `payroll:${jobType}:${year}-${padMonth(month)}:${suffix}`;
}

async function upsertJob(
  admin: SupabaseClient,
  args: {
    jobType: AutomationJobType;
    year: number;
    month: number;
    periodId?: string | null;
    idempotencyKey: string;
    payload?: Record<string, unknown>;
  },
): Promise<{ id: string; created: boolean } | null> {
  const { data: existing } = await admin
    .from("payroll_automation_jobs")
    .select("id, status")
    .eq("idempotency_key", args.idempotencyKey)
    .maybeSingle();
  if (existing) return { id: existing.id, created: false };

  const { data, error } = await admin
    .from("payroll_automation_jobs")
    .insert({
      job_type: args.jobType,
      year: args.year,
      month: args.month,
      payroll_period_id: args.periodId ?? null,
      idempotency_key: args.idempotencyKey,
      status: "pending",
      payload: args.payload ?? {},
    })
    .select("id")
    .single();

  if (error) {
    // Unique race — treat as existing
    if (/duplicate|unique/i.test(error.message)) {
      const { data: again } = await admin
        .from("payroll_automation_jobs")
        .select("id")
        .eq("idempotency_key", args.idempotencyKey)
        .maybeSingle();
      if (again) return { id: again.id, created: false };
    }
    return null;
  }
  return { id: data.id, created: true };
}

async function claimJob(admin: SupabaseClient, id: string): Promise<boolean> {
  const { data } = await admin
    .from("payroll_automation_jobs")
    .update({ status: "processing" })
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  return !!data;
}

async function finishJob(
  admin: SupabaseClient,
  id: string,
  status: "processed" | "failed" | "skipped",
  result: Record<string, unknown>,
  errorMessage?: string,
) {
  await admin
    .from("payroll_automation_jobs")
    .update({
      status,
      result,
      error_message: errorMessage ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", id);
}

/** Enqueue (idempotent) notify job after payslip release. */
export async function enqueuePayslipReleaseNotify(
  admin: SupabaseClient,
  args: { year: number; month: number; periodId?: string | null; payslipIds: string[] },
) {
  if (!args.payslipIds.length) return;
  await upsertJob(admin, {
    jobType: "notify_payslip_release",
    year: args.year,
    month: args.month,
    periodId: args.periodId,
    idempotencyKey: buildAutomationIdempotencyKey(
      "notify_payslip_release",
      args.year,
      args.month,
      `batch:${args.payslipIds.slice().sort().join(",").slice(0, 80)}`,
    ),
    payload: { payslipIds: args.payslipIds },
  });
}

/** After lock: optionally queue auto payslip generation (idempotent per period). */
export async function enqueueAutoGeneratePayslips(
  admin: SupabaseClient,
  args: { year: number; month: number; periodId: string },
) {
  await upsertJob(admin, {
    jobType: "auto_generate_payslips",
    year: args.year,
    month: args.month,
    periodId: args.periodId,
    idempotencyKey: buildAutomationIdempotencyKey(
      "auto_generate_payslips",
      args.year,
      args.month,
      args.periodId,
    ),
    payload: { periodId: args.periodId, release: true },
  });
}

async function ensureCutoffJobs(admin: SupabaseClient, today: Date) {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const todayIso = today.toISOString().slice(0, 10);

  let settings;
  try {
    settings = await resolvePayrollSettingsForDate(admin, todayIso);
  } catch {
    return { queued: 0 };
  }
  if (!settings) return { queued: 0 };

  let queued = 0;
  const cutoffs: { day: number; type: AutomationJobType; title: string; message: string }[] = [
    {
      day: settings.attendance_cutoff_day,
      type: "attendance_cutoff_reminder",
      title: "Attendance cutoff",
      message: `Attendance cutoff day (${day}) for ${month}/${year}. Clear missing check-outs before payroll.`,
    },
    {
      day: settings.leave_cutoff_day,
      type: "leave_cutoff_reminder",
      title: "Leave cutoff",
      message: `Leave cutoff day (${day}) for ${month}/${year}. Finish pending leave approvals.`,
    },
    {
      day: settings.adjustment_cutoff_day,
      type: "adjustment_cutoff_reminder",
      title: "Adjustment cutoff",
      message: `Salary adjustment cutoff day (${day}) for ${month}/${year}.`,
    },
  ];

  for (const c of cutoffs) {
    if (c.day !== day) continue;
    const key = buildAutomationIdempotencyKey(c.type, year, month, `day:${day}`);
    const row = await upsertJob(admin, {
      jobType: c.type,
      year,
      month,
      idempotencyKey: key,
      payload: { title: c.title, message: c.message, day },
    });
    if (row?.created) queued += 1;
  }

  // Pending review nudge — once per period
  const { data: pending } = await admin
    .from("payroll_periods")
    .select("id, year, month")
    .eq("status", "pending_review");
  for (const p of pending ?? []) {
    const key = buildAutomationIdempotencyKey(
      "payroll_pending_review_nudge",
      p.year,
      p.month,
      p.id,
    );
    const row = await upsertJob(admin, {
      jobType: "payroll_pending_review_nudge",
      year: p.year,
      month: p.month,
      periodId: p.id,
      idempotencyKey: key,
      payload: { periodId: p.id },
    });
    if (row?.created) queued += 1;
  }

  return { queued };
}

async function runJob(
  admin: SupabaseClient,
  job: {
    id: string;
    job_type: AutomationJobType;
    year: number;
    month: number;
    payroll_period_id: string | null;
    payload: Record<string, unknown>;
  },
) {
  switch (job.job_type) {
    case "attendance_cutoff_reminder":
    case "leave_cutoff_reminder":
    case "adjustment_cutoff_reminder": {
      await notifyAdminsCutoff({
        admin,
        title: String(job.payload.title || "Payroll cutoff"),
        message: String(job.payload.message || "A payroll cutoff day has arrived."),
        type: `hr_${job.job_type}`,
        entityId: job.id,
      });
      await finishJob(admin, job.id, "processed", { notified: true });
      return;
    }
    case "payroll_pending_review_nudge": {
      const periodId = String(job.payload.periodId || job.payroll_period_id || "");
      if (!periodId) {
        await finishJob(admin, job.id, "skipped", {}, "Missing period id");
        return;
      }
      await notifyAdminsPendingReview({
        admin,
        year: job.year,
        month: job.month,
        periodId,
      });
      await finishJob(admin, job.id, "processed", { notified: true });
      return;
    }
    case "auto_generate_payslips": {
      const periodId = String(job.payload.periodId || job.payroll_period_id || "");
      if (!periodId) {
        await finishJob(admin, job.id, "failed", {}, "Missing period id");
        return;
      }
      const { data: period } = await admin.from("payroll_periods").select("*").eq("id", periodId).maybeSingle();
      if (!period || !["approved", "locked", "paid"].includes(period.status)) {
        await finishJob(admin, job.id, "skipped", { status: period?.status }, "Period not ready");
        return;
      }
      const release = job.payload.release !== false;
      const result = await generatePayslipsForPeriod(admin, periodId, null, { release });
      if (release && result.generated > 0) {
        const settings = await resolvePayrollSettingsForDate(
          admin,
          period.period_end || `${period.year}-${String(period.month).padStart(2, "0")}-15`,
        );
        if (settings?.notify_employees_on_release !== false) {
          const { data: slips } = await admin
            .from("payslips")
            .select("id, employee_id, year, month, status, released_at")
            .eq("payroll_period_id", periodId)
            .eq("status", "released");
          for (const s of slips ?? []) {
            await notifyPayslipReleased({
              employeeId: s.employee_id,
              payslipId: s.id,
              year: s.year,
              month: s.month,
            });
          }
        }
      }
      await finishJob(admin, job.id, "processed", {
        generated: result.generated,
        failed: result.failed,
        skipped: result.skipped,
        released: release,
      });
      return;
    }
    case "notify_payslip_release": {
      const ids = (job.payload.payslipIds as string[] | undefined) ?? [];
      if (!ids.length) {
        await finishJob(admin, job.id, "skipped", {}, "No payslip ids");
        return;
      }
      const { data: slips } = await admin
        .from("payslips")
        .select("id, employee_id, year, month, status, released_at")
        .in("id", ids);
      let sent = 0;
      for (const s of slips ?? []) {
        if (!s.released_at && s.status !== "released") continue;
        await notifyPayslipReleased({
          employeeId: s.employee_id,
          payslipId: s.id,
          year: s.year,
          month: s.month,
        });
        sent += 1;
      }
      await finishJob(admin, job.id, "processed", { sent });
      return;
    }
    default:
      await finishJob(admin, job.id, "skipped", {}, `Unknown job type`);
  }
}

export async function processPayrollAutomation(
  admin: SupabaseClient,
  options?: { actorId?: string | null; limit?: number },
): Promise<{
  queued: number;
  processed: number;
  failed: number;
  skipped: number;
  error?: string;
}> {
  const summary = { queued: 0, processed: 0, failed: 0, skipped: 0 };

  try {
    const ensured = await ensureCutoffJobs(admin, new Date());
    summary.queued = ensured.queued;

    const limit = options?.limit ?? 50;
    const { data: pending, error } = await admin
      .from("payroll_automation_jobs")
      .select("id, job_type, year, month, payroll_period_id, payload, status")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) {
      if (/does not exist/i.test(error.message)) {
        return { ...summary, error: "Migration required: hr_payroll_14_automation.sql" };
      }
      return { ...summary, error: error.message };
    }

    for (const job of pending ?? []) {
      const claimed = await claimJob(admin, job.id);
      if (!claimed) continue;
      try {
        await runJob(admin, {
          id: job.id,
          job_type: job.job_type as AutomationJobType,
          year: job.year,
          month: job.month,
          payroll_period_id: job.payroll_period_id,
          payload: (job.payload as Record<string, unknown>) ?? {},
        });
        const { data: after } = await admin
          .from("payroll_automation_jobs")
          .select("status")
          .eq("id", job.id)
          .maybeSingle();
        if (after?.status === "processed") summary.processed += 1;
        else if (after?.status === "failed") summary.failed += 1;
        else summary.skipped += 1;
      } catch (e) {
        summary.failed += 1;
        await finishJob(
          admin,
          job.id,
          "failed",
          {},
          e instanceof Error ? e.message : "Job failed",
        );
      }
    }

    await writeAuditLog(admin, {
      actorId: options?.actorId ?? null,
      action: "payroll_automation_processed",
      targetTable: "payroll_automation_jobs",
      newData: summary,
    });

    return summary;
  } catch (e) {
    return {
      ...summary,
      error: e instanceof Error ? e.message : "Automation failed",
    };
  }
}
