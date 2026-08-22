import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/security/auth/requireAdminApi";
import {
  mergeDuplicateResolutions,
  parseDuplicateResolutions,
  type CollegeDuplicateResolution,
} from "@/lib/collegeVisitsImportResolutions";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

function isResolution(value: unknown): value is CollegeDuplicateResolution {
  return value === "skip" || value === "add" || value === "update";
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const record = body as { resolutions?: unknown; bulk?: CollegeDuplicateResolution; rowIds?: string[] };
  const admin = createAdminClient();

  const { data: batch, error: batchError } = await admin
    .from("college_visit_import_batches")
    .select("id,meta,status")
    .eq("id", id)
    .maybeSingle();

  if (batchError) return NextResponse.json({ error: batchError.message }, { status: 400 });
  if (!batch) return NextResponse.json({ error: "Import batch not found." }, { status: 404 });
  if (batch.status !== "ready_for_review") {
    return NextResponse.json({ error: "Duplicate actions can only be changed before save." }, { status: 400 });
  }

  const current = parseDuplicateResolutions(batch.meta);
  const patch: Record<string, CollegeDuplicateResolution> = {};

  if (record.bulk && isResolution(record.bulk) && Array.isArray(record.rowIds)) {
    for (const rowId of record.rowIds) {
      if (typeof rowId === "string" && rowId.trim()) patch[rowId.trim()] = record.bulk;
    }
  } else if (record.resolutions && typeof record.resolutions === "object" && !Array.isArray(record.resolutions)) {
    for (const [rowId, action] of Object.entries(record.resolutions)) {
      if (isResolution(action)) patch[rowId] = action;
    }
  } else {
    return NextResponse.json({ error: "Provide resolutions map or bulk + rowIds." }, { status: 400 });
  }

  const merged = mergeDuplicateResolutions(current, patch);
  const meta =
    batch.meta && typeof batch.meta === "object" && !Array.isArray(batch.meta)
      ? { ...(batch.meta as Record<string, unknown>), duplicate_resolutions: merged }
      : { duplicate_resolutions: merged };

  const { error: updateError } = await admin
    .from("college_visit_import_batches")
    .update({ meta })
    .eq("id", id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

  return NextResponse.json({ duplicate_resolutions: merged });
}
