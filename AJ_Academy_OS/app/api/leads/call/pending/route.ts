import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffApiSession, enforceRateLimit } from "@/lib/security";
import { isMissingCallWorkflowSchema } from "@/lib/leadCallWorkflow";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "leads:call:pending", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;

  const { response, user, profile } = await requireStaffApiSession();
  if (response || !user) return response!;

  const supabase = await createClient();
  await supabase.rpc("mark_stale_lead_call_sessions");

  const role = String(profile?.role || "").toLowerCase();
  const isAdmin = role === "admin" || role === "super_admin";
  const url = new URL(request.url);
  const mineOnly = url.searchParams.get("scope") !== "all" || !isAdmin;

  let query = supabase
    .from("lead_call_sessions")
    .select(
      "id, lead_id, employee_id, employee_name, phone_number, started_at, ended_at, session_status, call_outcome, notes, next_action, source_page, created_at",
    )
    .in("session_status", ["initiated", "outcome_pending", "stale"])
    .order("started_at", { ascending: false })
    .limit(50);

  if (mineOnly) {
    query = query.eq("employee_id", user.id);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingCallWorkflowSchema(error.message)) {
      return NextResponse.json({ sessions: [], schemaMissing: true });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const sessions = data || [];
  const leadIds = [...new Set(sessions.map((s) => s.lead_id).filter(Boolean))];
  let nameMap: Record<string, string> = {};
  if (leadIds.length) {
    const { data: leads } = await supabase
      .from("clients")
      .select("id, name, lead_name")
      .in("id", leadIds);
    nameMap = Object.fromEntries(
      (leads || []).map((l) => [
        l.id,
        (typeof l.lead_name === "string" && l.lead_name.trim()) ||
          (typeof l.name === "string" && l.name.trim()) ||
          "Lead",
      ]),
    );
  }

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      ...s,
      lead_name: nameMap[s.lead_id] || "Lead",
    })),
    schemaMissing: false,
  });
}
