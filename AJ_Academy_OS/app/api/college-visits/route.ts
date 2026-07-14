import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffApiSession } from "@/lib/security";
import {
  COLLEGE_VISIT_SELECT,
  isMissingContactsColumn,
  isMissingProposalFileColumn,
  nextCollegeVisitSelect,
} from "@/components/college-visits/collegeVisitsHelpers";
import { buildPayloadFromApi, mapCollegeVisitRow, parseCollegeVisitBody } from "@/lib/collegeVisitsApi";

function stripUnavailableColumns(payload: Record<string, unknown>, errorMsg: string) {
  const next = { ...payload };
  if (isMissingContactsColumn(errorMsg)) delete next.contacts;
  if (isMissingProposalFileColumn(errorMsg)) {
    delete next.proposal_file_name;
    delete next.proposal_file_path;
    delete next.proposal_file_type;
    delete next.proposal_file_size;
    delete next.proposal_uploaded_at;
  }
  return next;
}

export async function GET(request: Request) {
  const { response, user, profile } = await requireStaffApiSession();
  if (response || !user) return response!;

  void request;
  void profile;

  const supabase = await createClient();
  // Own College Visits only. Sharing is via task assignment (task-linked rows appear in My Tasks).
  let select = COLLEGE_VISIT_SELECT;
  let { data, error } = await supabase
    .from("college_visits")
    .select(select)
    .eq("assigned_to", user.id)
    .order("updated_at", { ascending: false })
    .limit(800);

  while (error) {
    const fallback = nextCollegeVisitSelect(select, error.message);
    if (!fallback) break;
    select = fallback;
    ({ data, error } = await supabase
      .from("college_visits")
      .select(select)
      .eq("assigned_to", user.id)
      .order("updated_at", { ascending: false })
      .limit(800));
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ visits: (data ?? []).map((r) => mapCollegeVisitRow(r)) });
}

export async function POST(request: Request) {
  const { response, user, profile } = await requireStaffApiSession();
  if (response || !user) return response!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseCollegeVisitBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  void profile;
  const payload = buildPayloadFromApi(parsed.form, user.id, false);
  payload.assigned_to = user.id;

  const supabase = await createClient();
  let insertPayload: Record<string, unknown> = { ...payload, created_by: user.id, assigned_to: user.id };
  let select = COLLEGE_VISIT_SELECT;
  let { data, error } = await supabase.from("college_visits").insert(insertPayload).select(select).single();

  while (error) {
    const stripped = stripUnavailableColumns(insertPayload, error.message);
    const fallbackSelect = nextCollegeVisitSelect(select, error.message);
    const payloadChanged = JSON.stringify(stripped) !== JSON.stringify(insertPayload);
    if (!fallbackSelect && !payloadChanged) break;
    insertPayload = stripped;
    if (fallbackSelect) select = fallbackSelect;
    ({ data, error } = await supabase.from("college_visits").insert(insertPayload).select(select).single());
  }

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not create college visit." }, { status: 400 });
  }

  const created = mapCollegeVisitRow(data);
  await supabase.from("college_visit_activities").insert({
    college_visit_id: created.id,
    activity_type: "College Created",
    notes: `Source: ${payload.source_reference ?? "—"}`,
    created_by: user.id,
  });

  return NextResponse.json({ visit: created });
}
