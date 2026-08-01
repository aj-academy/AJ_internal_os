import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/security/auth/requireAdminApi";
import { writeAuditLog } from "@/lib/hr/auditLog";
import {
  STUDENT_IMPORTS_BUCKET,
  buildStudentImportStoragePath,
  parseStudentImportUpload,
  validateStudentImportFileMeta,
} from "@/lib/students/importUpload";

export const runtime = "nodejs";

/**
 * POST /api/admin/students/import/upload
 * multipart form field: file
 * Validates type/size/MIME/rows/template version, stores privately, creates import batch (status=uploaded|failed).
 */
export async function POST(request: Request) {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }

  const metaError = validateStudentImportFileMeta({
    name: file.name,
    size: file.size,
    type: file.type,
  });
  if (metaError) {
    return NextResponse.json({ error: metaError }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseStudentImportUpload(buffer, file.name, file.type);

  if (!parsed.ok) {
    return NextResponse.json(
      {
        error: parsed.errors[0] || "File validation failed.",
        errors: parsed.errors,
        warnings: parsed.warnings,
        templateVersion: parsed.templateVersion,
        dataRowCount: parsed.dataRowCount,
        headers: parsed.headers,
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: batchNumber, error: numError } = await admin.rpc("student_import_next_batch_number");
  if (numError || !batchNumber) {
    return NextResponse.json(
      {
        error: numError?.message || "Could not allocate import batch number.",
        hint: "Run AJ_Academy_SB/student_import_batches.sql in Supabase.",
      },
      { status: 500 },
    );
  }

  const { data: batch, error: insertError } = await admin
    .from("student_import_batches")
    .insert({
      batch_number: batchNumber,
      file_name: file.name,
      file_mime: parsed.mime,
      file_size_bytes: file.size,
      file_hash: parsed.fileHash,
      template_version: parsed.templateVersion,
      template_version_ok: parsed.templateVersionOk,
      detected_headers: parsed.headers,
      data_row_count: parsed.dataRowCount,
      status: "uploaded",
      uploaded_by: auth.user.id,
      meta: {
        warnings: parsed.warnings,
        sheetNames: parsed.sheetNames,
        extension: parsed.extension,
      },
    })
    .select(
      "id,batch_number,file_name,storage_path,file_mime,file_size_bytes,file_hash,template_version,template_version_ok,detected_headers,data_row_count,status,uploaded_by,uploaded_at,error_message,meta,created_at",
    )
    .single();

  if (insertError || !batch) {
    return NextResponse.json(
      {
        error: insertError?.message || "Could not create import batch.",
        hint: "Run AJ_Academy_SB/student_import_batches.sql in Supabase.",
      },
      { status: 500 },
    );
  }

  const storagePath = buildStudentImportStoragePath(batch.id, auth.user.id, file.name);
  const { error: uploadError } = await admin.storage.from(STUDENT_IMPORTS_BUCKET).upload(storagePath, buffer, {
    contentType: parsed.mime,
    upsert: false,
  });

  if (uploadError) {
    await admin
      .from("student_import_batches")
      .update({
        status: "failed",
        error_message: uploadError.message,
      })
      .eq("id", batch.id);

    return NextResponse.json(
      {
        error: uploadError.message,
        hint: "Ensure the student-imports storage bucket exists (student_import_batches.sql).",
        batchId: batch.id,
        batchNumber: batch.batch_number,
      },
      { status: 500 },
    );
  }

  const { data: updated, error: updateError } = await admin
    .from("student_import_batches")
    .update({ storage_path: storagePath })
    .eq("id", batch.id)
    .select(
      "id,batch_number,file_name,storage_path,file_mime,file_size_bytes,file_hash,template_version,template_version_ok,detected_headers,data_row_count,status,uploaded_by,uploaded_at,error_message,meta,created_at",
    )
    .single();

  if (updateError || !updated) {
    await admin.storage.from(STUDENT_IMPORTS_BUCKET).remove([storagePath]).catch(() => undefined);
    return NextResponse.json({ error: updateError?.message || "Failed to finalize upload." }, { status: 500 });
  }

  try {
    await writeAuditLog(admin, {
      actorId: auth.user.id,
      action: "student_import.upload",
      module: "student_import",
      targetTable: "student_import_batches",
      targetId: updated.id,
      newData: {
        batch_number: updated.batch_number,
        file_name: updated.file_name,
        data_row_count: updated.data_row_count,
        template_version: updated.template_version,
        file_hash: updated.file_hash,
      },
    });
  } catch {
    /* non-blocking */
  }

  // Idempotency hint (Phase 8 will enforce): warn if same hash already imported
  const { data: prior } = await admin
    .from("student_import_batches")
    .select("id,batch_number,status,uploaded_at")
    .eq("file_hash", parsed.fileHash)
    .neq("id", updated.id)
    .in("status", ["uploaded", "ready_for_review", "importing", "completed", "completed_with_errors"])
    .order("uploaded_at", { ascending: false })
    .limit(3);

  return NextResponse.json({
    batch: updated,
    warnings: parsed.warnings,
    priorSameFile: prior ?? [],
  });
}

/** GET recent import batches for admin workbench. */
export async function GET() {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("student_import_batches")
    .select(
      "id,batch_number,file_name,file_mime,file_size_bytes,template_version,template_version_ok,data_row_count,status,uploaded_by,uploaded_at,error_message,created_at",
    )
    .order("uploaded_at", { ascending: false })
    .limit(25);

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        hint: "Run AJ_Academy_SB/student_import_batches.sql in Supabase.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ batches: data ?? [] });
}
