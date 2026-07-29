"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CALL_FOLLOW_UP_TYPES,
  CALL_OUTCOME_RULES,
  CALL_OUTCOMES,
  type CallOutcome,
  type LeadCallHistoryItem,
  type LeadCallSessionRow,
} from "@/lib/leadCallWorkflow";
import { CRM_LEAD_STATUSES, CRM_PRIORITIES, LEAD_STAGES, PRIMARY_OBJECTIONS } from "@/components/student-lead-master/studentMasterConfig";

type EmployeeOption = { id: string; label: string };

type CallOutcomeModalProps = {
  open: boolean;
  session: LeadCallSessionRow | null;
  leadName: string;
  currentStatus?: string | null;
  currentStage?: string | null;
  currentPriority?: string | null;
  assignedEmployeeId?: string | null;
  employeeOptions: EmployeeOption[];
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<{ ok: true } | { ok: false; error: string }>;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatIstDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function HistoryField({ label, value }: { label: string; value: unknown }) {
  const text =
    value == null || value === ""
      ? "—"
      : typeof value === "boolean"
        ? value
          ? "Yes"
          : "No"
        : String(value);
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 text-xs">
      <span className="font-semibold text-[#8a7a65]">{label}</span>
      <span className="whitespace-pre-wrap text-[#3d3428]">{text}</span>
    </div>
  );
}

