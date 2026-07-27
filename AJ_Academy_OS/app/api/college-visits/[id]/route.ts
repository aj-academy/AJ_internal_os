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
  if (isMissingVisitedByColumn(errorMsg)) delete next.visited_by_name;
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

const TRACKED_FIELDS: { key: string; label: string }[] = [
  { key: "college_name", label: "College name" },
  { key: "location", label: "Location" },
  { key: "contact_number", label: "Contact number" },
  { key: "email", label: "Email" },
  { key: "connected_person_name", label: "Contact person" },
  { key: "connected_person_role", label: "Contact role" },
  { key: "visit_status", label: "Visit status" },
  { key: "visited_by_name", label: "Whom visited to the college" },
  { key: "visit_date", label: "Visit date" },
  { key: "mou_signed_status", label: "MOU status" },
  { key: "follow_up_stage", label: "Follow-up stage" },
  { key: "last_follow_up_date", label: "Last follow-up date" },
  { key: "next_follow_up_date", label: "Next follow-up date" },
  { key: "priority", label: "Priority" },
  { key: "description", label: "Description" },
  { key: "last_outcome_remarks", label: "Outcome remarks" },
  { key: "lead_score", label: "Lead score" },
  { key: "final_status", label: "Final status" },
  { key: "source_reference", label: "Source" },
  { key: "proposal_status", label: "Proposal status" },
  { key: "proposal_amount", label: "Proposal amount" },
  { key: "proposal_sent_date", label: "Proposal sent date" },
  { key: "proposal_link", label: "Proposal link" },
  { key: "proposal_pdf_url", label: "Proposal PDF" },
  { key: "contacts", label: "Contacts" },
];

function normalizeForCompare(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeDateText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.slice(0, 10);
}

function formatContacts(value: unknown): string {
  if (!Array.isArray(value)) return "—";
  const items = value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return "";
      const row = item as Record<string, unknown>;
      const name = String(row.name ?? "").trim();
      const role = String(row.role ?? "").trim();
      const phones = Array.isArray(row.phones)
        ? row.phones.map((p) => String(p ?? "").trim()).filter(Boolean).join(" / ")
        : "";
      const email = String(row.email ?? "").trim();
      const main = [role, name].filter(Boolean).join(" · ") || "Contact";
      const extras = [phones, email].filter(Boolean).join(" | ");
      return extras ? `${main} (${extras})` : main;
    })
    .filter(Boolean);
  return items.length ? items.join("; ") : "—";
}

async function loadProfileNameMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!unique.length) return {};
  const { data } = await supabase
    .from("profiles")
    .select("id,full_name,email")
    .in("id", unique);
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    const r = row as { id: string; full_name?: string | null; email?: string | null };
    out[r.id] = r.full_name?.trim() || r.email?.trim() || "Team member";
  }
  return out;
}

function formatTrackedValue(
  key: string,
  value: unknown,
  nameMap: Record<string, string>,
): string {
  if (value == null || value === "") return "—";
  if (key === "contacts") return formatContacts(value);
  if (key === "proposal_amount") return String(value);
  if (key.endsWith("_date") || key === "visit_date") {
    const d = normalizeDateText(value);
    return d || "—";
  }
  if (key === "assigned_to" || key === "assigned_by" || key === "visited_by") {
    const raw = String(value).trim();
    return nameMap[raw] || "Team member";
  }
  return String(value);
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
  if (prevRow) {
    const trackedKeys = TRACKED_FIELDS.map((f) => f.key);
    const nameCandidateIds: string[] = [];
    for (const key of trackedKeys) {
      const oldVal = prevRow[key];
      const newVal = updatePayload[key];
      if (key === "assigned_to" || key === "assigned_by" || key === "visited_by") {
        if (oldVal) nameCandidateIds.push(String(oldVal));
        if (newVal) nameCandidateIds.push(String(newVal));
      }
    }
    const profileNameMap = await loadProfileNameMap(supabase, nameCandidateIds);
    for (const field of TRACKED_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(updatePayload, field.key)) continue;
      const oldVal = prevRow[field.key];
      const newVal = updatePayload[field.key];
      const changed =
        field.key.endsWith("_date") || field.key === "visit_date"
          ? normalizeDateText(oldVal) !== normalizeDateText(newVal)
          : normalizeForCompare(oldVal) !== normalizeForCompare(newVal);
      if (!changed) continue;
      activities.push({
        college_visit_id: id,
        activity_type: `${field.label} updated`,
        old_value: formatTrackedValue(field.key, oldVal, profileNameMap),
        new_value: formatTrackedValue(field.key, newVal, profileNameMap),
        created_by: user.id,
      });
    }
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
