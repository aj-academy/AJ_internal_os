import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffApiSession } from "@/lib/security";
import { COLLEGE_VISIT_SELECT } from "@/components/college-visits/collegeVisitsHelpers";
import { buildPayloadFromApi, mapCollegeVisitRow, parseCollegeVisitBody } from "@/lib/collegeVisitsApi";
import { deleteOwnedCollegeVisits } from "@/lib/crmOwnedDelete";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { response, user, profile } = await requireStaffApiSession();
  if (response || !user) return response!;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseCollegeVisitBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const role = profile?.role?.trim().toLowerCase() ?? "";
  void role;
  const payload = buildPayloadFromApi(parsed.form, user.id, false);

  const supabase = await createClient();
  const { data: prev } = await supabase.from("college_visits").select(COLLEGE_VISIT_SELECT).eq("id", id).maybeSingle();

  // Never transfer ownership via edit — share via College Visit tasks only.
  delete payload.assigned_to;

  const { data, error } = await supabase.from("college_visits").update(payload).eq("id", id).select(COLLEGE_VISIT_SELECT).single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not update college visit." }, { status: 400 });
  }

  const prevRow = prev as Record<string, unknown> | null;
  const activities: Record<string, unknown>[] = [];
  if (prevRow && String(prevRow.assigned_to ?? "") !== String(payload.assigned_to ?? "")) {
    activities.push({
      college_visit_id: id,
      activity_type: "Owner Changed",
      old_value: String(prevRow.assigned_to ?? "Unassigned"),
      new_value: String(payload.assigned_to ?? "Unassigned"),
      created_by: user.id,
    });
  }
  if (prevRow && String(prevRow.visit_status ?? "") !== String(payload.visit_status ?? "")) {
    activities.push({
      college_visit_id: id,
      activity_type: "Visit Status Changed",
      old_value: String(prevRow.visit_status ?? ""),
      new_value: String(payload.visit_status ?? ""),
      created_by: user.id,
    });
  }
  if (activities.length) {
    await supabase.from("college_visit_activities").insert(activities);
  } else {
    await supabase.from("college_visit_activities").insert({
      college_visit_id: id,
      activity_type: "College Updated",
      notes: String(payload.last_outcome_remarks ?? "") || null,
      created_by: user.id,
    });
  }

  return NextResponse.json({ visit: mapCollegeVisitRow(data) });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const supabase = await createClient();
  const { deleted, error } = await deleteOwnedCollegeVisits(supabase, [id], user.id);
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (!deleted) {
    return NextResponse.json(
      { error: "Could not delete this college visit (you can only delete your own rows). Run AJ_Academy_SB/crm_delete_fix.sql in Supabase if needed." },
      { status: 403 },
    );
  }

  return NextResponse.json({ ok: true, deleted });
}
