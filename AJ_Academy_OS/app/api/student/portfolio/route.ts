import { NextResponse } from "next/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePlaceholderFieldsJson } from "@/lib/portfolio";
import type { PortfolioTemplate, StudentPortfolioEntry } from "@/types/portfolio";

function mapTemplate(row: Record<string, unknown>): PortfolioTemplate {
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
  const { user, profile } = await getUserProfile();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (profile?.role?.toLowerCase() !== "student") {
    return NextResponse.json({ error: "Forbidden — student access only." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: templateRow, error: templateError } = await admin
    .from("portfolio_templates")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();

  if (templateError) {
    return NextResponse.json({ error: templateError.message }, { status: 400 });
  }

  if (!templateRow) {
    return NextResponse.json({ template: null, entry: null });
  }

  const template = mapTemplate(templateRow as Record<string, unknown>);

  const { data: entryRow } = await admin
    .from("student_portfolio_entries")
    .select("*")
    .eq("student_id", user.id)
    .eq("template_id", template.id)
    .maybeSingle();

  const entry: StudentPortfolioEntry | null = entryRow
    ? {
        id: String(entryRow.id),
        student_id: String(entryRow.student_id),
        template_id: String(entryRow.template_id),
        field_values: (entryRow.field_values as Record<string, string>) ?? {},
        updated_at: String(entryRow.updated_at),
      }
    : null;

  return NextResponse.json({
    template,
    entry,
    profile: {
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? user.email ?? null,
    },
  });
}

export async function PUT(request: Request) {
  const { user, profile } = await getUserProfile();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (profile?.role?.toLowerCase() !== "student") {
    return NextResponse.json({ error: "Forbidden — student access only." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const template_id = typeof record.template_id === "string" ? record.template_id : "";
  const field_values =
    record.field_values && typeof record.field_values === "object" && !Array.isArray(record.field_values)
      ? (record.field_values as Record<string, string>)
      : {};

  if (!template_id) {
    return NextResponse.json({ error: "template_id is required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: templateRow, error: templateError } = await admin
    .from("portfolio_templates")
    .select("id")
    .eq("id", template_id)
    .eq("is_active", true)
    .maybeSingle();

  if (templateError || !templateRow) {
    return NextResponse.json({ error: "Active portfolio template not found." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("student_portfolio_entries")
    .upsert(
      {
        student_id: user.id,
        template_id,
        field_values,
      },
      { onConflict: "student_id,template_id" },
    )
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not save portfolio." }, { status: 400 });
  }

  return NextResponse.json({
    entry: {
      id: String(data.id),
      student_id: String(data.student_id),
      template_id: String(data.template_id),
      field_values: (data.field_values as Record<string, string>) ?? {},
      updated_at: String(data.updated_at),
    } satisfies StudentPortfolioEntry,
  });
}
