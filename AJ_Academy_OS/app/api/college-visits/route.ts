import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffApiSession } from "@/lib/security";
import { COLLEGE_VISIT_SELECT, COLLEGE_VISIT_SELECT_LEGACY, isMissingContactsColumn } from "@/components/college-visits/collegeVisitsHelpers";
import { buildPayloadFromApi, mapCollegeVisitRow, parseCollegeVisitBody } from "@/lib/collegeVisitsApi";

export async function GET(request: Request) {
  const { response, user, profile } = await requireStaffApiSession();
  if (response || !user) return response!;

  void request;
  void profile;

  const supabase = await createClient();
  // Own College Visits only. Sharing is via task assignment (task-linked rows appear in My Tasks).
  let q = supabase
    .from("college_visits")
    .select(COLLEGE_VISIT_SELECT)
    .eq("assigned_to", user.id)
    .order("updated_at", { ascending: false })
    .limit(800);

  let { data, error } = await q;
  if (error && isMissingContactsColumn(error.message)) {
    q = supabase
      .from("college_visits")
      .select(COLLEGE_VISIT_SELECT_LEGACY)
      .eq("assigned_to", user.id)
      .order("updated_at", { ascending: false })
      .limit(800);
    ({ data, error } = await q);
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
  let insertPayload = { ...payload, created_by: user.id, assigned_to: user.id };
  let { data, error } = await supabase
    .from("college_visits")
    .insert(insertPayload)
    .select(COLLEGE_VISIT_SELECT)
    .single();

  if (error && isMissingContactsColumn(error.message)) {
    const { contacts: _contacts, ...withoutContacts } = insertPayload as Record<string, unknown>;
    void _contacts;
    ({ data, error } = await supabase
      .from("college_visits")
      .insert(withoutContacts)
      .select(COLLEGE_VISIT_SELECT_LEGACY)
      .single());
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
