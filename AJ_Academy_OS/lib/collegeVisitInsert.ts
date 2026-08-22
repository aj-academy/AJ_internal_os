import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COLLEGE_VISIT_SELECT,
  isMissingContactsColumn,
  isMissingImportBatchColumn,
  isMissingProposalFileColumn,
  isMissingVisitedByColumn,
  nextCollegeVisitSelect,
} from "@/components/college-visits/collegeVisitsHelpers";

const DATE_COLUMNS = new Set([
  "visit_date",
  "last_follow_up_date",
  "next_follow_up_date",
  "proposal_sent_date",
]);

function isMissingProposalColumn(errorMsg: string) {
  const m = errorMsg.toLowerCase();
  return (
    m.includes("proposal_") &&
    (m.includes("column") || m.includes("schema cache") || m.includes("does not exist"))
  );
}

function stripColumnNamed(payload: Record<string, unknown>, column: string) {
  if (!(column in payload)) return payload;
  const next = { ...payload };
  delete next[column];
  return next;
}

function stripColumnFromError(payload: Record<string, unknown>, errorMsg: string): Record<string, unknown> | null {
  const patterns = [
    /column ["']?([\w]+)["']? (?:of relation [\w.]+ )?does not exist/i,
    /Could not find the '([\w]+)' column/i,
    /schema cache.*['"]([\w]+)['"]/i,
  ];
  for (const pattern of patterns) {
    const match = errorMsg.match(pattern);
    if (match?.[1]) return stripColumnNamed(payload, match[1]);
  }
  return null;
}

function stripUnavailableColumns(payload: Record<string, unknown>, errorMsg: string) {
  let next = { ...payload };
  if (isMissingVisitedByColumn(errorMsg)) {
    delete next.visited_by_name;
    delete next.visited_by;
  }
  if (isMissingContactsColumn(errorMsg)) delete next.contacts;
  if (isMissingImportBatchColumn(errorMsg)) delete next.import_batch_id;
  if (isMissingProposalFileColumn(errorMsg) || isMissingProposalColumn(errorMsg)) {
    for (const key of Object.keys(next)) {
      if (key.startsWith("proposal_")) delete next[key];
    }
  }
  const fromError = stripColumnFromError(next, errorMsg);
  if (fromError) next = fromError;
  return next;
}

function normalizeDateValue(value: unknown): string | null {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Clean insert payloads before DB write (invalid dates, empty strings). */
export function sanitizeCollegeVisitInsertPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...payload };
  for (const key of DATE_COLUMNS) {
    if (key in next) next[key] = normalizeDateValue(next[key]);
  }
  if ("proposal_amount" in next) {
    const raw = next.proposal_amount;
    const n = typeof raw === "number" ? raw : Number(raw);
    next.proposal_amount = Number.isFinite(n) ? n : null;
  }
  for (const [key, value] of Object.entries(next)) {
    if (typeof value === "string" && value.trim() === "" && !DATE_COLUMNS.has(key)) {
      next[key] = null;
    }
  }
  return next;
}

async function insertOneWithFallback(
  admin: SupabaseClient,
  row: Record<string, unknown>,
): Promise<{ id: string; error: string | null }> {
  let insertPayload = sanitizeCollegeVisitInsertPayload(row);
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

  const bulk = rows.map((row) => sanitizeCollegeVisitInsertPayload(row));
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
