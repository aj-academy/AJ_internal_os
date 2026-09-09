import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireStaffApiSession } from "@/lib/security";
import { assertStaffCanAccessProposalEntity, EntityAccessError } from "@/lib/college-visits/access";
import { COLLEGE_FILE_VISIBILITY, isAdminRole } from "@/lib/college-visits/fileVisibility";
import type { ProposalEntityKind, ProposalStoredFile } from "@/lib/proposalFiles";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { response, user, profile } = await requireStaffApiSession();
  if (response || !user) return response!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const kind =
    record.entityType === "student" || record.entityType === "college"
      ? (record.entityType as ProposalEntityKind)
      : null;
  const entityId = typeof record.entityId === "string" ? record.entityId.trim() : "";
  if (!kind || !entityId) {
    return NextResponse.json({ error: "entityType and entityId are required." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const callerClient = await createClient();
    await assertStaffCanAccessProposalEntity(
      admin,
      callerClient,
      user.id,
      isAdminRole(profile?.role),
      kind,
      entityId,
    );
  } catch (e) {
    const status = e instanceof EntityAccessError ? e.status : 404;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Not found." }, { status });
  }

  const admin = createAdminClient();
  let query = admin
    .from("proposal_files")
    .select(
      "id,entity_type,entity_id,file_name,file_path,file_type,file_size,uploaded_at,uploaded_by,visibility_scope",
    )
    .eq("entity_type", kind)
    .eq("entity_id", entityId)
    .order("uploaded_at", { ascending: false });
  if (kind === "college" && !isAdminRole(profile?.role)) {
    query = query.eq("visibility_scope", COLLEGE_FILE_VISIBILITY.ADMIN_EMPLOYEE);
  }
  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        files: [],
        schemaMissing: error.message.toLowerCase().includes("visibility_scope"),
      },
      { status: 400 },
    );
  }

  const uploaderIds = [...new Set((data ?? []).map((file) => file.uploaded_by).filter(Boolean))] as string[];
  const uploaderMap = new Map<string, { full_name: string | null; email: string | null; role: string | null }>();
  if (uploaderIds.length) {
    const { data: uploaders } = await admin
      .from("profiles")
      .select("id,full_name,email,role")
      .in("id", uploaderIds);
    for (const uploader of uploaders ?? []) uploaderMap.set(uploader.id, uploader);
  }

  const files = (data ?? []).map((file) => {
    const uploader = file.uploaded_by ? uploaderMap.get(file.uploaded_by) : null;
    return {
      ...file,
      uploader_name: uploader?.full_name || uploader?.email || null,
      uploader_role: uploader?.role || null,
      can_remove: isAdminRole(profile?.role) || file.uploaded_by === user.id,
    };
  }) as ProposalStoredFile[];

  return NextResponse.json({ files, schemaMissing: false });
}
