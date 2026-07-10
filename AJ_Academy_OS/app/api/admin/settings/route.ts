import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/security";

const ALLOWED_KEYS = new Set([
  "company",
  "attendance",
  "crm",
  "project",
  "finance",
  "notifications",
  "security",
  "preferences",
  "hr_org",
]);

export async function GET(request: Request) {
  const { response, user } = await requireAdminApiSession();
  if (response || !user) return response!;

  const key = new URL(request.url).searchParams.get("key")?.trim() ?? "";
  const admin = createAdminClient();

  if (key) {
    if (!ALLOWED_KEYS.has(key)) {
      return NextResponse.json({ error: "Invalid setting_key." }, { status: 400 });
    }
    const { data, error } = await admin
      .from("system_settings")
      .select("setting_key,setting_value,updated_at")
      .eq("setting_key", key)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message ?? "Could not load setting." }, { status: 400 });
    }

    return NextResponse.json({ setting: data ?? null });
  }

  const { data, error } = await admin
    .from("system_settings")
    .select("setting_key,setting_value,updated_at")
    .in("setting_key", [...ALLOWED_KEYS])
    .order("setting_key", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message ?? "Could not load settings." }, { status: 400 });
  }

  return NextResponse.json({ settings: data ?? [] });
}

export async function PUT(request: Request) {
  const { response, user } = await requireAdminApiSession();
  if (response || !user) return response!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const setting_key = typeof record.setting_key === "string" ? record.setting_key.trim() : "";
  const setting_value = record.setting_value;

  if (!setting_key || !ALLOWED_KEYS.has(setting_key)) {
    return NextResponse.json({ error: "Invalid or missing setting_key." }, { status: 400 });
  }

  if (!setting_value || typeof setting_value !== "object" || Array.isArray(setting_value)) {
    return NextResponse.json({ error: "setting_value must be a JSON object." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("system_settings")
    .upsert(
      {
        setting_key,
        setting_value,
        updated_by: user.id,
      },
      { onConflict: "setting_key" },
    )
    .select("setting_key,setting_value,updated_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Could not save settings." },
      { status: 400 },
    );
  }

  return NextResponse.json({ setting: data });
}
