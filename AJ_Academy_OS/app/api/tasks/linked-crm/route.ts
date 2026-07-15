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

function normalizeIdList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((v) => String(v ?? "").trim())
      .filter((id) => id.length > 0);
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      return normalizeIdList(JSON.parse(raw));
    } catch {
      return raw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return parseClientIds(raw);
}

/**
 * POST { clientIds?: string[], collegeIds?: string[] }
 * Returns full Student Master / College Visit rows for IDs linked on the caller's tasks.
 * Uses service role for the CRM read after verifying task membership via the user session.
 */
export async function POST(request: Request) {
  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;

  let body: { clientIds?: unknown; collegeIds?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const requestedClientIds = [...new Set(normalizeIdList(body.clientIds))];
  const requestedCollegeIds = [...new Set(normalizeIdList(body.collegeIds))];
  if (!requestedClientIds.length && !requestedCollegeIds.length) {
    return NextResponse.json({ clients: [], colleges: [] });
  }

  const supabase = await createClient();
  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("client_ids,college_visit_ids,assigned_to,assigned_by")
    .or(`assigned_to.eq.${user.id},assigned_by.eq.${user.id}`);

  if (tasksError) {
    return NextResponse.json({ error: tasksError.message }, { status: 400 });
  }

  const allowedClients = new Set<string>();
  const allowedColleges = new Set<string>();
  for (const t of tasks ?? []) {
    const row = t as {
      client_ids?: unknown;
      college_visit_ids?: unknown;
      assigned_to?: string | null;
      assigned_by?: string | null;
    };
    if (row.assigned_to !== user.id && row.assigned_by !== user.id) continue;
    for (const id of normalizeIdList(row.client_ids)) allowedClients.add(id);
    for (const id of normalizeIdList(row.college_visit_ids)) allowedColleges.add(id);
  }

  const clientIds = requestedClientIds.filter((id) => allowedClients.has(id));
  const collegeIds = requestedCollegeIds.filter((id) => allowedColleges.has(id));

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Admin client unavailable." },
      { status: 500 },
    );
  }

  let clients: unknown[] = [];
  if (clientIds.length) {
    let select = STUDENT_LEAD_SELECT;
    let { data, error } = await admin.from("clients").select(select).in("id", clientIds);
    if (error && isMissingStudentProposalFileColumn(error.message)) {
      select = STUDENT_LEAD_SELECT_NO_PROPOSAL_FILES;
      ({ data, error } = await admin.from("clients").select(select).in("id", clientIds));
    }
    if (error) {
      // Last resort: core contact fields only
      const minimal = await admin
        .from("clients")
        .select(
          "id,lead_name,name,phone,whatsapp,email,city,status,priority,assigned_to,phone_called,whatsapp_sent,email_sent,college_company,company_name,source,lead_stage,follow_up_date,fee_quoted,final_fee,payment_status,admission_status",
        )
        .in("id", clientIds);
      if (minimal.error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      clients = minimal.data ?? [];
    } else {
      clients = data ?? [];
    }
  }

  let colleges: unknown[] = [];
  if (collegeIds.length) {
    let select = COLLEGE_VISIT_SELECT;
    let { data, error } = await admin.from("college_visits").select(select).in("id", collegeIds);
    while (error) {
      const fallback = nextCollegeVisitSelect(select, error.message);
      if (!fallback) break;
      select = fallback;
      ({ data, error } = await admin.from("college_visits").select(select).in("id", collegeIds));
    }
    if (error) {
      return NextResponse.json({ error: error.message, clients, colleges: [] }, { status: 400 });
    }
    colleges = data ?? [];
  }

  return NextResponse.json({ clients, colleges });
}
