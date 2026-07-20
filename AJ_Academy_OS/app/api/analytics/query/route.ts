import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/lib/security/auth/requireAdminApi";
import { requireStaffApiSession } from "@/lib/security/auth/requireStaffApi";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAnalyticsQuery, type AnalyticsQueryBody } from "@/lib/analytics/runAnalyticsQuery";
import type { AnalyticsSectionId } from "@/lib/analytics/types";
import { ANALYTICS_SECTION_ORDER } from "@/lib/analytics/types";

export const runtime = "nodejs";

const SECTIONS = new Set<string>(ANALYTICS_SECTION_ORDER);

export async function POST(req: Request) {
  let body: AnalyticsQueryBody;
  try {
    body = (await req.json()) as AnalyticsQueryBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body?.section || !SECTIONS.has(body.section)) {
    return NextResponse.json({ error: "Valid section is required." }, { status: 400 });
  }

  const adminGate = await requireAdminApiSession();
  if (!adminGate.response && adminGate.profile) {
    try {
      const supabase = createAdminClient();
      const data = await runAnalyticsQuery(supabase, {
        ...body,
        section: body.section as AnalyticsSectionId,
        forceEmployeeId: null,
      });
      return NextResponse.json({
        ...data,
        viewer: { role: adminGate.profile.role, id: adminGate.profile.id, scope: "company" },
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Analytics query failed." },
        { status: 500 },
      );
    }
  }

  const staffGate = await requireStaffApiSession();
  if (staffGate.response || !staffGate.profile) {
    return adminGate.response ?? staffGate.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (staffGate.profile.role !== "employee") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const supabase = createAdminClient();
    const data = await runAnalyticsQuery(supabase, {
      ...body,
      section: body.section as AnalyticsSectionId,
      forceEmployeeId: staffGate.profile.id,
      employeeId: staffGate.profile.id,
    });
    return NextResponse.json({
      ...data,
      viewer: { role: "employee", id: staffGate.profile.id, scope: "self" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Analytics query failed." },
      { status: 500 },
    );
  }
}
