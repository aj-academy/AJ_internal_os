import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/security/auth/requireAdminApi";
import {
  COLLEGE_VISIT_SELECT,
  nextCollegeVisitSelect,
} from "@/components/college-visits/collegeVisitsHelpers";
import { mapCollegeVisitRow } from "@/lib/collegeVisitsApi";
import {
  analyzeCollegeImportRows,
  hashCollegeImportBuffer,
  parseCollegeVisitImportFile,
} from "@/lib/collegeVisitsImport";
import { buildCollegeVisitPayload } from "@/components/college-visits/collegeVisitsHelpers";
import { insertCollegeVisitsBulk } from "@/lib/collegeVisitInsert";

export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024;

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
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is too large (max 12 MB)." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = hashCollegeImportBuffer(buffer);
  const admin = createAdminClient();

  let existingVisits: ReturnType<typeof mapCollegeVisitRow>[] = [];
  let select = COLLEGE_VISIT_SELECT;
  let { data: existingData, error: existingErr } = await admin
    .from("college_visits")
    .select(select)
    .order("updated_at", { ascending: false })
    .limit(5000);
  while (existingErr) {
    const fallback = nextCollegeVisitSelect(select, existingErr.message);
    if (!fallback) break;
    select = fallback;
    ({ data: existingData, error: existingErr } = await admin
      .from("college_visits")
      .select(select)
      .order("updated_at", { ascending: false })
      .limit(5000));
  }
  if (!existingErr) {
    existingVisits = (existingData ?? []).map((r) => mapCollegeVisitRow(r));
  }

  let parsed: ReturnType<typeof parseCollegeVisitImportFile>;
  try {
    parsed = parseCollegeVisitImportFile(buffer, file.name, {
      owners: [],
      defaultOwnerId: auth.user.id,
      isDbAdmin: true,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not parse file." },
      { status: 400 },
    );
  }

  if (!parsed.forms.length && parsed.errors.length) {
    return NextResponse.json(
      { error: parsed.errors.slice(0, 5).join(" ") || "No valid rows found." },
      { status: 400 },
    );
  }

  const analysis = analyzeCollegeImportRows(parsed.forms, parsed.errors, existingVisits);

  const appendToBatchId = form.get("appendToBatchId");
  if (typeof appendToBatchId === "string" && appendToBatchId.trim()) {
    const target = appendToBatchId.trim();
    let created = 0;
    let skipped = 0;
    let failed = 0;
    const activityRows: {
      college_visit_id: string;
      activity_type: string;
      notes: string;
      created_by: string;
    }[] = [];

    const pendingRows = analysis.rows.filter((row) => row.status === "pending");
    skipped += analysis.rows.length - pendingRows.length;

    if (target === "legacy") {
      for (let i = 0; i < pendingRows.length; i += 75) {
        const slice = pendingRows.slice(i, i + 75);
        const inserts = slice.map((row) => {
          const formValue = row.form;
          const payload = buildCollegeVisitPayload(formValue, { userId: auth.user!.id, isDbAdmin: true });
          return {
            ...payload,
            assigned_to: auth.user!.id,
            assigned_by: auth.user!.id,
            created_by: auth.user!.id,
            import_batch_id: null,
            source_reference: formValue.source_reference?.trim() || file.name,
          };
        });
        const { results, lastError } = await insertCollegeVisitsBulk(admin, inserts);
        if (lastError && !results.some(Boolean)) failed += slice.length;
        for (const row of results) {
          if (row?.id) {
            created += 1;
            activityRows.push({
              college_visit_id: row.id,
              activity_type: "College Created",
              notes: `Bulk upload to All Colleges (${file.name})`,
              created_by: auth.user!.id,
            });
          } else {
            failed += 1;
          }
        }
      }
    } else {
      const { data: targetBatch, error: targetError } = await admin
        .from("college_visit_import_batches")
        .select("id,status,file_name,row_count,created_count,skipped_count,failed_count")
        .eq("id", target)
        .maybeSingle();

      if (targetError) {
        return NextResponse.json({ error: targetError.message }, { status: 400 });
      }
      if (!targetBatch) {
        return NextResponse.json({ error: "Target upload folder not found." }, { status: 404 });
      }
      if (targetBatch.status === "ready_for_review" || targetBatch.status === "importing") {
        return NextResponse.json(
          { error: "Complete the pending import first, or use Back to uploads for a new file." },
          { status: 400 },
        );
      }

      for (let i = 0; i < pendingRows.length; i += 75) {
        const slice = pendingRows.slice(i, i + 75);
        const inserts = slice.map((row) => {
          const formValue = row.form;
          const payload = buildCollegeVisitPayload(formValue, { userId: auth.user!.id, isDbAdmin: true });
          return {
            ...payload,
            assigned_to: auth.user!.id,
            assigned_by: auth.user!.id,
            created_by: auth.user!.id,
            import_batch_id: target,
            source_reference: formValue.source_reference?.trim() || targetBatch.file_name,
          };
        });
        const { results, lastError } = await insertCollegeVisitsBulk(admin, inserts);
        if (lastError && !results.some(Boolean)) failed += slice.length;
        for (const row of results) {
          if (row?.id) {
            created += 1;
            activityRows.push({
              college_visit_id: row.id,
              activity_type: "College Created",
              notes: `Added to upload folder ${targetBatch.file_name}`,
              created_by: auth.user!.id,
            });
          } else {
            failed += 1;
          }
        }
      }

      await admin
        .from("college_visit_import_batches")
        .update({
          row_count: (targetBatch.row_count ?? 0) + analysis.rowCount,
          created_count: (targetBatch.created_count ?? 0) + created,
          skipped_count: (targetBatch.skipped_count ?? 0) + skipped,
          failed_count: (targetBatch.failed_count ?? 0) + failed,
        })
        .eq("id", target);
    }

    if (activityRows.length) {
      for (let i = 0; i < activityRows.length; i += 100) {
        await admin.from("college_visit_activities").insert(activityRows.slice(i, i + 100));
      }
    }

    return NextResponse.json({
      append: true,
      created,
      skipped,
      failed,
      duplicateCount: analysis.duplicateCount,
    });
  }

  const { data: batchNumber, error: numError } = await admin.rpc("college_visit_import_next_batch_number");
  if (numError || !batchNumber) {
    return NextResponse.json(
      {
        error: numError?.message || "Could not allocate batch number.",
        hint: "Run AJ_Academy_SB/college_visit_import_batches.sql in Supabase.",
      },
      { status: 500 },
    );
  }

  const { data: batch, error: batchError } = await admin
    .from("college_visit_import_batches")
    .insert({
      batch_number: batchNumber,
      file_name: file.name,
      file_hash: fileHash,
      row_count: analysis.rowCount,
      new_count: analysis.newCount,
      duplicate_count: analysis.duplicateCount,
      invalid_count: analysis.invalidCount,
      status: "ready_for_review",
      uploaded_by: auth.user.id,
      meta: {
        parse_errors: parsed.errors.slice(0, 50),
      },
    })
    .select(
      "id,batch_number,file_name,file_hash,row_count,new_count,duplicate_count,invalid_count,created_count,skipped_count,failed_count,status,uploaded_at,error_message",
    )
    .single();

  if (batchError || !batch) {
    return NextResponse.json(
      {
        error: batchError?.message || "Could not create import batch.",
        hint: "Run AJ_Academy_SB/college_visit_import_batches.sql in Supabase.",
      },
      { status: 500 },
    );
  }

  const rowInserts = analysis.rows.map((row) => ({
    batch_id: batch.id,
    row_number: row.rowNumber,
    payload: row.form,
    status: row.status,
    duplicate_of:
      row.duplicateOf && /^[0-9a-f-]{36}$/i.test(row.duplicateOf) ? row.duplicateOf : null,
    error_message: row.errorMessage,
  }));

  for (let i = 0; i < rowInserts.length; i += 100) {
    const slice = rowInserts.slice(i, i + 100);
    const { error: rowsError } = await admin.from("college_visit_import_rows").insert(slice);
    if (rowsError) {
      await admin.from("college_visit_import_batches").delete().eq("id", batch.id);
      return NextResponse.json({ error: rowsError.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    batch,
    summary: {
      newCount: analysis.newCount,
      duplicateCount: analysis.duplicateCount,
      invalidCount: analysis.invalidCount,
      parseErrors: parsed.errors,
    },
  });
}
