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

export async function overlayCollegeFileMetadataForActor<T extends { id: string }>(
  admin: SupabaseClient,
  rows: T[],
  actorRole: string | null | undefined,
): Promise<T[]> {
  if (!rows.length) return rows;
  const ids = rows.map((row) => row.id).filter(Boolean);
  let query = admin
    .from("proposal_files")
    .select("entity_id,file_name,file_path,file_type,file_size,uploaded_at")
    .eq("entity_type", "college")
    .in("entity_id", ids)
    .order("uploaded_at", { ascending: false });
  if (!isAdminRole(actorRole)) {
    query = query.eq("visibility_scope", COLLEGE_FILE_VISIBILITY.ADMIN_EMPLOYEE);
  }
  const { data, error } = await query;

  const newestByEntity = new Map<string, CollegeFileRow>();
  if (!error) {
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
