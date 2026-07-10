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

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { response, user } = await requireAdminApiSession();
  if (response || !user) return response!;

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (typeof record.title === "string") patch.title = record.title.trim();
  if (record.template_format === "pdf" || record.template_format === "html") {
    patch.template_format = record.template_format;
  }
  if (typeof record.html_content === "string" || record.html_content === null) {
    patch.html_content = record.html_content;
  }
  if (typeof record.file_url === "string" || record.file_url === null) {
    patch.file_url = record.file_url;
  }
  if (Array.isArray(record.placeholder_fields)) {
    patch.placeholder_fields = parsePlaceholderFieldsJson(record.placeholder_fields);
  }
  if (typeof record.is_active === "boolean") patch.is_active = record.is_active;

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("portfolio_templates")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Update failed." }, { status: 400 });
  }

  return NextResponse.json({ template: mapRow(data as Record<string, unknown>) });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminApiSession();
  if (response) return response;

  const { id } = await context.params;
  const admin = createAdminClient();
  const { error } = await admin.from("portfolio_templates").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
