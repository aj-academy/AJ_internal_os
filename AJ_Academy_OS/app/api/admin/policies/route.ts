import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/auth/requireAdminApi";

function isValidUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export async function GET() {
  const { response, user } = await requireAdminApiSession();
  if (response || !user) return response!;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("company_policies")
    .select("id,name,policy_url,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message ?? "Could not load policies." }, { status: 400 });
  }

  return NextResponse.json({ policies: data ?? [] });
}

export async function POST(request: Request) {
  const { response, user } = await requireAdminApiSession();
  if (response || !user) return response!;

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
    .insert({
      name,
      policy_url,
    })
    .select("id,name,policy_url,created_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not create policy. Did you run company_policies.sql in Supabase?" },
      { status: 400 },
    );
  }

  return NextResponse.json({ policy: data });
}
