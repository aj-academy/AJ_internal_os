import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/security";
import { parsePlaceholderFieldsJson } from "@/lib/portfolio";
import type { PortfolioTemplate } from "@/types/portfolio";

function mapRow(row: Record<string, unknown>): PortfolioTemplate {
  return {
    id: String(row.id),
    title: String(row.title ?? "Portfolio Template"),
    template_format: row.template_format === "pdf" ? "pdf" : "html",
    html_content: typeof row.html_content === "string" ? row.html_content : null,
    file_url: typeof row.file_url === "string" ? row.file_url : null,
    placeholder_fields: parsePlaceholderFieldsJson(row.placeholder_fields),
    is_active: Boolean(row.is_active),
    created_by: typeof row.created_by === "string" ? row.created_by : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function GET() {
  const { response, user } = await requireAdminApiSession();
  if (response || !user) return response!;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("portfolio_templates")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ templates: (data ?? []).map((r) => mapRow(r as Record<string, unknown>)) });
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
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const template_format = record.template_format === "pdf" ? "pdf" : "html";
  const html_content = typeof record.html_content === "string" ? record.html_content : null;
  const file_url = typeof record.file_url === "string" ? record.file_url : null;
  const placeholder_fields = parsePlaceholderFieldsJson(record.placeholder_fields);
  const is_active = Boolean(record.is_active);

  if (!title) {
    return NextResponse.json({ error: "title is required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("portfolio_templates")
    .insert({
      title,
      template_format,
      html_content,
      file_url,
      placeholder_fields,
      is_active,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not save template. Run portfolio_schema.sql in Supabase." },
      { status: 400 },
    );
  }

  return NextResponse.json({ template: mapRow(data as Record<string, unknown>) });
}
