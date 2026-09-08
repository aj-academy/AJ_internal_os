import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  COLLEGE_IMPORT_BATCH_SELECT,
  attachImportBatchUploaderAttribution,
  requireCollegeVisitImportActor,
} from "@/lib/college-visits/importAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireCollegeVisitImportActor();
  if (auth.response || !auth.user) return auth.response!;

  const admin = createAdminClient();
  let query = admin
    .from("college_visit_import_batches")
    .select(COLLEGE_IMPORT_BATCH_SELECT)
    .order("uploaded_at", { ascending: false })
    .limit(200);
  if (!auth.isAdmin) query = query.eq("uploaded_by", auth.user.id);
  const { data, error } = await query;

  if (error) {
    const missing = error.message.toLowerCase().includes("college_visit_import_batches");
    return NextResponse.json(
      {
        batches: [],
        error: missing ? undefined : error.message,
        hint: missing ? "Run AJ_Academy_SB/college_visit_import_batches.sql in Supabase SQL Editor." : undefined,
      },
      { status: missing ? 200 : 400 },
    );
  }

  return NextResponse.json(
    { batches: await attachImportBatchUploaderAttribution(admin, data ?? []) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Create an empty manual folder. Spreadsheet imports and manual folders share
 * the same batch table so every college has one stable folder identifier.
 */
export async function POST(request: Request) {
  const auth = await requireCollegeVisitImportActor();
  if (auth.response || !auth.user) return auth.response!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const folderName =
    typeof (body as { folderName?: unknown })?.folderName === "string"
      ? (body as { folderName: string }).folderName.trim()
      : "";
  if (!folderName) {
    return NextResponse.json({ error: "Folder name is required." }, { status: 400 });
  }
  if (folderName.length > 120) {
    return NextResponse.json({ error: "Folder name must be 120 characters or fewer." }, { status: 400 });
  }
  if (/[\u0000-\u001f<>:"/\\|?*]/.test(folderName)) {
    return NextResponse.json(
      { error: "Folder name contains unsupported characters." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("college_visit_import_batches")
    .select("id,file_name,uploaded_by")
    .order("uploaded_at", { ascending: false })
    .limit(1000);
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 400 });
  }
  const nameKey = folderName.toLocaleLowerCase();
  const duplicatePool = auth.isAdmin
    ? existing ?? []
    : (existing ?? []).filter((row) => row.uploaded_by === auth.user!.id);
  const duplicate = duplicatePool.find(
    (row) => String(row.file_name || "").trim().toLocaleLowerCase() === nameKey,
  );
  if (duplicate) {
    return NextResponse.json(
      {
        error: auth.isAdmin
          ? "A folder with this name already exists. Select it under Existing folder."
          : "You already have a folder with this name.",
        folderId: duplicate.id,
      },
      { status: 409 },
    );
  }

  const { data: batchNumber, error: numberError } = await admin.rpc(
    "college_visit_import_next_batch_number",
  );
  if (numberError || !batchNumber) {
    return NextResponse.json(
      {
        error: numberError?.message || "Could not allocate a folder number.",
        hint: "Run AJ_Academy_SB/college_visit_import_batches.sql in Supabase.",
      },
      { status: 400 },
    );
  }

  const { data: folder, error } = await admin
    .from("college_visit_import_batches")
    .insert({
      batch_number: batchNumber,
      file_name: folderName,
      row_count: 0,
      new_count: 0,
      duplicate_count: 0,
      invalid_count: 0,
      created_count: 0,
      skipped_count: 0,
      failed_count: 0,
      status: "completed",
      uploaded_by: auth.user.id,
      meta: { source: "manual_folder" },
    })
    .select(
      "id,batch_number,file_name,file_hash,row_count,new_count,duplicate_count,invalid_count,created_count,skipped_count,failed_count,status,uploaded_at,uploaded_by,error_message,meta",
    )
    .single();

  if (error || !folder) {
    return NextResponse.json(
      { error: error?.message || "Could not create folder." },
      { status: 400 },
    );
  }

  const [attributed] = await attachImportBatchUploaderAttribution(admin, [folder]);
  return NextResponse.json({ folder: attributed ?? folder }, { status: 201 });
}
