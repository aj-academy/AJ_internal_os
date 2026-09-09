import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
import {
  attachCollegeCreatorAttribution,
  attachImportBatchNames,
  collectCollegeIdsFromTaskRows,
  employeeUploadedBatchIds,
  redactCollegeListFileFieldsForActor,
} from "@/lib/college-visits/access";
import { isAdminRole } from "@/lib/college-visits/fileVisibility";
import { ensureEmployeeManualFolder, createNamedManualFolder } from "@/lib/college-visits/importAccess";

export const dynamic = "force-dynamic";

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

async function pageCollegeVisits(
  client: ReturnType<typeof createAdminClient>,
  maxRows: number,
  ownerUserId?: string,
) {
  let select = COLLEGE_VISIT_SELECT;
  const rows: unknown[] = [];
  let error: { message: string } | null = null;

  for (let from = 0; from < maxRows; from += VISITS_PAGE_SIZE) {
    const to = Math.min(from + VISITS_PAGE_SIZE, maxRows) - 1;
    let page: unknown[] = [];

    for (;;) {
      let q = client
        .from("college_visits")
        .select(select)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);
      if (ownerUserId) {
        q = q.or(`assigned_to.eq.${ownerUserId},created_by.eq.${ownerUserId}`);
      }
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

  return { rows, error, select };
}

async function loadCollegeVisitsByIds(
  client: ReturnType<typeof createAdminClient>,
  select: string,
  ids: string[],
) {
  const rows: unknown[] = [];
  let currentSelect = select;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    let { data, error } = await client.from("college_visits").select(currentSelect).in("id", chunk);
    while (error) {
      const fallback = nextCollegeVisitSelect(currentSelect, error.message);
      if (!fallback) break;
      currentSelect = fallback;
      ({ data, error } = await client.from("college_visits").select(currentSelect).in("id", chunk));
    }
    if (!error && data?.length) rows.push(...data);
  }
  return { rows, select: currentSelect };
}

async function loadCollegeVisitsByBatchIds(
  client: ReturnType<typeof createAdminClient>,
  select: string,
  batchIds: string[],
) {
  const rows: unknown[] = [];
  let currentSelect = select;
  for (const batchId of batchIds) {
    for (let from = 0; from < 20000; from += VISITS_PAGE_SIZE) {
      const to = from + VISITS_PAGE_SIZE - 1;
      let page: unknown[] = [];
      let error: { message: string } | null = null;
      for (;;) {
        const res = await client
          .from("college_visits")
          .select(currentSelect)
          .eq("import_batch_id", batchId)
          .order("id", { ascending: true })
          .range(from, to);
        if (!res.error) {
          page = res.data ?? [];
          error = null;
          break;
        }
        const fallback = nextCollegeVisitSelect(currentSelect, res.error.message);
        if (!fallback) {
          error = res.error;
          break;
        }
        currentSelect = fallback;
      }
      if (error) break;
      if (page.length) rows.push(...page);
      if (page.length < VISITS_PAGE_SIZE) break;
    }
  }
  return { rows, select: currentSelect };
}

