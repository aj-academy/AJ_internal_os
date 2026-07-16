import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffApiSession } from "@/lib/security";
import type { ProposalEntityKind, ProposalStoredFile } from "@/lib/proposalFiles";

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
  const kind =
    record.entityType === "student" || record.entityType === "college"
      ? (record.entityType as ProposalEntityKind)
      : null;
  const entityId = typeof record.entityId === "string" ? record.entityId.trim() : "";
  if (!kind || !entityId) {
    return NextResponse.json({ error: "entityType and entityId are required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("proposal_files")
    .select("id,entity_type,entity_id,file_name,file_path,file_type,file_size,uploaded_at,uploaded_by")
    .eq("entity_type", kind)
    .eq("entity_id", entityId)
    .order("uploaded_at", { ascending: false });

  if (error) {
    // Patch not applied yet -> behave gracefully.
    return NextResponse.json({ files: [], schemaMissing: true });
  }
  return NextResponse.json({ files: (data ?? []) as ProposalStoredFile[], schemaMissing: false });
}