function CallOutcomeHistoryPanel({
  history,
  loading,
  employeeNameMap,
}: {
  history: LeadCallHistoryItem[];
  loading: boolean;
  employeeNameMap: Record<string, string>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return <p className="text-xs text-[#8a7a65]">Loading previous call outcomes…</p>;
  }
  if (!history.length) {
    return <p className="text-xs text-[#8a7a65]">No previous call outcomes for this lead yet.</p>;
  }

  return (
    <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
      {history.map((item) => {
        const snap = item.outcome_snapshot || {};
        const openItem = expandedId === item.id;
        const when = formatIstDateTime(item.ended_at || item.started_at);
        const title = item.call_outcome || snap.callOutcome || "Call logged";
        return (
          <div key={item.id} className="rounded-xl border border-[#e8dcc8] bg-white">
            <button
              type="button"
              className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left"
              onClick={() => setExpandedId(openItem ? null : item.id)}
            >
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#a68b2e]">{when} IST</p>
                <p className="text-sm font-semibold text-[#3d3428]">{title}</p>
                <p className="text-[11px] text-[#8a7a65]">
                  {item.employee_name || "Staff"}
                  {item.session_status !== "completed" ? ` · ${item.session_status}` : ""}
                </p>
              </div>
              <span className="text-[11px] font-semibold text-[#c9a227]">{openItem ? "Hide" : "View"}</span>
            </button>
            {openItem ? (
              <div className="space-y-1.5 border-t border-[#e8dcc8] px-3 py-2.5">
                <HistoryField label="Outcome" value={snap.callOutcome || item.call_outcome} />
                <HistoryField label="Notes" value={snap.notes || item.notes} />
                <HistoryField label="Next action" value={snap.nextAction || item.next_action} />
                <HistoryField label="Lost reason" value={snap.lostReason} />
                <HistoryField label="Lead status" value={snap.leadStatus} />
                <HistoryField
                  label="Lead stage"
                  value={snap.leadStage || item.lead_stage_after || item.lead_stage_at_start}
                />
                <HistoryField label="Priority" value={snap.priority} />
                <HistoryField label="Primary objection" value={snap.primaryObjection} />
                <HistoryField
                  label="Duration"
                  value={
                    snap.approximateDurationSeconds != null || item.approximate_duration_seconds != null
                      ? `${Math.round(
                          Number(snap.approximateDurationSeconds ?? item.approximate_duration_seconds) / 60,
                        )} min`
                      : null
                  }
                />
                <HistoryField label="Brochure shared" value={snap.brochureShared} />
                <HistoryField label="Payment details" value={snap.paymentDetailsShared} />
                <HistoryField label="Duplicate of" value={snap.duplicateOfLeadId} />
                <HistoryField label="Follow-up?" value={snap.scheduleFollowUp} />
                <HistoryField label="Follow-up date" value={snap.followUpDate || item.follow_up?.follow_up_date} />
                <HistoryField label="Follow-up time" value={snap.followUpTime || item.follow_up?.follow_up_time} />
                <HistoryField label="Follow-up type" value={snap.followUpType || item.follow_up?.follow_up_type} />
                <HistoryField label="Follow-up reason" value={snap.followUpReason || item.follow_up?.reason} />
                <HistoryField label="Follow-up priority" value={snap.followUpPriority || item.follow_up?.priority} />
                <HistoryField label="Follow-up notes" value={snap.followUpNotes || item.follow_up?.notes} />
                <HistoryField
                  label="Follow-up assignee"
                  value={
                    snap.followUpAssignedEmployeeId
                      ? employeeNameMap[snap.followUpAssignedEmployeeId] || snap.followUpAssignedEmployeeId
                      : item.follow_up?.assigned_employee_id
                        ? employeeNameMap[item.follow_up.assigned_employee_id] || item.follow_up.assigned_employee_id
                        : null
                  }
                />
                <HistoryField label="Started" value={formatIstDateTime(item.started_at)} />
                <HistoryField label="Ended" value={formatIstDateTime(item.ended_at || snap.endedAt)} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function CallOutcomeModal({
  open,
  session,
  leadName,
  currentStatus,
  currentStage,
  currentPriority,
  assignedEmployeeId,
  employeeOptions,
  submitting = false,
  onClose,
  onSubmit,
}: CallOutcomeModalProps) {
  const [outcome, setOutcome] = useState<CallOutcome | "">("");
  const [notes, setNotes] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [leadStatus, setLeadStatus] = useState(currentStatus || "");
  const [leadStage, setLeadStage] = useState(currentStage || "");
  const [priority, setPriority] = useState(currentPriority || "");
  const [primaryObjection, setPrimaryObjection] = useState("");
  const [scheduleFollowUp, setScheduleFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState(todayISO());
  const [followUpTime, setFollowUpTime] = useState("10:00");
  const [followUpType, setFollowUpType] = useState("Phone Call");
  const [followUpReason, setFollowUpReason] = useState("");
  const [followUpPriority, setFollowUpPriority] = useState(currentPriority || "Warm");
  const [followUpAssigned, setFollowUpAssigned] = useState(assignedEmployeeId || "");
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [brochureShared, setBrochureShared] = useState(false);
  const [paymentDetailsShared, setPaymentDetailsShared] = useState(false);
  const [duplicateOfLeadId, setDuplicateOfLeadId] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [history, setHistory] = useState<LeadCallHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const rules = outcome ? CALL_OUTCOME_RULES[outcome] : null;
  const employeeNameMap = useMemo(
    () => Object.fromEntries(employeeOptions.map((e) => [e.id, e.label])),
    [employeeOptions],
  );

  useEffect(() => {
    if (!open || !session?.lead_id) return;
    let cancelled = false;
    void (async () => {
      setHistoryLoading(true);
      try {
        const res = await fetch(`/api/leads/call/history?leadId=${encodeURIComponent(session.lead_id)}`);
        const json = (await res.json()) as { history?: LeadCallHistoryItem[] };
        if (cancelled) return;
        setHistory((json.history || []).filter((h) => h.id !== session.id));
      } catch {
        if (!cancelled) setHistory([]);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, session?.id, session?.lead_id]);

  const applyOutcomeDefaults = (next: CallOutcome | "") => {
    setOutcome(next);
    if (!next) return;
    const nextRules = CALL_OUTCOME_RULES[next];
    if (nextRules.suggestedStatus) setLeadStatus(nextRules.suggestedStatus);
    if (nextRules.suggestedStage) setLeadStage(nextRules.suggestedStage);
    if (nextRules.suggestedPriority) setPriority(nextRules.suggestedPriority);
    if (nextRules.requireFollowUp) setScheduleFollowUp(true);
    else if (!nextRules.askFollowUp) setScheduleFollowUp(false);
    if (nextRules.markBrochureAction) setBrochureShared(true);
    if (nextRules.markPaymentAction) {
      setPaymentDetailsShared(true);
      setFollowUpType("Payment Follow-up");
    }
  };

  const statusOptions = useMemo(() => {
    const set = new Set<string>([...CRM_LEAD_STATUSES, leadStatus].filter(Boolean));
    return [...set];
  }, [leadStatus]);

  const stageOptions = useMemo(() => {
    const extras = [
      "Brochure Shared",
      "Brochure Pending",
      "Payment Follow-up",
      "Ready to Join",
      "Call Attempted",
      "Invalid Lead",
      leadStage || "",
    ];
    return [...new Set([...LEAD_STAGES, ...extras].filter(Boolean))];
  }, [leadStage]);

  if (!open || !session) return null;

  const handleSubmit = async () => {
    setLocalError(null);
    if (!outcome) {
      setLocalError("Select a call outcome before saving.");
      return;
    }
    if (rules?.requireNotes && !notes.trim()) {
      setLocalError("Conversation notes are required.");
      return;
    }
    if (rules?.requireNextAction && !nextAction.trim()) {
      setLocalError("Next action is required.");
      return;
    }
    if (rules?.requireLostReason && !lostReason.trim()) {
      setLocalError("Lost reason is required.");
      return;
    }
    const needFollowUp = scheduleFollowUp || Boolean(rules?.requireFollowUp);
    if (needFollowUp && !followUpDate) {
      setLocalError("Follow-up date is required.");
      return;
    }

    const durationSeconds = durationMinutes.trim()
      ? Math.round(Number(durationMinutes) * 60)
      : null;

    const result = await onSubmit({
      sessionId: session.id,
      callOutcome: outcome,
      notes: notes.trim(),
      nextAction: nextAction.trim(),
      lostReason: lostReason.trim() || null,
      leadStatus: leadStatus || null,
      leadStage: leadStage || null,
      priority: priority || null,
      primaryObjection: primaryObjection.trim() || null,
      scheduleFollowUp: needFollowUp,
      followUpDate: needFollowUp ? followUpDate : null,
      followUpTime: needFollowUp ? followUpTime : null,
      followUpType: needFollowUp ? followUpType : null,
      followUpReason: needFollowUp ? followUpReason.trim() || null : null,
      followUpPriority: needFollowUp ? followUpPriority : null,
      followUpAssignedEmployeeId: needFollowUp ? followUpAssigned || assignedEmployeeId : null,
      followUpNotes: needFollowUp ? followUpNotes.trim() || null : null,
      brochureShared,
      paymentDetailsShared,
      duplicateOfLeadId: outcome === "Duplicate Lead" ? duplicateOfLeadId.trim() || null : null,
      approximateDurationSeconds: Number.isFinite(durationSeconds as number) ? durationSeconds : null,
      endedAt: new Date().toISOString(),
    });
    if (!result.ok) {
      setLocalError(result.error || "Could not save call outcome.");
      return;
    }
    // Close immediately after a successful save.
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div
        role="dialog"
        aria-modal
        aria-labelledby="call-outcome-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#e8dcc8] bg-white p-4 shadow-xl"
      >
        <div className="mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#a68b2e]">After-call update</p>
          <h2 id="call-outcome-title" className="text-lg font-semibold text-[#0f172a]">
            You started a call with {leadName}. Please update the call outcome.
          </h2>
          <p className="mt-1 text-xs text-[#64748b]">
            Started {new Date(session.started_at).toLocaleString("en-IN")} · {session.phone_number}
            {session.session_status === "stale" ? " · Session marked stale (still editable)" : ""}
          </p>
          <p className="mt-1 text-[11px] text-[#94a3b8]">
            The app cannot detect whether the phone call was answered - confirm the outcome yourself.
          </p>
        </div>

        <div className="mb-4 rounded-2xl border border-[#e8dcc8] bg-[#fffdf8] p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#a68b2e]">
            Previous call outcomes
          </p>
          <CallOutcomeHistoryPanel
            history={history}
            loading={historyLoading}
            employeeNameMap={employeeNameMap}
          />
        </div>

        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-[#334155]">Call outcome *</span>
            <select
              className="w-full rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm"
              value={outcome}
              onChange={(e) => applyOutcomeDefaults(e.target.value as CallOutcome | "")}
            >
              <option value="">Select outcome...</option>
              {CALL_OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-[#334155]">
              Conversation notes{rules?.requireNotes ? " *" : ""}
            </span>
            <textarea
              className="min-h-[80px] w-full rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What was discussed?"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-[#334155]">
              Next action{rules?.requireNextAction ? " *" : ""}
            </span>
            <input
              className="w-full rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="e.g. Share fee structure, call again tomorrow"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-[#334155]">Lead status</span>
              <select
                className="w-full rounded-lg border border-[#e2e8f0] px-2 py-2 text-sm"
                value={leadStatus}
                onChange={(e) => setLeadStatus(e.target.value)}
              >
                <option value="">-</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-[#334155]">Lead stage</span>
              <select
                className="w-full rounded-lg border border-[#e2e8f0] px-2 py-2 text-sm"
                value={leadStage}
                onChange={(e) => setLeadStage(e.target.value)}
              >
                <option value="">-</option>
                {stageOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-[#334155]">Priority</span>
            <select
              className="w-full rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="">-</option>
              {CRM_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-[#334155]">Primary objection</span>
            <select
              className="w-full rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm"
              value={
                primaryObjection && !(PRIMARY_OBJECTIONS as readonly string[]).includes(primaryObjection)
                  ? "Other"
                  : primaryObjection
              }
              onChange={(e) => setPrimaryObjection(e.target.value)}
            >
              <option value="">None / not discussed</option>
              {PRIMARY_OBJECTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          {primaryObjection === "Other" ? (
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-[#334155]">Objection details</span>
              <input
                className="w-full rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm"
                value=""
                onChange={(e) => setPrimaryObjection(e.target.value.trim() || "Other")}
                placeholder="Type the exact objection"
              />
            </label>
          ) : primaryObjection && !(PRIMARY_OBJECTIONS as readonly string[]).includes(primaryObjection) ? (
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-[#334155]">Objection details</span>
              <input
                className="w-full rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm"
                value={primaryObjection}
                onChange={(e) => setPrimaryObjection(e.target.value.trim() || "Other")}
                placeholder="Type the exact objection"
              />
            </label>
          ) : null}

          {rules?.requireLostReason ? (
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-[#334155]">Lost reason *</span>
              <input
                className="w-full rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm"
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
              />
            </label>
          ) : null}

          {outcome === "Duplicate Lead" ? (
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-[#334155]">Original lead ID (optional link)</span>
              <input
                className="w-full rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm"
                value={duplicateOfLeadId}
                onChange={(e) => setDuplicateOfLeadId(e.target.value)}
                placeholder="UUID of original lead"
              />
            </label>
          ) : null}

          {rules?.markBrochureAction ? (
            <label className="flex items-center gap-2 text-sm text-[#334155]">
              <input type="checkbox" checked={brochureShared} onChange={(e) => setBrochureShared(e.target.checked)} />
              Mark brochure shared
            </label>
          ) : null}
          {rules?.markPaymentAction ? (
            <label className="flex items-center gap-2 text-sm text-[#334155]">
              <input
                type="checkbox"
                checked={paymentDetailsShared}
                onChange={(e) => setPaymentDetailsShared(e.target.checked)}
              />
              Mark payment details shared
            </label>
          ) : null}

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-[#334155]">Approx. call duration (minutes)</span>
            <input
              type="number"
              min={0}
              step={0.5}
              className="w-full rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              placeholder="Optional - or calculated from start/end"
            />
          </label>

          <div className="rounded-xl border border-[#f1e8d8] bg-[#fffdf8] p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-[#0f172a]">
              <input
                type="checkbox"
                checked={scheduleFollowUp || Boolean(rules?.requireFollowUp)}
                disabled={Boolean(rules?.requireFollowUp)}
                onChange={(e) => setScheduleFollowUp(e.target.checked)}
              />
              Schedule follow-up
              {rules?.requireFollowUp ? " (required)" : rules?.askFollowUp ? " (recommended)" : ""}
            </label>

            {(scheduleFollowUp || rules?.requireFollowUp) && (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-[#334155]">Date *</span>
                    <input
                      type="date"
                      className="w-full rounded-lg border border-[#e2e8f0] px-2 py-2 text-sm"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-[#334155]">Time *</span>
                    <input
                      type="time"
                      className="w-full rounded-lg border border-[#e2e8f0] px-2 py-2 text-sm"
                      value={followUpTime}
                      onChange={(e) => setFollowUpTime(e.target.value)}
                    />
                  </label>
                </div>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-[#334155]">Type</span>
                  <select
                    className="w-full rounded-lg border border-[#e2e8f0] px-2 py-2 text-sm"
                    value={followUpType}
                    onChange={(e) => setFollowUpType(e.target.value)}
                  >
                    {CALL_FOLLOW_UP_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-[#334155]">Reason</span>
                  <input
                    className="w-full rounded-lg border border-[#e2e8f0] px-2 py-2 text-sm"
                    value={followUpReason}
                    onChange={(e) => setFollowUpReason(e.target.value)}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-[#334155]">Assigned employee</span>
                  <select
                    className="w-full rounded-lg border border-[#e2e8f0] px-2 py-2 text-sm"
                    value={followUpAssigned}
                    onChange={(e) => setFollowUpAssigned(e.target.value)}
                  >
                    <option value="">Lead owner / me</option>
                    {employeeOptions.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-[#334155]">Follow-up priority</span>
                  <select
                    className="w-full rounded-lg border border-[#e2e8f0] px-2 py-2 text-sm"
                    value={followUpPriority}
                    onChange={(e) => setFollowUpPriority(e.target.value)}
                  >
                    {CRM_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-[#334155]">Follow-up notes</span>
                  <textarea
                    className="min-h-[60px] w-full rounded-lg border border-[#e2e8f0] px-2 py-2 text-sm"
                    value={followUpNotes}
                    onChange={(e) => setFollowUpNotes(e.target.value)}
                  />
                </label>
              </div>
            )}
          </div>

          {localError ? <p className="text-sm text-rose-700">{localError}</p> : null}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Later
            </Button>
            <Button
              type="button"
              className="bg-[#1e3a5f] text-white hover:bg-[#162d49]"
              onClick={() => void handleSubmit()}
              disabled={submitting}
            >
              {submitting ? "Saving..." : "Save call outcome"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PendingCallOutcomeBanner({
  sessions,
  onUpdate,
  onDismiss,
}: {
  sessions: LeadCallSessionRow[];
  onUpdate: (session: LeadCallSessionRow) => void;
  onDismiss?: () => void;
}) {
  if (!sessions.length) return null;
  const first = sessions[0];
  return (
    <div className="rounded-2xl border border-[#bfdbfe] bg-[#eff6ff] px-3 py-3 text-sm text-[#1e3a5f] sm:px-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold">Pending call updates ({sessions.length})</p>
          <p className="mt-0.5 text-[#334155]">
            You started a call with <strong>{first.lead_name || "a lead"}</strong>. Please update the call outcome.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button type="button" size="sm" className="h-10 bg-[#1e3a5f] text-white sm:h-8" onClick={() => onUpdate(first)}>
            Update outcome
          </Button>
          {onDismiss ? (
            <Button type="button" size="sm" variant="outline" className="h-10 sm:h-8" onClick={onDismiss}>
              Hide
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function LeadCallLiveDashboard({
  stats,
  live,
  isAdmin,
}: {
  stats: {
    callsToday: number;
    connectedToday: number;
    unansweredToday: number;
    pendingOutcomes: number;
  } | null;
  live: Array<{
    id: string;
    lead_name?: string;
    employee_name?: string | null;
    started_at: string;
    elapsed_seconds?: number;
    session_status: string;
  }>;
  isAdmin: boolean;
}) {
  if (!stats && !live.length) return null;
  const cards = [
    { label: "Calls today", value: stats?.callsToday ?? 0, color: "border-[#bfdbfe] bg-[#eff6ff] text-[#1e3a5f]" },
    { label: "Connected", value: stats?.connectedToday ?? 0, color: "border-emerald-200 bg-emerald-50 text-emerald-800" },
    { label: "Unanswered", value: stats?.unansweredToday ?? 0, color: "border-orange-200 bg-orange-50 text-orange-800" },
    { label: "Pending outcomes", value: stats?.pendingOutcomes ?? 0, color: "border-rose-200 bg-rose-50 text-rose-800" },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-xl border px-2.5 py-2 sm:px-3 ${c.color}`}>
            <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide opacity-80">{c.label}</p>
            <p className="mt-0.5 text-lg font-semibold sm:text-xl">{c.value}</p>
          </div>
        ))}
      </div>
      {isAdmin && live.length > 0 ? (
        <div className="rounded-2xl border border-[#bfdbfe] bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#1e3a5f]">Live calling</p>
          <ul className="space-y-2">
            {live.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-[#334155]">
                <span>
                  <strong>{row.lead_name}</strong> · {row.employee_name || "Staff"}
                </span>
                <span className="text-xs text-[#64748b]">
                  {row.session_status} · {Math.floor((row.elapsed_seconds || 0) / 60)}m{" "}
                  {(row.elapsed_seconds || 0) % 60}s
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

