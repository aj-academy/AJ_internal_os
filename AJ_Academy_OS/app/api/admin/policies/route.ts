import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/auth/requireAdminApi";
import type { PolicyCategory } from "@/types/company-policy";

function isValidUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function parseCategory(value: unknown): PolicyCategory | null {
  if (value === "employee" || value === "freelancer") return value;
  return null;
}

export async function GET(request: Request) {
  const { response, user } = await requireAdminApiSession();
  if (response || !user) return response!;

  const { searchParams } = new URL(request.url);
  const category = parseCategory(searchParams.get("category") ?? "employee") ?? "employee";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("company_policies")
    .select("id,name,policy_url,policy_category,created_at")
    .eq("policy_category", category)
    .order("created_at", { ascending: false });

  if (error) {
    if (/policy_category|column/i.test(error.message ?? "")) {
      const { data: legacy, error: legacyErr } = await admin
        .from("company_policies")
        .select("id,name,policy_url,created_at")
        .order("created_at", { ascending: false });
      if (legacyErr) {
        return NextResponse.json({ error: legacyErr.message ?? "Could not load policies." }, { status: 400 });
      }
      const policies = (legacy ?? []).map((row) => ({
        ...row,
        policy_category: "employee" as PolicyCategory,
      }));
      const filtered =
        category === "freelancer" ? [] : policies;
      return NextResponse.json({ policies: filtered });
    }
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
  const policy_category = parseCategory(record.policy_category) ?? "employee";

  if (!name || !policy_url) {
    return NextResponse.json({ error: "name and policy_url are required." }, { status: 400 });
  }

  if (!isValidUrl(policy_url)) {
    return NextResponse.json({ error: "policy_url must be a valid http(s) URL." }, { status: 400 });
  }

  const admin = createAdminClient();
  const insertPayload = { name, policy_url, policy_category };
  let { data, error } = await admin
    .from("company_policies")
    .insert(insertPayload)
    .select("id,name,policy_url,policy_category,created_at")
    .single();

  if (error && /policy_category|column/i.test(error.message ?? "")) {
    const fallback = await admin
      .from("company_policies")
      .insert({ name, policy_url })
      .select("id,name,policy_url,created_at")
      .single();
    data = fallback.data
      ? { ...fallback.data, policy_category: policy_category as PolicyCategory }
      : null;
    error = fallback.error;
  }

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not create policy. Did you run company_policies.sql in Supabase?" },
      { status: 400 },
    );
  }

  return NextResponse.json({ policy: data });
}
