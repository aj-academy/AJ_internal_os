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
import { appendOutcomeRemarkLog } from "@/lib/outcomeRemarks";

/** PostgREST caps rows per request, so visits are fetched in pages. */
const VISITS_PAGE_SIZE = 1000;

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

export async function GET(request: Request) {
  const { response, user, profile } = await requireStaffApiSession();
  if (response || !user) return response!;

  void request;

  const role = profile?.role?.trim().toLowerCase() ?? "";
  const isAdmin = role === "admin" || role === "super_admin";
  // Paged so large imports never push older colleges (e.g. the legacy "All Colleges"
  // folder) out of a single capped response.
  const maxRows = isAdmin ? 20000 : 4000;

  const supabase = await createClient();
  // Admin: all employees' colleges (tracking). Employee: own assigned_to only (+ CRM pins merged below).
  let select = COLLEGE_VISIT_SELECT;
  const rows: unknown[] = [];
  let error: { message: string } | null = null;

  for (let from = 0; from < maxRows; from += VISITS_PAGE_SIZE) {
    const to = Math.min(from + VISITS_PAGE_SIZE, maxRows) - 1;
    let page: unknown[] = [];

    for (;;) {
      let q = supabase
        .from("college_visits")
        .select(select)
        .order("updated_at", { ascending: false })
        // Tie-breaker keeps paging deterministic when updated_at repeats.
        .order("id", { ascending: true })
        .range(from, to);
      if (!isAdmin) q = q.eq("assigned_to", user.id);
      const res = await q;
      if (!res.error) {
        page = res.data ?? [];
        error = null;
        break;
      }
      const fallback = nextCollegeVisitSelect(select, res.error.message);
      if (!fallback) {
        error = res.error;
        break;
      }
      select = fallback;
    }

    if (error) break;
    rows.push(...page);
    if (page.length < to - from + 1) break;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  let visits = rows.map((r) => mapCollegeVisitRow(r));
  const pinIds: string[] = [];

  if (!isAdmin) {
    try {
      const { data: rpcIds, error: pinRpcErr } = await supabase.rpc("get_my_crm_pin_ids", {
        p_entity_type: "college",
      });
      if (!pinRpcErr && Array.isArray(rpcIds)) {
        pinIds.push(...(rpcIds as string[]));
      } else {
        const { data: pinRows } = await supabase
          .from("employee_crm_pins")
          .select("entity_id")
          .eq("user_id", user.id)
          .eq("entity_type", "college");
        for (const r of pinRows ?? []) {
          if (r.entity_id) pinIds.push(String(r.entity_id));
        }
      }
    } catch {
      /* pins optional until SQL deployed */
    }

    const ownedIds = new Set(visits.map((v) => v.id));
    const missing = [...new Set(pinIds)].filter((id) => !ownedIds.has(id));
    if (missing.length) {
      try {
        const { createAdminClient } = await import("@/lib/supabase/admin");
        const admin = createAdminClient();
        let pinSelect = COLLEGE_VISIT_SELECT;
        let { data: pinData, error: pinErr } = await admin
          .from("college_visits")
          .select(pinSelect)
          .in("id", missing);
        while (pinErr) {
          const fallback = nextCollegeVisitSelect(pinSelect, pinErr.message);
          if (!fallback) break;
          pinSelect = fallback;
          ({ data: pinData, error: pinErr } = await admin.from("college_visits").select(pinSelect).in("id", missing));
        }
        if (!pinErr && pinData?.length) {
          visits = [...visits, ...pinData.map((r) => mapCollegeVisitRow(r))];
          visits.sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
        }
      } catch {
        /* service role missing — owned rows still returned */
      }
    }
  }

  return NextResponse.json({ visits, pinIds: [...new Set(pinIds)] });
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
  if (parsed.form.last_outcome_remarks.trim()) {
    payload.last_outcome_remarks = appendOutcomeRemarkLog(null, parsed.form.last_outcome_remarks);
  }

  const record = body as Record<string, unknown>;
  const importBatchId =
    typeof record.import_batch_id === "string" && record.import_batch_id.trim()
      ? record.import_batch_id.trim()
      : null;

  const supabase = await createClient();
  let insertPayload: Record<string, unknown> = { ...payload, created_by: user.id, assigned_to: user.id };
  if (importBatchId) insertPayload.import_batch_id = importBatchId;
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
