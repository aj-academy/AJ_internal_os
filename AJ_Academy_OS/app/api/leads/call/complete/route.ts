import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffApiSession, enforceRateLimit, isValidUuid } from "@/lib/security";
import {
  CALL_OUTCOME_RULES,
  isCallOutcome,
  isMissingCallWorkflowSchema,
  type CallOutcome,
} from "@/lib/leadCallWorkflow";

export const runtime = "nodejs";

type Body = {
  sessionId?: string;
  callOutcome?: string;
  notes?: string;
  nextAction?: string;
  endedAt?: string;
  approximateDurationSeconds?: number | null;
  leadStage?: string | null;
  leadStatus?: string | null;
  priority?: string | null;
  lostReason?: string | null;
  scheduleFollowUp?: boolean;
  followUpDate?: string | null;
  followUpTime?: string | null;
  followUpType?: string | null;
  followUpReason?: string | null;
  followUpPriority?: string | null;
  followUpAssignedEmployeeId?: string | null;
  followUpNotes?: string | null;
  brochureShared?: boolean;
  paymentDetailsShared?: boolean;
  duplicateOfLeadId?: string | null;
};

function combineFollowUpAt(dateStr: string, timeStr: string | null | undefined): string {
  const d = dateStr.slice(0, 10);
  const t = (timeStr || "09:00").trim().slice(0, 5);
  return new Date(`${d}T${t}:00`).toISOString();
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "leads:call:complete", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const { response, user, profile } = await requireStaffApiSession();
  if (response || !user) return response!;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (!isValidUuid(sessionId)) {
    return NextResponse.json({ error: "Valid sessionId is required." }, { status: 400 });
  }

  const outcomeRaw = typeof body.callOutcome === "string" ? body.callOutcome.trim() : "";
  if (!outcomeRaw || !isCallOutcome(outcomeRaw)) {
    return NextResponse.json({ error: "A valid call outcome is required." }, { status: 400 });
  }
  const outcome = outcomeRaw as CallOutcome;
  const rules = CALL_OUTCOME_RULES[outcome];

  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (rules.requireNotes && !notes) {
    return NextResponse.json({ error: "Conversation notes are required for this outcome." }, { status: 400 });
  }

  const nextAction = typeof body.nextAction === "string" ? body.nextAction.trim() : "";
  if (rules.requireNextAction && !nextAction) {
    return NextResponse.json({ error: "Next action is required for this outcome." }, { status: 400 });
  }

  const lostReason = typeof body.lostReason === "string" ? body.lostReason.trim() : "";
  if (rules.requireLostReason && !lostReason) {
    return NextResponse.json({ error: "Lost reason is required for this outcome." }, { status: 400 });
  }

  const scheduleFollowUp = Boolean(body.scheduleFollowUp) || rules.requireFollowUp;
  const followUpDate =
    typeof body.followUpDate === "string" && body.followUpDate.trim()
      ? body.followUpDate.trim().slice(0, 10)
      : "";
  const followUpTime =
    typeof body.followUpTime === "string" && body.followUpTime.trim()
      ? body.followUpTime.trim().slice(0, 8)
      : null;

  if (scheduleFollowUp && !/^\d{4}-\d{2}-\d{2}$/.test(followUpDate)) {
    return NextResponse.json(
      { error: "Next follow-up date and time are required for this outcome." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const role = String(profile?.role || "").toLowerCase();
  const isAdmin = role === "admin" || role === "super_admin";

  const { data: session, error: sessionError } = await supabase
    .from("lead_call_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    if (isMissingCallWorkflowSchema(sessionError.message)) {
      return NextResponse.json(
        {
          error:
            "Call workflow SQL is not applied yet. Run AJ_Academy_SB/lead_call_workflow_schema.sql in Supabase.",
          code: "schema_missing",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: sessionError.message }, { status: 400 });
  }
  if (!session) {
    return NextResponse.json({ error: "Call session not found." }, { status: 404 });
  }

  if (session.employee_id !== user.id && !isAdmin) {
    return NextResponse.json({ error: "You can only complete your own call sessions." }, { status: 403 });
  }

  if (!["initiated", "outcome_pending", "stale"].includes(String(session.session_status))) {
    return NextResponse.json({ error: "This call session is already closed." }, { status: 400 });
  }

  const { data: lead, error: leadError } = await supabase
    .from("clients")
    .select("id, name, lead_name, status, lead_stage, priority, assigned_to, lost_reason, admission_status")
    .eq("id", session.lead_id)
    .maybeSingle();
  if (leadError || !lead) {
    return NextResponse.json({ error: leadError?.message || "Lead not found." }, { status: 400 });
  }

  const endedAt =
    typeof body.endedAt === "string" && body.endedAt.trim()
      ? body.endedAt.trim()
      : new Date().toISOString();
  const startedMs = new Date(String(session.started_at)).getTime();
  const endedMs = new Date(endedAt).getTime();
  let duration =
    typeof body.approximateDurationSeconds === "number" && Number.isFinite(body.approximateDurationSeconds)
      ? Math.max(0, Math.round(body.approximateDurationSeconds))
      : null;
  if (duration == null && Number.isFinite(startedMs) && Number.isFinite(endedMs) && endedMs >= startedMs) {
    duration = Math.round((endedMs - startedMs) / 1000);
  }

  const leadStatus =
    (typeof body.leadStatus === "string" && body.leadStatus.trim()) || rules.suggestedStatus || lead.status;
  const leadStage =
    (typeof body.leadStage === "string" && body.leadStage.trim()) || rules.suggestedStage || lead.lead_stage;
  const priority =
    (typeof body.priority === "string" && body.priority.trim()) || rules.suggestedPriority || lead.priority;

  const { error: sessionUpdateError } = await supabase
    .from("lead_call_sessions")
    .update({
      session_status: "completed",
      call_outcome: outcome,
      notes: notes || null,
      next_action: nextAction || null,
      ended_at: endedAt,
      approximate_duration_seconds: duration,
      lead_stage_after: leadStage || null,
    })
    .eq("id", sessionId);

  if (sessionUpdateError) {
    return NextResponse.json({ error: sessionUpdateError.message }, { status: 400 });
  }

  const followUpAssigned =
    typeof body.followUpAssignedEmployeeId === "string" && isValidUuid(body.followUpAssignedEmployeeId)
      ? body.followUpAssignedEmployeeId
      : lead.assigned_to || user.id;

  const clientPatch: Record<string, unknown> = {
    current_call_employee_id: null,
    current_call_started_at: null,
    current_call_session_id: null,
    last_call_outcome: outcome,
    last_contacted_at: endedAt,
    phone_called: true,
    phone_called_at: endedAt,
    status: leadStatus,
    lead_stage: leadStage,
  };
  if (priority) clientPatch.priority = priority;
  if (lostReason) clientPatch.lost_reason = lostReason;
  if (outcome === "Connected – Admission Confirmed") {
    clientPatch.admission_status = "Admitted";
    clientPatch.converted_at = endedAt;
  }
  if (scheduleFollowUp && followUpDate) {
    clientPatch.follow_up_date = followUpDate;
    clientPatch.follow_up_time = followUpTime;
    clientPatch.follow_up_type =
      (typeof body.followUpType === "string" && body.followUpType.trim()) || "Phone Call";
    clientPatch.next_follow_up_at = combineFollowUpAt(followUpDate, followUpTime);
    clientPatch.next_follow_up_employee_id = followUpAssigned;
  }

  const { error: clientUpdateError } = await supabase.from("clients").update(clientPatch).eq("id", lead.id);
  if (clientUpdateError) {
    return NextResponse.json({ error: clientUpdateError.message }, { status: 400 });
  }

  let followUpId: string | null = null;
  if (scheduleFollowUp && followUpDate) {
    const followType =
      (typeof body.followUpType === "string" && body.followUpType.trim()) ||
      (rules.markPaymentAction ? "Payment Follow-up" : rules.markBrochureAction ? "Brochure Confirmation" : "Phone Call");
    const followNotes = [
      typeof body.followUpNotes === "string" ? body.followUpNotes.trim() : "",
      typeof body.followUpReason === "string" ? `Reason: ${body.followUpReason.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const { data: fu, error: fuError } = await supabase
      .from("lead_followups")
      .insert({
        client_id: lead.id,
        follow_up_date: followUpDate,
        follow_up_time: followUpTime,
        follow_up_type: followType,
        status: "Pending",
        notes: followNotes || notes || null,
        created_by: user.id,
        assigned_employee_id: followUpAssigned,
        reason: typeof body.followUpReason === "string" ? body.followUpReason.trim() || null : null,
        priority:
          (typeof body.followUpPriority === "string" && body.followUpPriority.trim()) ||
          priority ||
          null,
        call_session_id: sessionId,
      })
      .select("id")
      .maybeSingle();

    if (fuError) {
      // Extra columns may be missing if only partial SQL applied — retry minimal insert
      const { data: fu2, error: fu2Error } = await supabase
        .from("lead_followups")
        .insert({
          client_id: lead.id,
          follow_up_date: followUpDate,
          follow_up_time: followUpTime,
          follow_up_type: followType,
          status: "Pending",
          notes: followNotes || notes || null,
          created_by: user.id,
        })
        .select("id")
        .maybeSingle();
      if (fu2Error) {
        return NextResponse.json(
          { error: `Call saved, but follow-up failed: ${fu2Error.message}` },
          { status: 400 },
        );
      }
      followUpId = fu2?.id ?? null;
    } else {
      followUpId = fu?.id ?? null;
    }
  }

  const activityRows: Array<Record<string, unknown>> = [
    {
      client_id: lead.id,
      activity_type: "Call completed",
      title: "Call completed",
      notes: notes || `Outcome: ${outcome}`,
      old_value: session.lead_stage_at_start,
      new_value: outcome,
      created_by: user.id,
      call_session_id: sessionId,
      follow_up_id: followUpId,
    },
    {
      client_id: lead.id,
      activity_type: "Call outcome updated",
      title: "Call outcome",
      notes: nextAction ? `Next action: ${nextAction}` : null,
      old_value: null,
      new_value: outcome,
      created_by: user.id,
      call_session_id: sessionId,
    },
  ];

  if (lead.status !== leadStatus || lead.lead_stage !== leadStage) {
    activityRows.push({
      client_id: lead.id,
      activity_type: "Lead stage changed",
      title: "Lead stage changed",
      notes: notes || null,
      old_value: [lead.status, lead.lead_stage].filter(Boolean).join(" / "),
      new_value: [leadStatus, leadStage].filter(Boolean).join(" / "),
      created_by: user.id,
      call_session_id: sessionId,
    });
  }

  if (followUpId) {
    activityRows.push({
      client_id: lead.id,
      activity_type: "Follow-up scheduled",
      title: "Follow-up scheduled",
      notes: `${followUpDate}${followUpTime ? ` ${followUpTime}` : ""}`,
      old_value: null,
      new_value: followUpDate,
      created_by: user.id,
      call_session_id: sessionId,
      follow_up_id: followUpId,
    });
  }

  if (body.brochureShared || rules.markBrochureAction) {
    activityRows.push({
      client_id: lead.id,
      activity_type: "Brochure shared",
      title: "Brochure shared",
      notes: notes || null,
      created_by: user.id,
      call_session_id: sessionId,
    });
  }
  if (body.paymentDetailsShared || rules.markPaymentAction) {
    activityRows.push({
      client_id: lead.id,
      activity_type: "Payment details shared",
      title: "Payment details shared",
      notes: notes || null,
      created_by: user.id,
      call_session_id: sessionId,
    });
  }
  if (outcome === "Connected – Admission Confirmed") {
    activityRows.push({
      client_id: lead.id,
      activity_type: "Admission confirmed",
      title: "Admission confirmed",
      notes: notes || null,
      created_by: user.id,
      call_session_id: sessionId,
    });
  }
  if (outcome === "Connected – Not Interested" || outcome === "Already Joined Elsewhere") {
    activityRows.push({
      client_id: lead.id,
      activity_type: "Lead marked lost",
      title: "Lead marked lost",
      notes: lostReason || notes || null,
      created_by: user.id,
      call_session_id: sessionId,
    });
  }
  if (
    outcome === "Duplicate Lead" &&
    typeof body.duplicateOfLeadId === "string" &&
    isValidUuid(body.duplicateOfLeadId)
  ) {
    activityRows.push({
      client_id: lead.id,
      activity_type: "Note added",
      title: "Linked duplicate lead",
      notes: `Duplicate of lead ${body.duplicateOfLeadId}`,
      new_value: body.duplicateOfLeadId,
      created_by: user.id,
      call_session_id: sessionId,
    });
  }

  const { error: actError } = await supabase.from("lead_activities").insert(activityRows);
  if (actError) {
    // Retry without optional columns if patch not applied
    const minimal = activityRows.map((r) => ({
      client_id: r.client_id,
      activity_type: r.activity_type,
      notes: r.notes ?? null,
      old_value: r.old_value ?? null,
      new_value: r.new_value ?? null,
      created_by: r.created_by,
    }));
    const { error: act2 } = await supabase.from("lead_activities").insert(minimal);
    if (act2) {
      return NextResponse.json(
        { error: `Call saved, but activity log failed: ${act2.message}` },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    sessionId,
    followUpId,
    leadId: lead.id,
    callOutcome: outcome,
    status: leadStatus,
    leadStage,
  });
}
