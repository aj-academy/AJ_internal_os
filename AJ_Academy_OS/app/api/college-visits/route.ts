import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffApiSession } from "@/lib/security";
import { COLLEGE_VISIT_SELECT } from "@/components/college-visits/collegeVisitsHelpers";
import { buildPayloadFromApi, mapCollegeVisitRow, parseCollegeVisitBody } from "@/lib/collegeVisitsApi";

export async function GET(request: Request) {
  const { response, user, profile } = await requireStaffApiSession();
  if (response || !user) return response!;

  const url = new URL(request.url);
  const mine = url.searchParams.get("mine") === "1";
  const role = profile?.role?.trim().toLowerCase() ?? "";
  const isDbAdmin = role === "admin" || role === "super_admin";

  const supabase = await createClient();
  let q = supabase.from("college_visits").select(COLLEGE_VISIT_SELECT).order("updated_at", { ascending: false }).limit(800);
  if (mine && !isDbAdmin) {
    q = q.eq("assigned_to", user.id);
  }

  const { data, error } = await q;
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

  const role = profile?.role?.trim().toLowerCase() ?? "";
  const isDbAdmin = role === "admin" || role === "super_admin";
  const payload = buildPayloadFromApi(parsed.form, user.id, isDbAdmin);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("college_visits")
    .insert({ ...payload, created_by: user.id })
    .select(COLLEGE_VISIT_SELECT)
    .single();

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
