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
import { COLLEGE_FILE_VISIBILITY, isAdminRole } from "@/lib/college-visits/fileVisibility";
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
  const download = Boolean(record.download);
  const fileId = typeof record.fileId === "string" ? record.fileId.trim() : "";
  const filePath = typeof record.filePath === "string" ? record.filePath.trim() : "";

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
  let fileQuery = admin
    .from("proposal_files")
    .select("id,file_name,file_path,visibility_scope")
    .eq("entity_type", kind)
    .eq("entity_id", entityId);
  if (kind === "college" && !isAdminRole(profile?.role)) {
    fileQuery = fileQuery.eq("visibility_scope", COLLEGE_FILE_VISIBILITY.ADMIN_EMPLOYEE);
  }
  if (fileId) fileQuery = fileQuery.eq("id", fileId);
  else if (filePath) fileQuery = fileQuery.eq("file_path", filePath);
  else fileQuery = fileQuery.order("uploaded_at", { ascending: false }).limit(1);

  const { data: fileRows, error: fileError } = await fileQuery;
  if (fileError) {
    return NextResponse.json({ error: fileError.message }, { status: 400 });
  }
  const stored = fileRows?.[0] ?? null;

  if (stored && !canActorReadFile(profile?.role, stored.visibility_scope)) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  let path = stored?.file_path || "";
  let name = stored?.file_name || "proposal";
  if (!stored && (kind === "college" && !canActorReadFile(profile?.role, "admin_only"))) {
    // Legacy College file rows have no durable uploader/visibility evidence.
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  if (!path) {
    const table = kind === "student" ? "clients" : "college_visits";
    const { data, error } = await admin
      .from(table)
      .select("proposal_file_path,proposal_file_name")
      .eq("id", entityId)
      .maybeSingle();
    if (error || !data?.proposal_file_path) {
      return NextResponse.json({ error: "No uploaded proposal file." }, { status: 404 });
    }
    path = String(data.proposal_file_path);
    name = String(data.proposal_file_name || "proposal");
  }

  try {
    assertProposalPathMatchesEntity(kind, entityId, path);
  } catch (e) {
    const status = e instanceof EntityAccessError ? e.status : 403;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden." }, { status });
  }

  const { data: signed, error: signError } = await admin.storage
    .from(PROPOSALS_BUCKET)
    .createSignedUrl(path, 120, download
      ? { download: name }
      : undefined);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: signError?.message || "Could not create signed URL." }, { status: 400 });
  }

  return NextResponse.json({
    url: signed.signedUrl,
    fileName: name,
  });
}
