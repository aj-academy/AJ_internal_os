import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProposalEntityKind } from "@/lib/proposalFiles";
import {
  COLLEGE_FILE_VISIBILITY,
  isAdminRole,
  type CollegeFileVisibility,
} from "@/lib/college-visits/fileVisibility";

export class EntityAccessError extends Error {
  readonly status: number;

  constructor(message = "Not found.", status = 404) {
    super(message);
    this.name = "EntityAccessError";
    this.status = status;
  }
}

/**
 * Uses the caller-scoped Supabase client so the existing entity RLS remains
 * authoritative. Service-role file operations must call this first.
 */
export async function assertCanAccessProposalEntity(
  client: SupabaseClient,
  entityType: ProposalEntityKind,
  entityId: string,
): Promise<void> {
  const table = entityType === "student" ? "clients" : "college_visits";
  const { data, error } = await client.from(table).select("id").eq("id", entityId).maybeSingle();
  if (error || !data) throw new EntityAccessError();
}

/** College folder owners can access every row in files they uploaded, not only own/created/task rows. */
export async function assertStaffCanAccessProposalEntity(
  admin: SupabaseClient,
  userClient: SupabaseClient,
  userId: string,
  isAdmin: boolean,
  entityType: ProposalEntityKind,
  entityId: string,
): Promise<void> {
  if (entityType === "college") {
    const ok = await actorCanAccessCollegeVisit(admin, userId, isAdmin, entityId);
    if (!ok) throw new EntityAccessError();
    return;
  }
  await assertCanAccessProposalEntity(userClient, entityType, entityId);
}

export function collectCollegeIdsFromTaskRows(
  rows: Array<{ college_visit_ids?: unknown }>,
): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    const raw = row.college_visit_ids;
    const list = Array.isArray(raw)
      ? raw
      : typeof raw === "string"
        ? (() => {
            try {
              const parsed = JSON.parse(raw) as unknown;
              return Array.isArray(parsed) ? parsed : [];
            } catch {
              return [];
            }
          })()
        : [];
    for (const value of list) {
      if (typeof value === "string" && value.trim()) ids.add(value.trim());
    }
  }
  return [...ids];
}

export async function employeeUploadedBatchIds(
  admin: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data } = await admin
    .from("college_visit_import_batches")
    .select("id")
    .eq("uploaded_by", userId)
    .limit(500);
  return [...new Set((data ?? []).map((row) => String(row.id)).filter(Boolean))];
}

/** Same visibility as College Visits GET: Admin and Employee can open every college. */
export async function actorCanAccessCollegeVisit(
  admin: SupabaseClient,
  _userId: string,
  _isAdmin: boolean,
  collegeId: string,
): Promise<boolean> {
  const { data: row } = await admin
    .from("college_visits")
    .select("id")
    .eq("id", collegeId)
    .maybeSingle();
  return Boolean(row?.id);
}

export function canActorReadFile(
  actorRole: string | null | undefined,
  visibility: CollegeFileVisibility | string | null | undefined,
): boolean {
  return (
    isAdminRole(actorRole) ||
    visibility === COLLEGE_FILE_VISIBILITY.ADMIN_EMPLOYEE
  );
}

export function expectedProposalPathPrefix(entityType: ProposalEntityKind, entityId: string): string {
  return `${entityType === "student" ? "students" : "colleges"}/${entityId}/`;
}

export function assertProposalPathMatchesEntity(
  entityType: ProposalEntityKind,
  entityId: string,
  filePath: string,
): void {
  if (!filePath.startsWith(expectedProposalPathPrefix(entityType, entityId))) {
    throw new EntityAccessError("File does not belong to this record.", 403);
  }
}

type CollegeFileRow = {
  entity_id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_at: string;
};

export async function attachCollegeCreatorAttribution<
  T extends { created_by?: string | null },
>(admin: SupabaseClient, rows: T[]): Promise<T[]> {
  const creatorIds = [
    ...new Set(rows.map((row) => row.created_by).filter((id): id is string => Boolean(id))),
  ];
  if (!creatorIds.length) return rows;

  const { data } = await admin
    .from("profiles")
    .select("id,full_name,email,role")
    .in("id", creatorIds);
  const creators = new Map(
    (data ?? []).map((profile) => [
      profile.id,
      {
        name: profile.full_name || profile.email || null,
        role: profile.role || null,
      },
    ]),
  );

  return rows.map((row) => {
    const creator = row.created_by ? creators.get(row.created_by) : null;
    return {
      ...row,
      created_by_name: creator?.name ?? null,
      created_by_role: creator?.role ?? null,
    };
  });
}

