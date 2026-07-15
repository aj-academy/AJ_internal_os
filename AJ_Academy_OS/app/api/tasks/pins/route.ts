import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffApiSession } from "@/lib/security";
import { parseClientIds } from "@/lib/taskActivities";

type PinSection = "lead" | "college" | "project" | "all";

function normalizeSection(raw: unknown, assignmentType?: string | null): PinSection {
  const s = String(raw ?? "").trim();
  if (s === "lead" || s === "college" || s === "project" || s === "all") return s;
  const t = String(assignmentType ?? "").trim();
  if (t === "lead" || t === "college" || t === "project") return t;
  return "all";
}

/**
 * POST { taskIds: string[], section?: "lead"|"college"|"project"|"all" }
 * Upserts employee_task_pins with pin_section for the caller's dashboard buckets.
 */
export async function POST(request: Request) {
  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;

  let body: { taskIds?: unknown; section?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const taskIds = [...new Set(parseClientIds(body.taskIds))];
  if (!taskIds.length) {
    return NextResponse.json({ error: "Select at least one task." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id,assignment_type,assigned_to,assigned_by")
    .in("id", taskIds);

  if (tasksError) {
    return NextResponse.json({ error: tasksError.message }, { status: 400 });
  }

  const allowed = (tasks ?? []).filter((t) => {
    const row = t as { assigned_to?: string | null; assigned_by?: string | null };
    return row.assigned_to === user.id || row.assigned_by === user.id;
  });
  if (!allowed.length) {
    return NextResponse.json({ error: "No selectable tasks found for your account." }, { status: 403 });
  }

  const now = new Date().toISOString();
  const preferSection =
    body.section === "lead" || body.section === "college" || body.section === "project" || body.section === "all"
      ? (body.section as PinSection)
      : null;

  const rows = allowed.map((t) => {
    const row = t as { id: string; assignment_type?: string | null };
    return {
      user_id: user.id,
      task_id: row.id,
      pin_section: preferSection ?? normalizeSection(null, row.assignment_type),
      pinned_at: now,
    };
  });

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    // Fall back to user client if service role missing
    const { error } = await supabase.from("employee_task_pins").upsert(rows, { onConflict: "user_id,task_id" });
    if (error) {
      return NextResponse.json(
        {
          error:
            /pin_section|column|permission|denied|update/i.test(error.message)
              ? "Run AJ_Academy_SB/employee_task_pins_section_patch.sql (pin_section + UPDATE grant)."
              : error.message,
        },
        { status: 400 },
      );
    }
    return NextResponse.json({
      pinned: rows.length,
      sections: [...new Set(rows.map((r) => r.pin_section))],
      warning: e instanceof Error ? e.message : "Pinned without service role.",
    });
  }

  const { error: pinError } = await admin.from("employee_task_pins").upsert(rows, {
    onConflict: "user_id,task_id",
  });
  if (pinError) {
    return NextResponse.json({ error: pinError.message }, { status: 400 });
  }

  return NextResponse.json({
    pinned: rows.length,
    sections: [...new Set(rows.map((r) => r.pin_section))],
  });
}
