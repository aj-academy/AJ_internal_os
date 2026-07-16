"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CALL_FOLLOW_UP_TYPES,
  CALL_OUTCOME_RULES,
  CALL_OUTCOMES,
  type CallOutcome,
  type LeadCallSessionRow,
} from "@/lib/leadCallWorkflow";
import { CRM_LEAD_STATUSES, CRM_PRIORITIES, LEAD_STAGES } from "@/components/student-lead-master/studentMasterConfig";

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
  onSubmit: (payload: Record<string, unknown>) => Promise<void> | void;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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
  const [leadStatus, setLeadStatus] = useState("");
  const [leadStage, setLeadStage] = useState("");
  const [priority, setPriority] = useState("");
  const [scheduleFollowUp, setScheduleFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState(todayISO());
  const [followUpTime, setFollowUpTime] = useState("10:00");
  const [followUpType, setFollowUpType] = useState("Phone Call");
  const [followUpReason, setFollowUpReason] = useState("");
  const [followUpPriority, setFollowUpPriority] = useState("Warm");
  const [followUpAssigned, setFollowUpAssigned] = useState("");
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [brochureShared, setBrochureShared] = useState(false);
  const [paymentDetailsShared, setPaymentDetailsShared] = useState(false);
  const [duplicateOfLeadId, setDuplicateOfLeadId] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const rules = outcome ? CALL_OUTCOME_RULES[outcome] : null;

  useEffect(() => {
    if (!open || !session) return;
    setOutcome("");
    setNotes("");
    setNextAction("");
    setLostReason("");
    setLeadStatus(currentStatus || "");
    setLeadStage(currentStage || "");
    setPriority(currentPriority || "");
    setScheduleFollowUp(false);
    setFollowUpDate(todayISO());
    setFollowUpTime("10:00");
    setFollowUpType("Phone Call");
    setFollowUpReason("");
    setFollowUpPriority(currentPriority || "Warm");
    setFollowUpAssigned(assignedEmployeeId || "");
    setFollowUpNotes("");
    setBrochureShared(false);
    setPaymentDetailsShared(false);
    setDuplicateOfLeadId("");
    setDurationMinutes("");
    setLocalError(null);
  }, [open, session?.id, currentStatus, currentStage, currentPriority, assignedEmployeeId]);

  useEffect(() => {
    if (!outcome || !rules) return;
    if (rules.suggestedStatus) setLeadStatus(rules.suggestedStatus);
    if (rules.suggestedStage) setLeadStage(rules.suggestedStage);
    if (rules.suggestedPriority) setPriority(rules.suggestedPriority);
    if (rules.requireFollowUp) setScheduleFollowUp(true);
    else if (!rules.askFollowUp) setScheduleFollowUp(false);
    if (rules.markBrochureAction) setBrochureShared(true);
    if (rules.markPaymentAction) {
      setPaymentDetailsShared(true);
      setFollowUpType("Payment Follow-up");
    }
  }, [outcome, rules]);

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

    await onSubmit({
      sessionId: session.id,
      callOutcome: outcome,
      notes: notes.trim(),
      nextAction: nextAction.trim(),
      lostReason: lostReason.trim() || null,
      leadStatus: leadStatus || null,
      leadStage: leadStage || null,
      priority: priority || null,
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
            The app cannot detect whether the phone call was answered â€” confirm the outcome yourself.
          </p>
        </div>

        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-[#334155]">Call outcome *</span>
            <select
              className="w-full rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as CallOutcome | "")}
            >
              <option value="">Select outcomeâ€¦</option>
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
                <option value="">â€”</option>
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
                <option value="">â€”</option>
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
              <option value="">â€”</option>
              {CRM_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

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
              placeholder="Optional â€” or calculated from start/end"
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
              {submitting ? "Savingâ€¦" : "Save call outcome"}
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
    <div className="rounded-2xl border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3 text-sm text-[#1e3a5f]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">Pending call updates ({sessions.length})</p>
          <p className="mt-0.5 text-[#334155]">
            You started a call with <strong>{first.lead_name || "a lead"}</strong>. Please update the call outcome.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" className="bg-[#1e3a5f] text-white" onClick={() => onUpdate(first)}>
            Update outcome
          </Button>
          {onDismiss ? (
            <Button type="button" size="sm" variant="outline" onClick={onDismiss}>
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
          <div key={c.label} className={`rounded-xl border px-3 py-2 ${c.color}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{c.label}</p>
            <p className="text-xl font-semibold">{c.value}</p>
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

