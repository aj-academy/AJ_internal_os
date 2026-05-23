import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/auth/requireAdminApi";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function isValidUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { response, user } = await requireAdminApiSession();
  if (response || !user) return response!;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing policy id." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const policy_url = typeof record.policy_url === "string" ? record.policy_url.trim() : "";

  if (!name || !policy_url) {
    return NextResponse.json({ error: "name and policy_url are required." }, { status: 400 });
  }

  if (!isValidUrl(policy_url)) {
    return NextResponse.json({ error: "policy_url must be a valid http(s) URL." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("company_policies")
    .update({
      name,
      policy_url,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id,name,policy_url,created_at")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not update policy." },
      { status: 400 },
    );
  }

  return NextResponse.json({ policy: data });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { response, user } = await requireAdminApiSession();
  if (response || !user) return response!;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing policy id." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("company_policies").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message ?? "Could not delete policy." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
