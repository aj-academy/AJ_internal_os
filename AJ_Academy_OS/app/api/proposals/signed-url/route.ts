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
  const download = Boolean(record.download);
  const filePath = typeof record.filePath === "string" ? record.filePath.trim() : "";
  const fileName = typeof record.fileName === "string" ? record.fileName.trim() : "";

  if (!kind || !entityId) {
    return NextResponse.json({ error: "entityType and entityId are required." }, { status: 400 });
  }

  const admin = createAdminClient();
  let path = filePath;
  let name = fileName || "proposal";
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
