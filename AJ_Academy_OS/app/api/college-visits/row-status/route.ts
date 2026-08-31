import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffApiSession, enforceRateLimit } from "@/lib/security";
import { foldOutreachFlags, type CollegeOutreachFlags } from "@/lib/college-visits/outreachActivity";

export const runtime = "nodejs";

/**
 * Per-college row status for the College Visits and task tables.
 *
 * Two things the college row itself cannot answer:
 *
 * 1. Whether Call / WhatsApp / Email has happened. `college_visits` has no
 *    outreach columns, so this is derived from `college_visit_activities`.
 * 2. Who the work is actually assigned to. `college_visits.assigned_to` stays
 *    as the admin who created or imported the row, because assigning a task
 *    deliberately does not transfer CRM ownership. The employee lives on
 *    `tasks.assigned_to` for tasks whose `college_visit_ids` include this row.
 *
 * Uses the RLS-scoped client, so a caller only ever sees activities and tasks
 * they are already allowed to read.
 */

const MAX_IDS = 2000;
const IN_CHUNK = 300;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AssignedEmployee = { id: string; name: string | null };

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "college-visits:row-status", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;

  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawIds = (body as { ids?: unknown })?.ids;
  if (!Array.isArray(rawIds)) {
    return NextResponse.json({ error: "ids must be an array." }, { status: 400 });
  }

  const ids = [...new Set(rawIds.filter((v): v is string => typeof v === "string" && UUID_RE.test(v)))].slice(
    0,
    MAX_IDS,
  );
  if (!ids.length) {
    return NextResponse.json({ outreach: {}, assigned: {} });
  }

  const supabase = await createClient();

  // --- 1. Outreach flags from the activity log -----------------------------
  const activityRows: { college_visit_id: string | null; activity_type: string | null }[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const { data, error } = await supabase
      .from("college_visit_activities")
      .select("college_visit_id,activity_type")
      .in("college_visit_id", chunk);
    // A missing activities table should not break the table rendering.
    if (error) break;
    activityRows.push(...(data ?? []));
  }
  const outreach: Record<string, CollegeOutreachFlags> = foldOutreachFlags(activityRows);

  // --- 2. Assigned employee from linked tasks ------------------------------
  const assigned: Record<string, AssignedEmployee> = {};
  const requested = new Set(ids);

  const { data: taskRows } = await supabase
    .from("tasks")
    .select("id,assigned_to,college_visit_ids,created_at")
    .eq("assignment_type", "college")
    .order("created_at", { ascending: true });

  // Later tasks win, so re-assigning a college shows the current owner.
  const employeeIds = new Set<string>();
  for (const task of taskRows ?? []) {
    const assignee = (task as { assigned_to?: string | null }).assigned_to;
    if (!assignee) continue;
    const linked = (task as { college_visit_ids?: unknown }).college_visit_ids;
    if (!Array.isArray(linked)) continue;
    for (const raw of linked) {
      if (typeof raw !== "string" || !requested.has(raw)) continue;
      assigned[raw] = { id: assignee, name: null };
      employeeIds.add(assignee);
    }
  }

  if (employeeIds.size) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id,full_name,email")
      .in("id", [...employeeIds]);
    const nameById = new Map<string, string | null>(
      (profiles ?? []).map((p) => {
        const row = p as { id: string; full_name?: string | null; email?: string | null };
        return [row.id, row.full_name?.trim() || row.email?.trim() || null];
      }),
    );
    for (const value of Object.values(assigned)) {
      value.name = nameById.get(value.id) ?? null;
    }
  }

  return NextResponse.json({ outreach, assigned });
}
