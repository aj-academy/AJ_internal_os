import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COLLEGE_VISIT_SELECT,
  isMissingContactsColumn,
  isMissingImportBatchColumn,
  isMissingProposalFileColumn,
  isMissingVisitedByColumn,
  nextCollegeVisitSelect,
} from "@/components/college-visits/collegeVisitsHelpers";

function stripUnavailableColumns(payload: Record<string, unknown>, errorMsg: string) {
  const next = { ...payload };
  if (isMissingVisitedByColumn(errorMsg)) {
    delete next.visited_by_name;
    delete next.visited_by;
  }
  if (isMissingContactsColumn(errorMsg)) delete next.contacts;
  if (isMissingImportBatchColumn(errorMsg)) delete next.import_batch_id;
  if (isMissingProposalFileColumn(errorMsg)) {
    delete next.proposal_file_name;
    delete next.proposal_file_path;
    delete next.proposal_file_type;
    delete next.proposal_file_size;
    delete next.proposal_uploaded_at;
  }
  return next;
}

async function insertOneWithFallback(
  admin: SupabaseClient,
  row: Record<string, unknown>,
): Promise<{ id: string; error: string | null }> {
  let insertPayload: Record<string, unknown> = { ...row };
  let select = COLLEGE_VISIT_SELECT;
  let { data, error } = await admin.from("college_visits").insert(insertPayload).select("id").single();
  let lastError = error?.message ?? null;

  while (error) {
    const stripped = stripUnavailableColumns(insertPayload, error.message);
    const fallbackSelect = nextCollegeVisitSelect(select, error.message);
    const payloadChanged = JSON.stringify(stripped) !== JSON.stringify(insertPayload);
    if (!fallbackSelect && !payloadChanged) break;
    insertPayload = stripped;
    if (fallbackSelect) select = fallbackSelect;
    ({ data, error } = await admin.from("college_visits").insert(insertPayload).select("id").single());
    lastError = error?.message ?? lastError;
  }

  if (error || !data?.id) return { id: "", error: lastError ?? "Insert failed." };
  return { id: String(data.id), error: null };
}

/** Insert college visits with column/schema fallbacks (matches single-create API resilience). */
export async function insertCollegeVisitsBulk(
  admin: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<{ results: ({ id: string } | null)[]; lastError: string | null }> {
  if (!rows.length) return { results: [], lastError: null };

  const bulk = rows.map((row) => ({ ...row }));
  const { data, error } = await admin.from("college_visits").insert(bulk).select("id");

  if (!error && data?.length === rows.length) {
    return {
      results: data.map((r) => ({ id: String(r.id) })),
      lastError: null,
    };
  }

  const results: ({ id: string } | null)[] = [];
  let lastError = error?.message ?? null;

  for (const row of rows) {
    const one = await insertOneWithFallback(admin, row);
    if (one.error) lastError = one.error;
    results.push(one.id ? { id: one.id } : null);
  }

  return { results, lastError };
}
