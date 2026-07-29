import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffApiSession, enforceRateLimit, isValidUuid } from "@/lib/security";
import { isMissingCallWorkflowSchema } from "@/lib/leadCallWorkflow";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "leads:call:history", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;

  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;

  const url = new URL(request.url);
  const leadId = (url.searchParams.get("leadId") || "").trim();
  if (!isValidUuid(leadId)) {
    return NextResponse.json({ error: "Valid leadId is required." }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: lead, error: leadError } = await supabase
    .from("clients")
    .select("id, assigned_to")
    .eq("id", leadId)
    .maybeSingle();

  if (leadError) {
    if (isMissingCallWorkflowSchema(leadError.message)) {
      return NextResponse.json({ history: [], schemaMissing: true });
    }
    return NextResponse.json({ error: leadError.message }, { status: 400 });
  }
  if (!lead) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  const { data: sessions, error: sessionError } = await supabase
    .from("lead_call_sessions")
    .select(
      "id, lead_id, employee_id, employee_name, phone_number, started_at, ended_at, approximate_duration_seconds, session_status, call_outcome, notes, next_action, lead_stage_at_start, lead_stage_after, outcome_snapshot, created_at, updated_at",
    )
    .eq("lead_id", leadId)
    .in("session_status", ["completed", "stale", "cancelled"])
    .order("started_at", { ascending: false })
    .limit(30);

  if (sessionError) {
    // Older installs may lack outcome_snapshot — retry without it.
    const { data: sessionsFallback, error: fallbackError } = await supabase
      .from("lead_call_sessions")
      .select(
        "id, lead_id, employee_id, employee_name, phone_number, started_at, ended_at, approximate_duration_seconds, session_status, call_outcome, notes, next_action, lead_stage_at_start, lead_stage_after, created_at, updated_at",
      )
      .eq("lead_id", leadId)
      .in("session_status", ["completed", "stale", "cancelled"])
      .order("started_at", { ascending: false })
      .limit(30);

    if (fallbackError) {
      if (isMissingCallWorkflowSchema(fallbackError.message)) {
        return NextResponse.json({ history: [], schemaMissing: true });
      }
      return NextResponse.json({ error: fallbackError.message }, { status: 400 });
    }

    const ids = (sessionsFallback || []).map((s) => s.id);
    const followMap = await loadFollowUpsBySession(supabase, ids);
    return NextResponse.json({
      history: (sessionsFallback || []).map((s) => ({
        ...s,
        outcome_snapshot: null,
        follow_up: followMap[s.id] || null,
      })),
      schemaMissing: false,
    });
  }

  const ids = (sessions || []).map((s) => s.id);
  const followMap = await loadFollowUpsBySession(supabase, ids);

  return NextResponse.json({
    history: (sessions || []).map((s) => ({
      ...s,
      follow_up: followMap[s.id] || null,
    })),
    schemaMissing: false,
  });
}

async function loadFollowUpsBySession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionIds: string[],
) {
  const map: Record<
    string,
    {
      follow_up_date: string | null;
      follow_up_time: string | null;
      follow_up_type: string | null;
      status: string | null;
      notes: string | null;
      reason: string | null;
      priority: string | null;
      assigned_employee_id: string | null;
    }
  > = {};
  if (!sessionIds.length) return map;

  const { data } = await supabase
    .from("lead_followups")
    .select(
      "call_session_id, follow_up_date, follow_up_time, follow_up_type, status, notes, reason, priority, assigned_employee_id",
    )
    .in("call_session_id", sessionIds)
    .order("created_at", { ascending: false });

  for (const row of data || []) {
    const sid = String(row.call_session_id || "");
    if (!sid || map[sid]) continue;
    map[sid] = {
      follow_up_date: row.follow_up_date ?? null,
      follow_up_time: row.follow_up_time ?? null,
      follow_up_type: row.follow_up_type ?? null,
      status: row.status ?? null,
      notes: row.notes ?? null,
      reason: row.reason ?? null,
      priority: row.priority ?? null,
      assigned_employee_id: row.assigned_employee_id ?? null,
    };
  }
  return map;
}
