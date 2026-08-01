import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/security/auth/requireAdminApi";
import { buildCsv } from "@/lib/csv";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** GET error/failed rows report — ?format=csv|xlsx&only=failed|errors|all */
export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") || "csv").toLowerCase();
  const only = url.searchParams.get("only") || "errors";

  const admin = createAdminClient();
  const { data: batch } = await admin
    .from("student_import_batches")
    .select("batch_number,file_name")
    .eq("id", id)
    .maybeSingle();
  if (!batch) return NextResponse.json({ error: "Batch not found." }, { status: 404 });

  let query = admin.from("student_import_rows").select("*").eq("batch_id", id).order("row_number");
  if (only === "failed") query = query.in("result_status", ["failed", "blocked"]);
  else if (only === "errors") query = query.eq("severity", "error");

  const { data: rows, error } = await query.limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const headers = [
    "Row Number",
    "Severity",
    "Action",
    "Result",
    "Registration Number",
    "Email",
    "Issues",
    "Result Message",
  ];
  const aoa = (rows ?? []).map((r) => {
    const mapped = (r.mapped || {}) as Record<string, string>;
    const issues = Array.isArray(r.issues)
      ? r.issues.map((i: { column?: string; message?: string }) => `${i.column || ""}: ${i.message || ""}`).join(" | ")
      : "";
    return [
      r.row_number,
      r.severity,
      r.action,
      r.result_status,
      mapped["Registration Number"] || "",
      mapped["Email"] || "",
      issues,
      r.result_message || "",
    ];
  });

  const filename = `${batch.batch_number}_${only}_report.${format === "xlsx" ? "xlsx" : "csv"}`;
  if (format === "xlsx") {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...aoa]), "Errors");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new NextResponse(new Uint8Array(Buffer.isBuffer(buf) ? buf : Buffer.from(buf)), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const csv = buildCsv(headers, aoa);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
