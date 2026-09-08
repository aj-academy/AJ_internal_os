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
