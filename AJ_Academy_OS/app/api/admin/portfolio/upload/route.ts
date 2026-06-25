import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/auth/requireAdminApi";
import { DEFAULT_PORTFOLIO_PLACEHOLDERS, PORTFOLIO_MAX_FILE_BYTES } from "@/lib/portfolio";

export async function POST(request: Request) {
  const { response, user } = await requireAdminApiSession();
  if (response || !user) return response!;

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }

  if (file.size > PORTFOLIO_MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File exceeds 5 MB limit." }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  const isHtml = name.endsWith(".html") || name.endsWith(".htm");
  const isPdf = name.endsWith(".pdf");

  if (!isHtml && !isPdf) {
    return NextResponse.json({ error: "Only .html, .htm, or .pdf files are allowed." }, { status: 400 });
  }

  const admin = createAdminClient();
  const safeName = file.name.replace(/[^\w.\-()+ ]/g, "_");
  const path = `${user.id}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await admin.storage.from("portfolio-templates").upload(path, file, {
    upsert: false,
    contentType: file.type || (isPdf ? "application/pdf" : "text/html"),
  });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const { data: urlData } = admin.storage.from("portfolio-templates").getPublicUrl(path);
  let html_content: string | null = null;

  if (isHtml) {
    html_content = await file.text();
  }

  return NextResponse.json({
    file_url: urlData.publicUrl,
    template_format: isPdf ? "pdf" : "html",
    html_content,
    placeholder_fields: isHtml && html_content
      ? undefined
      : DEFAULT_PORTFOLIO_PLACEHOLDERS,
  });
}