export async function attachImportBatchNames<
  T extends { import_batch_id?: string | null },
>(admin: SupabaseClient, rows: T[]): Promise<T[]> {
  const batchIds = [
    ...new Set(rows.map((row) => row.import_batch_id).filter((id): id is string => Boolean(id))),
  ];
  if (!batchIds.length) return rows;

  const { data } = await admin
    .from("college_visit_import_batches")
    .select("id,file_name,uploaded_at,batch_number,status,uploaded_by")
    .in("id", batchIds);
  const folders = new Map(
    (data ?? []).map((batch) => [
      batch.id,
      {
        name: batch.file_name as string,
        uploaded_at: (batch.uploaded_at as string) || "",
        batch_number: (batch.batch_number as string) || "",
        status: (batch.status as string) || "completed",
        uploaded_by: (batch.uploaded_by as string | null) ?? null,
      },
    ]),
  );

  return rows.map((row) => {
    const folder = row.import_batch_id ? folders.get(row.import_batch_id) : null;
    return {
      ...row,
      import_batch_name: folder?.name ?? null,
      import_batch_uploaded_at: folder?.uploaded_at ?? null,
      import_batch_number: folder?.batch_number ?? null,
      import_batch_status: folder?.status ?? null,
      import_batch_uploaded_by: folder?.uploaded_by ?? null,
    };
  });
}

export async function overlayCollegeFileMetadataForActor<T extends { id: string }>(
  admin: SupabaseClient,
  rows: T[],
  actorRole: string | null | undefined,
): Promise<T[]> {
  if (!rows.length) return rows;
  const ids = rows.map((row) => row.id).filter(Boolean);
  const newestByEntity = new Map<string, CollegeFileRow>();
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    let query = admin
      .from("proposal_files")
      .select("entity_id,file_name,file_path,file_type,file_size,uploaded_at")
      .eq("entity_type", "college")
      .in("entity_id", chunk)
      .order("uploaded_at", { ascending: false });
    if (!isAdminRole(actorRole)) {
      query = query.eq("visibility_scope", COLLEGE_FILE_VISIBILITY.ADMIN_EMPLOYEE);
    }
    const { data, error } = await query;
    if (error) continue;
    for (const raw of data ?? []) {
      const file = raw as CollegeFileRow;
      if (!newestByEntity.has(file.entity_id)) newestByEntity.set(file.entity_id, file);
    }
  }

  return rows.map((row) => {
    const file = newestByEntity.get(row.id);
    return {
      ...row,
      ...(!isAdminRole(actorRole)
        ? {
            proposal_link: null,
            proposal_pdf_url: null,
            proposal_pdf_name: null,
          }
        : {}),
      proposal_file_name: file?.file_name ?? null,
      proposal_file_path: file?.file_path ?? null,
      proposal_file_type: file?.file_type ?? null,
      proposal_file_size: file?.file_size ?? null,
      proposal_uploaded_at: file?.uploaded_at ?? null,
    } as T;
  });
}

/** List payloads should not query every proposal file. Hide Admin-only URLs instead. */
export function redactCollegeListFileFieldsForActor<T extends { id: string }>(
  rows: T[],
  actorRole: string | null | undefined,
): T[] {
  if (isAdminRole(actorRole)) return rows;
  return rows.map((row) => ({
    ...row,
    proposal_link: null,
    proposal_pdf_url: null,
    proposal_pdf_name: null,
    proposal_file_name: null,
    proposal_file_path: null,
    proposal_file_type: null,
    proposal_file_size: null,
    proposal_uploaded_at: null,
  }));
}

/**
 * Employee College responses must never expose the legacy latest-file columns
 * when that latest file is Admin-only. Overlay the newest authorized multi-file
 * row and fail closed (all file/link fields null) if visibility is unavailable.
 */
export async function sanitizeCollegeFileMetadataForEmployee<T extends { id: string }>(
  admin: SupabaseClient,
  rows: T[],
): Promise<T[]> {
  return overlayCollegeFileMetadataForActor(admin, rows, "employee");
}
