import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/lib/security/auth/requireAdminApi";
import { requireStaffApiSession } from "@/lib/security/auth/requireStaffApi";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Admin reviews / approves an End of Day work summary. */
export async function PATCH(req: Request) {
  const gate = await requireAdminApiSession();
  if (gate.response || !gate.profile) return gate.response!;

  let body: { id?: string; managerRemarks?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const status = body.status === "approved" || body.status === "reviewed" ? body.status : "reviewed";
  const admin = createAdminClient();
  const payload: Record<string, unknown> = {
    status,
    manager_remarks: body.managerRemarks ?? null,
    reviewed_by: gate.profile.id,
    reviewed_at: new Date().toISOString(),
  };

  const { data, error } = await admin.from("work_summaries").update(payload).eq("id", body.id).select("id").maybeSingle();
  if (error) {
    if (/reviewed_by|reviewed_at|column/i.test(error.message)) {
      const { error: fb } = await admin
        .from("work_summaries")
        .update({ status, manager_remarks: body.managerRemarks ?? null })
        .eq("id", body.id);
      if (fb) return NextResponse.json({ error: fb.message }, { status: 500 });
      return NextResponse.json({ ok: true, warning: "Run analytics_reporting_schema.sql for review audit columns." });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data?.id });
}

/** Employee upserts today's EOD (also used if attendance checkout path is skipped). */
export async function POST(req: Request) {
  const gate = await requireStaffApiSession();
  if (gate.response || !gate.profile) return gate.response!;
  if (gate.profile.role !== "employee") {
    return NextResponse.json({ error: "Only employees submit EOD here." }, { status: 403 });
  }

  let body: {
    summaryDate?: string;
    completedWork?: string;
    challenges?: string;
    pendingWork?: string;
    tomorrowPlan?: string;
    supportRequired?: string;
    additionalRemarks?: string;
    attendanceId?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.completedWork?.trim() || !body.pendingWork?.trim() || !body.tomorrowPlan?.trim()) {
    return NextResponse.json(
      { error: "Today's achievement, pending work, and tomorrow's plan are required." },
      { status: 400 },
    );
  }

  const summaryDate = (body.summaryDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const supabase = await createClient();
  const row = {
    employee_id: gate.profile.id,
    attendance_id: body.attendanceId || null,
    summary_date: summaryDate,
    completed_work: body.completedWork.trim(),
    pending_work: body.pendingWork.trim(),
    challenges: body.challenges?.trim() || null,
    tomorrow_plan: body.tomorrowPlan.trim(),
    support_required: body.supportRequired?.trim() || null,
    additional_remarks: body.additionalRemarks?.trim() || null,
    status: "submitted",
  };

  const { data, error } = await supabase
    .from("work_summaries")
    .upsert(row, { onConflict: "employee_id,summary_date" })
    .select("id")
    .maybeSingle();

  if (error) {
    if (/support_required|additional_remarks|onConflict|unique/i.test(error.message)) {
      const { data: inserted, error: insErr } = await supabase
        .from("work_summaries")
        .insert({
          employee_id: row.employee_id,
          attendance_id: row.attendance_id,
          summary_date: row.summary_date,
          completed_work: row.completed_work,
          pending_work: row.pending_work,
          challenges: row.challenges,
          tomorrow_plan: row.tomorrow_plan,
          status: "submitted",
        })
        .select("id")
        .maybeSingle();
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
      return NextResponse.json({
        ok: true,
        id: inserted?.id,
        warning: "Run analytics_reporting_schema.sql for full EOD fields + unique upsert.",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data?.id });
}
