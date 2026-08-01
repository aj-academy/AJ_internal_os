import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/security/auth/requireAdminApi";
import {
  MENTOR_ALLOC_TEMPLATE_VERSION,
  buildMentorAllocCsv,
  buildMentorAllocTemplateBuffer,
} from "@/lib/students/mentorAllocImport";

export const runtime = "nodejs";

/** GET mentor-allocation template */
export async function GET(request: Request) {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;

  const format = (new URL(request.url).searchParams.get("format") || "xlsx").toLowerCase();
  const day = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const body = buildMentorAllocCsv();
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="AJ_Mentor_Allocation_Template_v${MENTOR_ALLOC_TEMPLATE_VERSION}_${day}.csv"`,
        "X-Template-Version": MENTOR_ALLOC_TEMPLATE_VERSION,
      },
    });
  }

  const buf = buildMentorAllocTemplateBuffer();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="AJ_Mentor_Allocation_Template_v${MENTOR_ALLOC_TEMPLATE_VERSION}_${day}.xlsx"`,
      "X-Template-Version": MENTOR_ALLOC_TEMPLATE_VERSION,
    },
  });
}
