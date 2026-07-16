import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffApiSession, enforceRateLimit } from "@/lib/security";
import { isMissingCallWorkflowSchema } from "@/lib/leadCallWorkflow";

export const runtime = "nodejs";

/** Admin live calling board + employee self stats. */
export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "leads:call:live", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;

  const { response, user, profile } = await requireStaffApiSession();
  if (response || !user) return response!;

  const supabase = await createClient();
  await supabase.rpc("mark_stale_lead_call_sessions");

  const role = String(profile?.role || "").toLowerCase();
  const isAdmin = role === "admin" || role === "super_admin";
  const url = new URL(request.url);
  const employeeFilter = url.searchParams.get("employeeId");

  let liveQuery = supabase
    .from("lead_call_sessions")
    .select(
      "id, lead_id, employee_id, employee_name, phone_number, started_at, session_status, source_page",
    )
    .in("session_status", ["initiated", "outcome_pending"])
    .order("started_at", { ascending: false })
    .limit(100);

  if (!isAdmin) {
    liveQuery = liveQuery.eq("employee_id", user.id);
  } else if (employeeFilter) {
    liveQuery = liveQuery.eq("employee_id", employeeFilter);
  }

  const { data: live, error: liveError } = await liveQuery;
  if (liveError) {
    if (isMissingCallWorkflowSchema(liveError.message)) {
      return NextResponse.json({
        live: [],
        stats: null,
        schemaMissing: true,
      });
    }
    return NextResponse.json({ error: liveError.message }, { status: 400 });
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const isoDay = startOfDay.toISOString();

  let todayQuery = supabase
    .from("lead_call_sessions")
    .select("id, session_status, call_outcome, employee_id, started_at")
    .gte("started_at", isoDay)
    .limit(500);
  if (!isAdmin) todayQuery = todayQuery.eq("employee_id", user.id);
  else if (employeeFilter) todayQuery = todayQuery.eq("employee_id", employeeFilter);

  const { data: todayRows } = await todayQuery;
  const today = todayRows || [];

  const connected = today.filter((r) => String(r.call_outcome || "").startsWith("Connected")).length;
  const unanswered = today.filter((r) =>
    ["No Answer", "Busy", "Switched Off", "Call Back Later"].includes(String(r.call_outcome || "")),
  ).length;
  const pendingOutcomes = (live || []).filter((r) =>
    ["initiated", "outcome_pending", "stale"].includes(String(r.session_status)),
  ).length;

  const leadIds = [...new Set((live || []).map((s) => s.lead_id))];
  let nameMap: Record<string, string> = {};
  if (leadIds.length) {
    const { data: leads } = await supabase.from("clients").select("id, name, lead_name").in("id", leadIds);
    nameMap = Object.fromEntries(
      (leads || []).map((l) => [
        l.id,
        (typeof l.lead_name === "string" && l.lead_name.trim()) ||
          (typeof l.name === "string" && l.name.trim()) ||
          "Lead",
      ]),
    );
  }

  const now = Date.now();
  return NextResponse.json({
    schemaMissing: false,
    live: (live || []).map((s) => {
      const started = new Date(String(s.started_at)).getTime();
      return {
        ...s,
        lead_name: nameMap[s.lead_id] || "Lead",
        elapsed_seconds: Number.isFinite(started) ? Math.max(0, Math.round((now - started) / 1000)) : 0,
      };
    }),
    stats: {
      callsToday: today.length,
      connectedToday: connected,
      unansweredToday: unanswered,
      pendingOutcomes,
    },
  });
}
