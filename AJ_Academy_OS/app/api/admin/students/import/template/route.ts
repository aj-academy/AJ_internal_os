import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApiSession } from "@/lib/security/auth/requireAdminApi";
import {
  STUDENT_IMPORT_TEMPLATE_VERSION,
  buildStudentImportCsv,
  buildStudentImportXlsxBuffer,
  studentImportCsvFilename,
  studentImportXlsxFilename,
  type StudentImportCatalog,
} from "@/lib/students/importTemplate";

export const runtime = "nodejs";

/**
 * GET /api/admin/students/import/template?format=xlsx|csv
 * Downloads a portal-student import template filled with live academic catalog values.
 */
export async function GET(request: Request) {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;

  const url = new URL(request.url);
  const format = (url.searchParams.get("format") || "xlsx").toLowerCase();
  if (format !== "xlsx" && format !== "csv") {
    return NextResponse.json({ error: "format must be xlsx or csv" }, { status: 400 });
  }

  const supabase = await createClient();
  const [departments, courses, batches] = await Promise.all([
    supabase.from("academic_departments").select("id,name,status").order("name").limit(500),
    supabase.from("academic_courses").select("id,name,department_id,status").order("name").limit(1000),
    supabase
      .from("academic_batches")
      .select("id,name,course_id,academic_year,status")
      .order("name")
      .limit(1000),
  ]);

  if (departments.error || courses.error || batches.error) {
    const msg =
      departments.error?.message ||
      courses.error?.message ||
      batches.error?.message ||
      "Could not load academic catalog.";
    return NextResponse.json(
      {
        error: msg,
        hint: "Run AJ_Academy_SB/lms_academic_foundation.sql, then seed/catalog departments, courses, and batches.",
      },
      { status: 500 },
    );
  }

  const generatedAt = new Date().toISOString();
  const catalog: StudentImportCatalog = {
    departments: departments.data ?? [],
    courses: courses.data ?? [],
    batches: batches.data ?? [],
    generatedAt,
  };

  if (format === "csv") {
    const body = buildStudentImportCsv(catalog);
    const filename = studentImportCsvFilename(generatedAt);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Template-Version": STUDENT_IMPORT_TEMPLATE_VERSION,
      },
    });
  }

  const buffer = buildStudentImportXlsxBuffer(catalog);
  const filename = studentImportXlsxFilename(generatedAt);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Template-Version": STUDENT_IMPORT_TEMPLATE_VERSION,
    },
  });
}
