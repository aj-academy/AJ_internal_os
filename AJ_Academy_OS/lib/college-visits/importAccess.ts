import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  COLLEGE_VISIT_SELECT,
  nextCollegeVisitSelect,
} from "@/components/college-visits/collegeVisitsHelpers";
import { mapCollegeVisitRow } from "@/lib/collegeVisitsApi";
import { isAdminRole } from "@/lib/college-visits/fileVisibility";
import { requireStaffApiSession } from "@/lib/security";
import type { Profile } from "@/types/profile";

export const COLLEGE_IMPORT_BATCH_SELECT =
  "id,batch_number,file_name,file_hash,row_count,new_count,duplicate_count,invalid_count,created_count,skipped_count,failed_count,status,uploaded_at,uploaded_by,error_message,meta";

export type CollegeImportBatchRecord = {
  id: string;
  uploaded_by?: string | null;
  status?: string | null;
  file_name?: string | null;
  created_count?: number | null;
  new_count?: number | null;
  row_count?: number | null;
  skipped_count?: number | null;
  failed_count?: number | null;
  meta?: unknown;
  [key: string]: unknown;
};

export async function requireCollegeVisitImportActor(): Promise<
  | { response: NextResponse; user: null; profile: null; isAdmin: false }
  | { response: null; user: User; profile: Profile | null; isAdmin: boolean }
> {
  const auth = await requireStaffApiSession();
  if (auth.response || !auth.user) {
    return { response: auth.response!, user: null, profile: null, isAdmin: false };
  }
  return {
    response: null,
    user: auth.user,
    profile: auth.profile,
    isAdmin: isAdminRole(auth.profile?.role),
  };
}

/** Admin sees every folder. Employees see folders they uploaded plus any folder already attached to their colleges. */
export async function listImportBatchesForActor(
  admin: SupabaseClient,
  userId: string,
  isAdmin: boolean,
): Promise<{ batches: CollegeImportBatchRecord[]; error: { message: string } | null }> {
  if (isAdmin) {
    const { data, error } = await admin
      .from("college_visit_import_batches")
      .select(COLLEGE_IMPORT_BATCH_SELECT)
      .order("uploaded_at", { ascending: false })
      .limit(200);
    return { batches: (data ?? []) as CollegeImportBatchRecord[], error: error ? { message: error.message } : null };
  }

  const { data: owned, error: ownedError } = await admin
    .from("college_visit_import_batches")
    .select(COLLEGE_IMPORT_BATCH_SELECT)
    .eq("uploaded_by", userId)
    .order("uploaded_at", { ascending: false })
    .limit(200);
  if (ownedError) return { batches: [], error: { message: ownedError.message } };

  const merged = new Map<string, CollegeImportBatchRecord>();
  for (const row of owned ?? []) merged.set(String(row.id), row as CollegeImportBatchRecord);

  const { data: visitRows } = await admin
    .from("college_visits")
    .select("import_batch_id")
    .or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
    .not("import_batch_id", "is", null)
    .limit(4000);
  const extraIds = [
    ...new Set(
      (visitRows ?? [])
        .map((row) => (row.import_batch_id ? String(row.import_batch_id) : ""))
        .filter((id) => id && !merged.has(id)),
    ),
  ];
  if (extraIds.length) {
    const { data: extraBatches } = await admin
      .from("college_visit_import_batches")
      .select(COLLEGE_IMPORT_BATCH_SELECT)
      .in("id", extraIds.slice(0, 200));
    for (const row of extraBatches ?? []) {
      merged.set(String(row.id), row as CollegeImportBatchRecord);
    }
  }

  const batches = [...merged.values()].sort((a, b) =>
    String(b.uploaded_at ?? "").localeCompare(String(a.uploaded_at ?? "")),
  );
  return { batches, error: null };
}

