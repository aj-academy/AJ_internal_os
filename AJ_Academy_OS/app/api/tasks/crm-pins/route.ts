import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffApiSession } from "@/lib/security";
import { parseClientIds } from "@/lib/taskActivities";
import {
  STUDENT_LEAD_SELECT,
  STUDENT_LEAD_SELECT_NO_PROPOSAL_FILES,
  isMissingStudentProposalFileColumn,
} from "@/components/student-lead-master/studentMasterHelpers";
import {
  COLLEGE_VISIT_SELECT,
  nextCollegeVisitSelect,
} from "@/components/college-visits/collegeVisitsHelpers";
import { mapCollegeVisitRow } from "@/lib/collegeVisitsApi";

type EntityType = "lead" | "college";

/**
 * POST { taskIds: string[], entityType?: "lead"|"college" }
 * Pins linked Student Master / College Visit rows for the employee CRM modules.
 */
export async function POST(request: Request) {
  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;

  let body: { taskIds?: unknown; entityType?: unknown; section?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const taskIds = [...new Set(parseClientIds(body.taskIds))];
  if (!taskIds.length) {
    return NextResponse.json({ error: "Select at least one task." }, { status: 400 });
  }

  const rawType = String(body.entityType || body.section || "").trim();
  let entityType: EntityType | null =
    rawType === "lead" || rawType === "college" ? rawType : null;

  const supabase = await createClient();
  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id,assignment_type,client_ids,college_visit_ids,assigned_to,assigned_by")
    .in("id", taskIds);

  if (tasksError) {
    return NextResponse.json({ error: tasksError.message }, { status: 400 });
  }

  const allowed = (tasks ?? []).filter((t) => {
    const row = t as { assigned_to?: string | null; assigned_by?: string | null; assignment_type?: string | null };
    return row.assigned_to === user.id || row.assigned_by === user.id;
  });
  if (!allowed.length) {
    return NextResponse.json({ error: "No selectable tasks found for your account." }, { status: 403 });
  }

  if (!entityType) {
    const types = new Set(
      allowed.map((t) => String((t as { assignment_type?: string | null }).assignment_type || "")),
    );
    if (types.has("lead") && !types.has("college")) entityType = "lead";
    else if (types.has("college") && !types.has("lead")) entityType = "college";
    else {
      return NextResponse.json(
        { error: "Open Student Lead or College Visit subsection, then Pin selected." },
        { status: 400 },
      );
    }
  }

  // Prefer atomic RPC
  const { data: rpcCount, error: rpcError } = await supabase.rpc("upsert_my_crm_pins_from_tasks", {
    p_task_ids: allowed.map((t) => (t as { id: string }).id),
    p_entity_type: entityType,
  });

  if (!rpcError) {
    const n = typeof rpcCount === "number" ? rpcCount : Number(rpcCount) || 0;
    return NextResponse.json({
      pinned: n,
      entityType,
      destination: entityType === "lead" ? "Student Master → All Students" : "College Visits",
    });
  }

  // Fallback when RPC not deployed: service-role / user upsert
  if (!/upsert_my_crm_pins_from_tasks|function|schema cache|could not find/i.test(rpcError.message)) {
    return NextResponse.json({ error: rpcError.message }, { status: 400 });
  }

  const now = new Date().toISOString();
  const rows: {
    user_id: string;
    entity_type: EntityType;
    entity_id: string;
    source_task_id: string;
    pinned_at: string;
  }[] = [];

  for (const t of allowed) {
    const row = t as {
      id: string;
      client_ids?: unknown;
      college_visit_ids?: unknown;
    };
    const ids =
      entityType === "lead" ? parseClientIds(row.client_ids) : parseClientIds(row.college_visit_ids);
    for (const entity_id of ids) {
      rows.push({
        user_id: user.id,
        entity_type: entityType,
        entity_id,
        source_task_id: row.id,
        pinned_at: now,
      });
    }
  }

  if (!rows.length) {
    return NextResponse.json(
      { error: `No linked ${entityType === "lead" ? "student leads" : "colleges"} on the selected tasks.` },
      { status: 400 },
    );
  }

  let writer = supabase;
  try {
    writer = createAdminClient();
  } catch {
    /* use user client */
  }

  const { error: upError } = await writer.from("employee_crm_pins").upsert(rows, {
    onConflict: "user_id,entity_type,entity_id",
  });
  if (upError) {
    return NextResponse.json(
      {
        error:
          /employee_crm_pins|schema|column/i.test(upError.message)
            ? "Run AJ_Academy_SB/employee_crm_pins.sql in Supabase, then try again."
            : upError.message,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    pinned: rows.length,
    entityType,
    destination: entityType === "lead" ? "Student Master → All Students" : "College Visits",
    warning: "RPC missing; used fallback upsert. Run employee_crm_pins.sql.",
  });
}

/** GET ?type=lead|college&full=1 — pinned entity ids (and full CRM rows when full=1) */
export async function GET(request: Request) {
  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;

  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "";
  const wantFull = url.searchParams.get("full") === "1";
  if (type !== "lead" && type !== "college") {
    return NextResponse.json({ error: "type must be lead or college" }, { status: 400 });
  }

  const supabase = await createClient();
  let ids: string[] = [];
  const { data, error } = await supabase.rpc("get_my_crm_pin_ids", { p_entity_type: type });
  if (!error) {
    ids = Array.isArray(data) ? (data as string[]) : [];
  } else {
    const { data: rows, error: selErr } = await supabase
      .from("employee_crm_pins")
      .select("entity_id")
      .eq("user_id", user.id)
      .eq("entity_type", type);
    if (selErr) {
      return NextResponse.json(
        {
          error:
            /employee_crm_pins/i.test(selErr.message)
              ? "Run AJ_Academy_SB/employee_crm_pins.sql in Supabase."
              : selErr.message,
          ids: [],
          clients: [],
          colleges: [],
        },
        { status: 400 },
      );
    }
    ids = (rows ?? []).map((r) => r.entity_id as string);
  }

  if (!wantFull || !ids.length) {
    return NextResponse.json({ ids, clients: [], colleges: [] });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return NextResponse.json(
      {
        ids,
        clients: [],
        colleges: [],
        error: e instanceof Error ? e.message : "Admin client unavailable.",
      },
      { status: 500 },
    );
  }

  if (type === "lead") {
    let select = STUDENT_LEAD_SELECT;
    let { data: clients, error: cErr } = await admin.from("clients").select(select).in("id", ids);
    if (cErr && isMissingStudentProposalFileColumn(cErr.message)) {
      select = STUDENT_LEAD_SELECT_NO_PROPOSAL_FILES;
      ({ data: clients, error: cErr } = await admin.from("clients").select(select).in("id", ids));
    }
    if (cErr) {
      return NextResponse.json({ ids, clients: [], colleges: [], error: cErr.message }, { status: 400 });
    }
    return NextResponse.json({ ids, clients: clients ?? [], colleges: [] });
  }

  let select = COLLEGE_VISIT_SELECT;
  let { data: colleges, error: vErr } = await admin.from("college_visits").select(select).in("id", ids);
  while (vErr) {
    const fallback = nextCollegeVisitSelect(select, vErr.message);
    if (!fallback) break;
    select = fallback;
    ({ data: colleges, error: vErr } = await admin.from("college_visits").select(select).in("id", ids));
  }
  if (vErr) {
    return NextResponse.json({ ids, clients: [], colleges: [], error: vErr.message }, { status: 400 });
  }
  return NextResponse.json({ ids, clients: [], colleges: (colleges ?? []).map((r) => mapCollegeVisitRow(r)) });
}
