import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { PROPOSALS_BUCKET, type ProposalEntityKind } from "@/lib/proposalFiles";
import type { CollegeFileVisibility } from "@/lib/college-visits/fileVisibility";

export async function finalizeProposalUpload(opts: {
  admin: SupabaseClient;
  userId: string;
  uploaderName: string | null;
  uploaderRole: string | null;
  kind: ProposalEntityKind;
  entityId: string;
  path: string;
  fileName: string;
  mime: string;
  fileSize: number;
  visibilityScope: CollegeFileVisibility;
}) {
  const {
    admin,
    userId,
    uploaderName,
    uploaderRole,
    kind,
    entityId,
    path,
    fileName,
    mime,
    fileSize,
    visibilityScope,
  } = opts;

  const { data: exists, error: existsError } = await (async () => {
    let lastError: { message: string } | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const res = await admin.storage.from(PROPOSALS_BUCKET).createSignedUrl(path, 30);
      if (!res.error && res.data?.signedUrl) return res;
      lastError = res.error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
    return { data: null, error: lastError };
  })();
  if (existsError || !exists?.signedUrl) {
    throw new Error("The file did not reach storage. Please upload it again.");
  }

  const table = kind === "student" ? "clients" : "college_visits";
  const meta = {
    proposal_file_name: fileName,
    proposal_file_path: path,
    proposal_file_type: mime || null,
    proposal_file_size: fileSize,
    proposal_uploaded_at: new Date().toISOString(),
  };

  const { data: existing } = await admin
    .from("proposal_files")
    .select(
      "id,entity_type,entity_id,file_name,file_path,file_type,file_size,uploaded_at,uploaded_by,visibility_scope",
    )
    .eq("file_path", path)
    .maybeSingle();
  if (existing) {
    return {
      ok: true as const,
      ...meta,
      file: {
        ...existing,
        uploader_name: uploaderName,
        uploader_role: uploaderRole,
        can_remove: true,
      },
    };
  }

  const { data: inserted, error: insertError } = await admin
    .from("proposal_files")
    .insert({
      entity_type: kind,
      entity_id: entityId,
      file_name: fileName,
      file_path: path,
      file_type: mime || null,
      file_size: fileSize,
      uploaded_by: userId,
      visibility_scope: visibilityScope,
    })
    .select(
      "id,entity_type,entity_id,file_name,file_path,file_type,file_size,uploaded_at,uploaded_by,visibility_scope",
    )
    .single();
  if (insertError || !inserted) {
    await admin.storage.from(PROPOSALS_BUCKET).remove([path]);
    throw new Error(
      insertError?.message ||
        "Could not store secure file metadata. Run college_visit_file_visibility_patch.sql.",
    );
  }

  if (kind === "student") {
    const { error: updateError } = await admin.from(table).update(meta).eq("id", entityId);
    if (updateError) {
      await admin.from("proposal_files").delete().eq("id", inserted.id);
      await admin.storage.from(PROPOSALS_BUCKET).remove([path]);
      throw new Error(updateError.message);
    }
  }

  if (kind === "college") {
    await admin.from("college_visit_activities").insert({
      college_visit_id: entityId,
      activity_type: "File Uploaded",
      notes: fileName,
      created_by: userId,
      visibility_scope: visibilityScope,
    });
  }

  return {
    ok: true as const,
    ...meta,
    file: {
      ...inserted,
      uploader_name: uploaderName,
      uploader_role: uploaderRole,
      can_remove: true,
    },
  };
}