export async function GET(request: Request) {
  const { response, user, profile } = await requireStaffApiSession();
  if (response || !user) return response!;

  void request;

  const role = profile?.role?.trim().toLowerCase() ?? "";
  const isAdmin = isAdminRole(role);
  const maxRows = isAdmin ? 20000 : 4000;
  const admin = createAdminClient();

  // Service role avoids per-row RLS (`is_admin()` / `task_links_college()`), which
  // was the main reason College Visits felt frozen for both Admin and Employee.
  const paged = await pageCollegeVisits(admin, maxRows, isAdmin ? undefined : user.id);
  if (paged.error) {
    return NextResponse.json({ error: paged.error.message }, { status: 400 });
  }

  let visits = paged.rows.map((r) => mapCollegeVisitRow(r));
  const pinIds: string[] = [];

  if (!isAdmin) {
    const seen = new Set(visits.map((v) => v.id));
    const mergeRows = (rawRows: unknown[]) => {
      for (const row of rawRows) {
        const mapped = mapCollegeVisitRow(row);
        if (seen.has(mapped.id)) continue;
        seen.add(mapped.id);
        visits.push(mapped);
      }
    };

    const folderIds = await employeeUploadedBatchIds(admin, user.id);
    if (folderIds.length) {
      const fromFolders = await loadCollegeVisitsByBatchIds(admin, paged.select, folderIds);
      mergeRows(fromFolders.rows);
    }

    const { data: taskRows } = await admin
      .from("tasks")
      .select("college_visit_ids")
      .or(`assigned_to.eq.${user.id},assigned_by.eq.${user.id}`);
    const linkedIds = collectCollegeIdsFromTaskRows(taskRows ?? []).filter((id) => !seen.has(id));
    if (linkedIds.length) {
      const linked = await loadCollegeVisitsByIds(admin, paged.select, linkedIds);
      mergeRows(linked.rows);
    }

    const supabase = await createClient();
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

    const missing = [...new Set(pinIds)].filter((id) => !seen.has(id));
    if (missing.length) {
      const pinned = await loadCollegeVisitsByIds(admin, paged.select, missing);
      mergeRows(pinned.rows);
    }
    visits.sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
  }

  visits = redactCollegeListFileFieldsForActor(visits, role);
  const [withCreators, withFolders] = await Promise.all([
    attachCollegeCreatorAttribution(admin, visits),
    attachImportBatchNames(admin, visits),
  ]);
  visits = withCreators.map((row, index) => ({
    ...row,
    import_batch_name: withFolders[index]?.import_batch_name ?? null,
    import_batch_uploaded_at: withFolders[index]?.import_batch_uploaded_at ?? null,
    import_batch_number: withFolders[index]?.import_batch_number ?? null,
    import_batch_status: withFolders[index]?.import_batch_status ?? null,
    import_batch_uploaded_by: withFolders[index]?.import_batch_uploaded_by ?? null,
  }));

  return NextResponse.json(
    { visits, pinIds: [...new Set(pinIds)] },
    { headers: { "Cache-Control": "no-store" } },
  );
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

  const payload = buildPayloadFromApi(parsed.form, user.id, false);
  payload.assigned_to = user.id;
  if (parsed.form.last_outcome_remarks.trim()) {
    payload.last_outcome_remarks = appendOutcomeRemarkLog(null, parsed.form.last_outcome_remarks);
  }

  const record = body as Record<string, unknown>;
  const isAdmin = isAdminRole(profile?.role);
  const admin = createAdminClient();
  const requestedFolderName =
    typeof record.folderName === "string" ? record.folderName.trim() : "";
  const saveToAllColleges = record.all_colleges === true;
  let importBatchId =
    typeof record.import_batch_id === "string" && record.import_batch_id.trim()
      ? record.import_batch_id.trim()
      : null;

  if (!importBatchId && requestedFolderName) {
    const created = await createNamedManualFolder(admin, user.id, requestedFolderName, isAdmin);
    if ("error" in created) {
      return NextResponse.json({ error: created.error || "Could not create folder." }, { status: 400 });
    }
    importBatchId = created.id;
  }

  if (!importBatchId && !isAdmin && !saveToAllColleges) {
    try {
      importBatchId = await ensureEmployeeManualFolder(admin, user.id, profile);
    } catch {
      importBatchId = null;
    }
  }

  if (importBatchId) {
    const { data: folder, error: folderError } = await admin
      .from("college_visit_import_batches")
      .select("id,uploaded_by")
      .eq("id", importBatchId)
      .maybeSingle();
    if (folderError || !folder) {
      return NextResponse.json(
        { error: folderError?.message || "Selected folder no longer exists." },
        { status: 400 },
      );
    }
    if (!isAdmin && folder.uploaded_by && folder.uploaded_by !== user.id) {
      const { count } = await admin
        .from("college_visits")
        .select("id", { count: "exact", head: true })
        .eq("import_batch_id", importBatchId)
        .or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`);
      if (!count) {
        return NextResponse.json(
          { error: "You can only save a college into a folder already on your All Colleges list." },
          { status: 403 },
        );
      }
    }
  }

  // Service role after session check: Employee JWT cannot see import folders
  // (admin-only RLS), so a user-scoped insert with import_batch_id can fail the FK.
  let insertPayload: Record<string, unknown> = { ...payload, created_by: user.id, assigned_to: user.id };
  if (importBatchId) insertPayload.import_batch_id = importBatchId;
  let select = COLLEGE_VISIT_SELECT;
  let { data, error } = await admin.from("college_visits").insert(insertPayload).select(select).single();

  while (error) {
    const stripped = stripUnavailableColumns(insertPayload, error.message);
    const fallbackSelect = nextCollegeVisitSelect(select, error.message);
    const payloadChanged = JSON.stringify(stripped) !== JSON.stringify(insertPayload);
    if (!fallbackSelect && !payloadChanged) break;
    insertPayload = stripped;
    if (fallbackSelect) select = fallbackSelect;
    ({ data, error } = await admin.from("college_visits").insert(insertPayload).select(select).single());
  }

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not create college visit." }, { status: 400 });
  }

  const created = mapCollegeVisitRow(data);
  if (importBatchId) {
    const { data: batch } = await admin
      .from("college_visit_import_batches")
      .select("row_count,created_count")
      .eq("id", importBatchId)
      .maybeSingle();
    if (batch) {
      await admin
        .from("college_visit_import_batches")
        .update({
          row_count: Number(batch.row_count || 0) + 1,
          created_count: Number(batch.created_count || 0) + 1,
          uploaded_at: new Date().toISOString(),
        })
        .eq("id", importBatchId);
    }
  }
  await admin.from("college_visit_activities").insert({
    college_visit_id: created.id,
    activity_type: "College Created",
    notes: `Source: ${payload.source_reference ?? "—"}`,
    created_by: user.id,
  });

  return NextResponse.json({ visit: created });
}
