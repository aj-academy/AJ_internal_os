import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffApiSession, enforceRateLimit, isValidUuid } from "@/lib/security";
import { isMissingCallWorkflowSchema } from "@/lib/leadCallWorkflow";

export const runtime = "nodejs";

type Body = {
  leadId?: string;
  sourcePage?: string;
  adminOverride?: boolean;
};

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "leads:call:start", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const { response, user, profile } = await requireStaffApiSession();
  if (response || !user) return response!;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
  if (!isValidUuid(leadId)) {
    return NextResponse.json({ error: "Valid leadId is required." }, { status: 400 });
  }

  const sourcePage =
    typeof body.sourcePage === "string" && body.sourcePage.trim()
      ? body.sourcePage.trim().slice(0, 80)
      : "student_master";
  const adminOverride = Boolean(body.adminOverride);
  const role = String(profile?.role || "").toLowerCase();
  const isAdmin = role === "admin" || role === "super_admin";
  if (adminOverride && !isAdmin) {
    return NextResponse.json({ error: "Only admin can override an active call." }, { status: 403 });
  }

  const supabase = await createClient();
  await supabase.rpc("mark_stale_lead_call_sessions");

  const { data, error } = await supabase.rpc("start_lead_call_session", {
    p_lead_id: leadId,
    p_source_page: sourcePage,
    p_admin_override: adminOverride,
  });

  if (error) {
    const msg = error.message || "Could not start call session.";
    if (isMissingCallWorkflowSchema(msg)) {
      return NextResponse.json(
        {
          error:
            "Call workflow SQL is not applied yet. Run AJ_Academy_SB/lead_call_workflow_schema.sql in Supabase.",
          code: "schema_missing",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const result = (data || {}) as Record<string, unknown>;
  if (result.ok !== true) {
    const code = typeof result.code === "string" ? result.code : "rejected";
    const status = code === "active_call" ? 409 : code === "not_assigned" ? 403 : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}
