import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffApiSession } from "@/lib/security";
import {
  COLLEGE_VISIT_SELECT,
  isMissingContactsColumn,
  isMissingProposalFileColumn,
  isMissingVisitedByColumn,
  nextCollegeVisitSelect,
} from "@/components/college-visits/collegeVisitsHelpers";
import { buildPayloadFromApi, mapCollegeVisitRow, parseCollegeVisitBody } from "@/lib/collegeVisitsApi";
import { deleteOwnedCollegeVisits } from "@/lib/crmOwnedDelete";

type RouteContext = { params: Promise<{ id: string }> };

function stripUnavailableColumns(payload: Record<string, unknown>, errorMsg: string) {
  const next = { ...payload };
  if (isMissingContactsColumn(errorMsg)) delete next.contacts;
  if (isMissingVisitedByColumn(errorMsg)) delete next.visited_by;
  if (isMissingProposalFileColumn(errorMsg)) {
    delete next.proposal_file_name;
    delete next.proposal_file_path;
    delete next.proposal_file_type;
    delete next.proposal_file_size;
    delete next.proposal_uploaded_at;
  }
  return next;
}

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
  let prevSelect = COLLEGE_VISIT_SELECT;
  let { data: prev, error: prevError } = await supabase.from("college_visits").select(prevSelect).eq("id", id).maybeSingle();
  while (prevError) {
    const fallback = nextCollegeVisitSelect(prevSelect, prevError.message);
    if (!fallback) break;
    prevSelect = fallback;
    ({ data: prev, error: prevError } = await supabase.from("college_visits").select(prevSelect).eq("id", id).maybeSingle());
  }

  // Never transfer ownership via edit — share via College Visit tasks only.
  delete payload.assigned_to;

  let updatePayload: Record<string, unknown> = { ...payload };
  let select = COLLEGE_VISIT_SELECT;
  let { data, error } = await supabase.from("college_visits").update(updatePayload).eq("id", id).select(select).single();

  while (error) {
    const stripped = stripUnavailableColumns(updatePayload, error.message);
    const fallbackSelect = nextCollegeVisitSelect(select, error.message);
    const payloadChanged = JSON.stringify(stripped) !== JSON.stringify(updatePayload);
    if (!fallbackSelect && !payloadChanged) break;
    updatePayload = stripped;
    if (fallbackSelect) select = fallbackSelect;
    ({ data, error } = await supabase.from("college_visits").update(updatePayload).eq("id", id).select(select).single());
  }

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
  const proposalTouched =
    prevRow &&
    (String(prevRow.proposal_status ?? "") !== String(payload.proposal_status ?? "") ||
      String(prevRow.proposal_link ?? "") !== String(payload.proposal_link ?? "") ||
      String(prevRow.proposal_pdf_url ?? "") !== String(payload.proposal_pdf_url ?? "") ||
      String(prevRow.proposal_amount ?? "") !== String(payload.proposal_amount ?? "") ||
      String(prevRow.proposal_sent_date ?? "").slice(0, 10) !== String(payload.proposal_sent_date ?? "").slice(0, 10));
  if (proposalTouched) {
    activities.push({
      college_visit_id: id,
      activity_type: "Proposal Updated",
      old_value: String(prevRow.proposal_status ?? "Not Sent"),
      new_value: String(payload.proposal_status ?? "Not Sent"),
      notes: [payload.proposal_link ? "link" : null, payload.proposal_pdf_url ? "pdf" : null].filter(Boolean).join("+") || null,
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
  const { response, user, profile } = await requireStaffApiSession();
  if (response || !user) return response!;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const role = profile?.role?.trim().toLowerCase() ?? "";
  const isAdmin = role === "admin" || role === "super_admin";

  const supabase = await createClient();
  const { deleted, error } = await deleteOwnedCollegeVisits(supabase, [id], user.id, { isAdmin });
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (!deleted) {
    return NextResponse.json(
      {
        error: isAdmin
          ? "Could not delete this college visit. Re-run AJ_Academy_SB/crm_delete_fix.sql in Supabase if needed."
          : "Could not delete this college visit (you can only delete your own rows). Run AJ_Academy_SB/crm_delete_fix.sql in Supabase if needed.",
      },
      { status: 403 },
    );
  }

  return NextResponse.json({ ok: true, deleted });
}
