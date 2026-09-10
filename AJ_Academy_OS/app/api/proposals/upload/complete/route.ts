import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireStaffApiSession } from "@/lib/security";
import {
  assertProposalPathMatchesEntity,
  assertStaffCanAccessProposalEntity,
  EntityAccessError,
} from "@/lib/college-visits/access";
import { proposalVisibilityForUpload, isAdminRole } from "@/lib/college-visits/fileVisibility";
import { guessProposalMime, validateProposalUploadMeta, type ProposalEntityKind } from "@/lib/proposalFiles";
import { finalizeProposalUpload } from "@/lib/proposals/finalizeUpload";

export const runtime = "nodejs";

function parseKind(raw: unknown): ProposalEntityKind | null {
  if (raw === "student" || raw === "college") return raw;
  return null;
}

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
  const kind = parseKind(record.entityType);
  const entityId = typeof record.entityId === "string" ? record.entityId.trim() : "";
  const path = typeof record.path === "string" ? record.path.trim() : "";
  const fileName = typeof record.fileName === "string" ? record.fileName.trim() : "";
  const fileType = typeof record.fileType === "string" ? record.fileType : "";
  const fileSize = typeof record.fileSize === "number" ? record.fileSize : Number(record.fileSize);

  if (!kind || !entityId || !path || !fileName) {
    return NextResponse.json({ error: "entityType, entityId, path, and fileName are required." }, { status: 400 });
  }

  const validationError = validateProposalUploadMeta({ name: fileName, size: fileSize, type: fileType });
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
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
    assertProposalPathMatchesEntity(kind, entityId, path);
  } catch (e) {
    const status = e instanceof EntityAccessError ? e.status : 404;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Not found." }, { status });
  }

  try {
    const result = await finalizeProposalUpload({
      admin: createAdminClient(),
      userId: user.id,
      uploaderName: profile?.full_name || profile?.email || null,
      uploaderRole: profile?.role || null,
      kind,
      entityId,
      path,
      fileName,
      mime: guessProposalMime(fileName, fileType),
      fileSize,
      visibilityScope: proposalVisibilityForUpload(kind, profile?.role),
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not finish upload." },
      { status: 400 },
    );
  }
}
