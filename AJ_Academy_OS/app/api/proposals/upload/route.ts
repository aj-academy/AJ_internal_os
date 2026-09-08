import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireStaffApiSession } from "@/lib/security";
import { assertCanAccessProposalEntity, EntityAccessError } from "@/lib/college-visits/access";
import { proposalVisibilityForUpload } from "@/lib/college-visits/fileVisibility";
import {
  PROPOSALS_BUCKET,
  buildProposalObjectPath,
  guessProposalMime,
  validateProposalFile,
  type ProposalEntityKind,
} from "@/lib/proposalFiles";

export const runtime = "nodejs";

function parseKind(raw: FormDataEntryValue | null): ProposalEntityKind | null {
  if (raw === "student" || raw === "college") return raw;
  return null;
}

export async function POST(request: Request) {
  const { response, user, profile } = await requireStaffApiSession();
  if (response || !user) return response!;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const kind = parseKind(form.get("entityType"));
  const entityId = String(form.get("entityId") ?? "").trim();
  const file = form.get("file");

  if (!kind || !entityId) {
    return NextResponse.json({ error: "entityType and entityId are required." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }

  const validationError = validateProposalFile(file);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const callerClient = await createClient();
    await assertCanAccessProposalEntity(callerClient, kind, entityId);
  } catch (e) {
    const status = e instanceof EntityAccessError ? e.status : 404;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Not found." }, { status });
  }

  const mime = guessProposalMime(file.name, file.type);
  const path = buildProposalObjectPath(kind, entityId, file.name);
  const admin = createAdminClient();
  const visibilityScope = proposalVisibilityForUpload(kind, profile?.role);

  // Keep latest file in legacy single-file columns for backward compatibility.
  const table = kind === "student" ? "clients" : "college_visits";

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage.from(PROPOSALS_BUCKET).upload(path, buffer, {
    contentType: mime || "application/octet-stream",
    upsert: false,
  });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const meta = {
    proposal_file_name: file.name,
    proposal_file_path: path,
    proposal_file_type: mime || null,
    proposal_file_size: file.size,
    proposal_uploaded_at: new Date().toISOString(),
  };

  const { data: inserted, error: insertError } = await admin
    .from("proposal_files")
    .insert({
      entity_type: kind,
      entity_id: entityId,
      file_name: file.name,
      file_path: path,
      file_type: mime || null,
      file_size: file.size,
      uploaded_by: user.id,
      visibility_scope: visibilityScope,
    })
    .select(
      "id,entity_type,entity_id,file_name,file_path,file_type,file_size,uploaded_at,uploaded_by,visibility_scope",
    )
    .single();
  if (insertError || !inserted) {
    await admin.storage.from(PROPOSALS_BUCKET).remove([path]);
    return NextResponse.json(
      {
        error:
          insertError?.message ||
          "Could not store secure file metadata. Run college_visit_file_visibility_patch.sql.",
      },
      { status: 400 },
    );
  }

  if (kind === "student") {
    const { error: updateError } = await admin.from(table).update(meta).eq("id", entityId);
    if (updateError) {
      await admin.from("proposal_files").delete().eq("id", inserted.id);
      await admin.storage.from(PROPOSALS_BUCKET).remove([path]);
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
  }

  if (kind === "college") {
    await admin.from("college_visit_activities").insert({
      college_visit_id: entityId,
      activity_type: "File Uploaded",
      notes: file.name,
      created_by: user.id,
      visibility_scope: visibilityScope,
    });
  }

  return NextResponse.json({
    ok: true,
    ...meta,
    file: {
      ...inserted,
      uploader_name: profile?.full_name || profile?.email || null,
      uploader_role: profile?.role || null,
      can_remove: true,
    },
  });
}
