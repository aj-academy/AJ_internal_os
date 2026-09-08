import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireStaffApiSession } from "@/lib/security";
import {
  assertCanAccessProposalEntity,
  assertProposalPathMatchesEntity,
  canActorReadFile,
  EntityAccessError,
} from "@/lib/college-visits/access";
import { isAdminRole } from "@/lib/college-visits/fileVisibility";
import { PROPOSALS_BUCKET, type ProposalEntityKind } from "@/lib/proposalFiles";

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
  const kind = record.entityType === "student" || record.entityType === "college" ? (record.entityType as ProposalEntityKind) : null;
  const entityId = typeof record.entityId === "string" ? record.entityId.trim() : "";
  const filePath = typeof record.filePath === "string" ? record.filePath.trim() : "";
  const fileId = typeof record.fileId === "string" ? record.fileId.trim() : "";

  if (!kind || !entityId) {
    return NextResponse.json({ error: "entityType and entityId are required." }, { status: 400 });
  }

  try {
    const callerClient = await createClient();
    await assertCanAccessProposalEntity(callerClient, kind, entityId);
    if (filePath) assertProposalPathMatchesEntity(kind, entityId, filePath);
  } catch (e) {
    const status = e instanceof EntityAccessError ? e.status : 404;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Not found." }, { status });
  }

  const admin = createAdminClient();
  const table = kind === "student" ? "clients" : "college_visits";
  if (filePath || fileId) {
    let targetQuery = admin
      .from("proposal_files")
      .select("id,file_name,file_path,uploaded_by,visibility_scope")
      .eq("entity_type", kind)
      .eq("entity_id", entityId);
    targetQuery = fileId ? targetQuery.eq("id", fileId) : targetQuery.eq("file_path", filePath);
    const { data: target, error: targetError } = await targetQuery.maybeSingle();
    if (targetError || !target) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }
    if (!canActorReadFile(profile?.role, target.visibility_scope)) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }
    if (!isAdminRole(profile?.role) && target.uploaded_by !== user.id) {
      return NextResponse.json({ error: "You can remove only files you uploaded." }, { status: 403 });
    }
    assertProposalPathMatchesEntity(kind, entityId, target.file_path);

    const { error: deleteError } = await admin.from("proposal_files").delete().eq("id", target.id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });
    await admin.storage.from(PROPOSALS_BUCKET).remove([target.file_path]).catch(() => undefined);
    if (kind === "college") {
      await admin.from("college_visit_activities").insert({
        college_visit_id: entityId,
        activity_type: "File Removed",
        notes: target.file_name,
        created_by: user.id,
        visibility_scope: target.visibility_scope,
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (kind === "college" && !isAdminRole(profile?.role)) {
    return NextResponse.json(
      { error: "Select one of your visible files to remove." },
      { status: 403 },
    );
  }

  const { data, error } = await admin.from(table).select("proposal_file_path").eq("id", entityId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const path = typeof data?.proposal_file_path === "string" ? data.proposal_file_path : null;

  const clearMeta = { proposal_file_name: null, proposal_file_path: null, proposal_file_type: null, proposal_file_size: null, proposal_uploaded_at: null };
  const { error: updateError } = await admin.from(table).update(clearMeta).eq("id", entityId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
  if (path) await admin.storage.from(PROPOSALS_BUCKET).remove([path]).catch(() => undefined);
  const { error: cleanupError } = await admin
    .from("proposal_files")
    .delete()
    .eq("entity_type", kind)
    .eq("entity_id", entityId);
  void cleanupError;
  if (kind === "college") {
    await admin.from("college_visit_activities").insert({
      college_visit_id: entityId,
      activity_type: "File Removed",
      notes: "All proposal files removed",
      created_by: user.id,
      visibility_scope: "admin_only",
    });
  }
  return NextResponse.json({ ok: true });
}
