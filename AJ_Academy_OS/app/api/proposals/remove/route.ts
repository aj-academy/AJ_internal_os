import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffApiSession } from "@/lib/security";
import { PROPOSALS_BUCKET, type ProposalEntityKind } from "@/lib/proposalFiles";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;
  void user;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const kind = record.entityType === "student" || record.entityType === "college" ? (record.entityType as ProposalEntityKind) : null;
  const entityId = typeof record.entityId === "string" ? record.entityId.trim() : "";

  if (!kind || !entityId) {
    return NextResponse.json({ error: "entityType and entityId are required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const table = kind === "student" ? "clients" : "college_visits";
  const { data, error } = await admin
    .from(table)
    .select("proposal_file_path")
    .eq("id", entityId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const path = typeof data?.proposal_file_path === "string" ? data.proposal_file_path : null;

  const clearMeta = {
    proposal_file_name: null,
    proposal_file_path: null,
    proposal_file_type: null,
    proposal_file_size: null,
    proposal_uploaded_at: null,
  };

  const { error: updateError } = await admin.from(table).update(clearMeta).eq("id", entityId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  if (path) {
    await admin.storage.from(PROPOSALS_BUCKET).remove([path]).catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}