export async function ensureEmployeeManualFolder(
  admin: SupabaseClient,
  userId: string,
  profile: Profile | null,
): Promise<string | null> {
  const { data: existing } = await admin
    .from("college_visit_import_batches")
    .select("id,meta")
    .eq("uploaded_by", userId)
    .order("uploaded_at", { ascending: false })
    .limit(50);
  const owned = (existing ?? []).find((row) => {
    const meta = row.meta as { source?: string } | null;
    return meta?.source === "manual_folder";
  });
  if (owned?.id) return String(owned.id);

  const folderName =
    (profile?.full_name || profile?.email || "My colleges")
      .replace(/[\u0000-\u001f<>:"/\\|?*]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "My colleges";

  const { data: batchNumber, error: numberError } = await admin.rpc(
    "college_visit_import_next_batch_number",
  );
  if (numberError || !batchNumber) return null;

  const { data: folder, error } = await admin
    .from("college_visit_import_batches")
    .insert({
      batch_number: batchNumber,
      file_name: folderName,
      row_count: 0,
      new_count: 0,
      duplicate_count: 0,
      invalid_count: 0,
      created_count: 0,
      skipped_count: 0,
      failed_count: 0,
      status: "completed",
      uploaded_by: userId,
      meta: { source: "manual_folder" },
    })
    .select("id")
    .single();
  if (error || !folder?.id) return null;
  return String(folder.id);
}

export async function createNamedManualFolder(
  admin: SupabaseClient,
  userId: string,
  folderNameRaw: string,
  isAdmin: boolean,
): Promise<{ id: string; fileName: string } | { id: null; fileName: null; error: string }> {
  const folderName = folderNameRaw.trim();
  if (!folderName) return { id: null, fileName: null, error: "Folder name is required." };
  if (folderName.length > 120) {
    return { id: null, fileName: null, error: "Folder name must be 120 characters or fewer." };
  }
  if (/[\u0000-\u001f<>:"/\\|?*]/.test(folderName)) {
    return { id: null, fileName: null, error: "Folder name contains unsupported characters." };
  }

  const { data: existing, error: existingError } = await admin
    .from("college_visit_import_batches")
    .select("id,file_name,uploaded_by")
    .order("uploaded_at", { ascending: false })
    .limit(1000);
  if (existingError) return { id: null, fileName: null, error: existingError.message };

  const nameKey = folderName.toLocaleLowerCase();
  const duplicatePool = isAdmin
    ? existing ?? []
    : (existing ?? []).filter((row) => row.uploaded_by === userId);
  const duplicate = duplicatePool.find(
    (row) => String(row.file_name || "").trim().toLocaleLowerCase() === nameKey,
  );
  if (duplicate?.id) {
    return { id: String(duplicate.id), fileName: folderName };
  }

  const { data: batchNumber, error: numberError } = await admin.rpc(
    "college_visit_import_next_batch_number",
  );
  if (numberError || !batchNumber) {
    return { id: null, fileName: null, error: numberError?.message || "Could not allocate a folder number." };
  }

  const { data: folder, error } = await admin
    .from("college_visit_import_batches")
    .insert({
      batch_number: batchNumber,
      file_name: folderName,
      row_count: 0,
      new_count: 0,
      duplicate_count: 0,
      invalid_count: 0,
      created_count: 0,
      skipped_count: 0,
      failed_count: 0,
      status: "completed",
      uploaded_by: userId,
      meta: { source: "manual_folder" },
    })
    .select("id,file_name")
    .single();
  if (error || !folder?.id) {
    return { id: null, fileName: null, error: error?.message || "Could not create folder." };
  }
  return { id: String(folder.id), fileName: folder.file_name || folderName };
}

export function actorOwnsImportBatch(
  batch: { uploaded_by?: string | null },
  userId: string,
  isAdmin: boolean,
): boolean {
  return isAdmin || batch.uploaded_by === userId;
}

export async function loadImportBatchForActor(
  admin: SupabaseClient,
  batchId: string,
  userId: string,
  isAdmin: boolean,
  columns = COLLEGE_IMPORT_BATCH_SELECT,
): Promise<
  | { batch: CollegeImportBatchRecord; error: null; status: 200 }
  | { batch: null; error: string; status: 400 | 404 }
> {
  const { data, error } = await admin
    .from("college_visit_import_batches")
    .select(columns)
    .eq("id", batchId)
    .maybeSingle();
  if (error) return { batch: null, error: error.message, status: 400 };
  const batch = (data ?? null) as CollegeImportBatchRecord | null;
  if (!batch || !actorOwnsImportBatch(batch, userId, isAdmin)) {
    return { batch: null, error: "Import batch not found.", status: 404 };
  }
  return { batch, error: null, status: 200 };
}

export async function loadCollegeVisitsForDuplicateMatch(
  client: SupabaseClient,
  maxRows: number,
) {
  const pageSize = 1000;
  let select = COLLEGE_VISIT_SELECT;
  const rows: unknown[] = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize, maxRows) - 1;
    let page: unknown[] = [];

    for (;;) {
      const res = await client
        .from("college_visits")
        .select(select)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);
      if (!res.error) {
        page = res.data ?? [];
        break;
      }
      const fallback = nextCollegeVisitSelect(select, res.error.message);
      if (!fallback) break;
      select = fallback;
    }

    rows.push(...page);
    if (page.length < to - from + 1) break;
  }

  return rows.map((row) => mapCollegeVisitRow(row));
}

export async function attachImportBatchUploaderAttribution<
  T extends { uploaded_by?: string | null },
>(admin: SupabaseClient, rows: T[]): Promise<T[]> {
  const uploaderIds = [
    ...new Set(rows.map((row) => row.uploaded_by).filter((id): id is string => Boolean(id))),
  ];
  if (!uploaderIds.length) return rows;

  const { data } = await admin
    .from("profiles")
    .select("id,full_name,email,role")
    .in("id", uploaderIds);
  const uploaders = new Map(
    (data ?? []).map((profile) => [
      profile.id,
      {
        name: profile.full_name || profile.email || null,
        role: profile.role || null,
      },
    ]),
  );

  return rows.map((row) => {
    const uploader = row.uploaded_by ? uploaders.get(row.uploaded_by) : null;
    return {
      ...row,
      uploaded_by_name: uploader?.name ?? null,
      uploaded_by_role: uploader?.role ?? null,
    };
  });
}
