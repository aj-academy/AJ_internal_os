import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffApiSession } from "@/lib/security";
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

async function assertCanAccessEntity(kind: ProposalEntityKind, entityId: string, userId: string) {
  const admin = createAdminClient();
  if (kind === "student") {
    const { data, error } = await admin
      .from("clients")
      .select("id,assigned_to")
      .eq("id", entityId)
      .maybeSingle();
    if (error || !data) throw new Error("Student lead not found.");
    // Staff API already required; ownership enforced by client RLS for direct writes.
    // Service role updates metadata after staff auth — allow assigned owner or any staff via route.
    void userId;
    void data.assigned_to;
    return;
  }
  const { data, error } = await admin
    .from("college_visits")
    .select("id,assigned_to")
    .eq("id", entityId)
    .maybeSingle();
  if (error || !data) throw new Error("College visit not found.");
  void userId;
  void data.assigned_to;
}

export async function POST(request: Request) {
  const { response, user } = await requireStaffApiSession();
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
    await assertCanAccessEntity(kind, entityId, user.id);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Not found." }, { status: 404 });
  }

  const mime = guessProposalMime(file.name, file.type);
  const path = buildProposalObjectPath(kind, entityId, file.name);
  const admin = createAdminClient();

  // Load previous path for cleanup after successful replace
  const table = kind === "student" ? "clients" : "college_visits";
  const { data: prev } = await admin
    .from(table)
    .select("proposal_file_path")
    .eq("id", entityId)
    .maybeSingle();
  const oldPath = typeof prev?.proposal_file_path === "string" ? prev.proposal_file_path : null;

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

  const { error: updateError } = await admin.from(table).update(meta).eq("id", entityId);
  if (updateError) {
    await admin.storage.from(PROPOSALS_BUCKET).remove([path]);
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  if (oldPath && oldPath !== path) {
    await admin.storage.from(PROPOSALS_BUCKET).remove([oldPath]).catch(() => undefined);
  }

  return NextResponse.json({ ok: true, ...meta });
}
