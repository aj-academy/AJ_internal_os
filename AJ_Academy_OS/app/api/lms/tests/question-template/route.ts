import { NextResponse } from "next/server";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { UserRole } from "@/types/profile";
import { buildTestQuestionCsv, buildTestQuestionTemplateBuffer } from "@/lib/lms/testQuestionImport";

export const runtime = "nodejs";

const STAFF = new Set<UserRole>(["mentor", "admin", "super_admin"]);

export async function GET(request: Request) {
  const gate = await verifySessionRole(STAFF);
  if (gate.response) return gate.response;

  const url = new URL(request.url);
  const format = (url.searchParams.get("format") || "xlsx").toLowerCase();

  if (format === "csv") {
    const csv = buildTestQuestionCsv();
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="aj-academy-test-questions-template.csv"',
      },
    });
  }

  const buf = buildTestQuestionTemplateBuffer();
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="aj-academy-test-questions-template.xlsx"',
    },
  });
}
