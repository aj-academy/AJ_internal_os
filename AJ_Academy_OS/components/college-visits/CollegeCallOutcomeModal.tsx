"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  COLLEGE_PRIORITIES,
  FINAL_STATUSES,
  FOLLOW_UP_STAGES,
  VISIT_STATUSES,
} from "@/components/college-visits/collegeVisitsConfig";
import type { CollegeVisitRow } from "@/components/college-visits/collegeVisitsHelpers";

export const COLLEGE_CALL_OUTCOMES = [
  "Connected – Interested",
  "Connected – Needs Follow-up",
  "Connected – Visit Scheduled",
  "Connected – MOU / Proposal Discussion",
  "Connected – Not Interested",
  "No Answer",
  "Busy",
  "Call Back Later",
  "Wrong Number",
  "Other",
] as const;

export type CollegeCallOutcome = (typeof COLLEGE_CALL_OUTCOMES)[number];

export type CollegePendingCall = {
  visit: CollegeVisitRow;
  phone: string;
  targetLabel?: string;
  startedAt: string;
};

type CollegeCallOutcomeModalProps = {
  open: boolean;
  pending: CollegePendingCall | null;
  visitStatusOptions?: readonly string[];
  followUpStageOptions?: readonly string[];
  finalStatusOptions?: readonly string[];
  priorityOptions?: readonly string[];
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    visitId: string;
    callOutcome: CollegeCallOutcome;
    notes: string;
    visitStatus: string;
    followUpStage: string;
    finalStatus: string;
    priority: string;
    nextFollowUpDate: string;
    scheduleFollowUp: boolean;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function suggestedVisitStatus(outcome: CollegeCallOutcome): string | null {
  switch (outcome) {
    case "Connected – Interested":
    case "Connected – Needs Follow-up":
    case "Connected – MOU / Proposal Discussion":
      return "Contacted";
    case "Connected – Visit Scheduled":
      return "Scheduled";
    case "Connected – Not Interested":
      return null;
    case "No Answer":
    case "Busy":
    case "Call Back Later":
      return "Contacted";
    default:
      return null;
  }
}

function suggestedFollowUpStage(outcome: CollegeCallOutcome): string | null {
  switch (outcome) {
    case "Connected – Interested":
      return "Initial Contact";
    case "Connected – Needs Follow-up":
    case "No Answer":
    case "Busy":
    case "Call Back Later":
      return "Follow-up Call";
    case "Connected – Visit Scheduled":
      return "Appointment Pending";
    case "Connected – MOU / Proposal Discussion":
      return "MOU Discussion";
    case "Connected – Not Interested":
      return "Closed Lost";
    default:
      return null;
  }
}

export function CollegeCallOutcomeModal({
  open,
  pending,
  visitStatusOptions,
  followUpStageOptions,
  finalStatusOptions,
  priorityOptions,
  submitting = false,
  onClose,
  onSubmit,
}: CollegeCallOutcomeModalProps) {
  const [outcome, setOutcome] = useState<CollegeCallOutcome | "">("");
  const [notes, setNotes] = useState("");
  const [visitStatus, setVisitStatus] = useState("");
  const [followUpStage, setFollowUpStage] = useState("");
  const [finalStatus, setFinalStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [scheduleFollowUp, setScheduleFollowUp] = useState(false);
  const [nextFollowUpDate, setNextFollowUpDate] = useState(todayISO());
  const [localError, setLocalError] = useState<string | null>(null);

  const visitStatuses = visitStatusOptions?.length ? visitStatusOptions : VISIT_STATUSES;
  const followUpStages = followUpStageOptions?.length ? followUpStageOptions : FOLLOW_UP_STAGES;
  const finalStatuses = finalStatusOptions?.length ? finalStatusOptions : FINAL_STATUSES;
  const priorities = priorityOptions?.length ? priorityOptions : COLLEGE_PRIORITIES;

  useEffect(() => {
    if (!open || !pending) return;
    setOutcome("");
    setNotes("");
    setVisitStatus(pending.visit.visit_status || "Contacted");
    setFollowUpStage(pending.visit.follow_up_stage || "");
    setFinalStatus(pending.visit.final_status || "Open");
    setPriority(pending.visit.priority || "Warm");
    setScheduleFollowUp(false);
    setNextFollowUpDate(pending.visit.next_follow_up_date?.slice(0, 10) || todayISO());
    setLocalError(null);
  }, [open, pending?.visit.id, pending?.startedAt]);

  useEffect(() => {
    if (!outcome) return;
    const vs = suggestedVisitStatus(outcome);
    const fs = suggestedFollowUpStage(outcome);
    if (vs) setVisitStatus(vs);
    if (fs) setFollowUpStage(fs);
    if (
      outcome === "Connected – Needs Follow-up" ||
      outcome === "No Answer" ||
      outcome === "Busy" ||
      outcome === "Call Back Later" ||
      outcome === "Connected – Visit Scheduled"
    ) {
      setScheduleFollowUp(true);
    }
    if (outcome === "Connected – Not Interested") {
      setFinalStatus("Lost");
      setScheduleFollowUp(false);
    }
  }, [outcome]);

  if (!open || !pending) return null;

  const handleSubmit = async () => {
    setLocalError(null);
    if (!outcome) {
      setLocalError("Select a call outcome before saving.");
      return;
    }
    if (!notes.trim()) {
      setLocalError("Conversation notes / outcome remarks are required.");
      return;
    }
    if (!visitStatus.trim()) {
      setLocalError("Visit status is required.");
      return;
    }
    if (scheduleFollowUp && !nextFollowUpDate) {
      setLocalError("Follow-up date is required when scheduling a follow-up.");
      return;
    }

    const result = await onSubmit({
      visitId: pending.visit.id,
      callOutcome: outcome,
      notes: notes.trim(),
      visitStatus,
      followUpStage,
      finalStatus,
      priority,
      nextFollowUpDate: scheduleFollowUp ? nextFollowUpDate : "",
      scheduleFollowUp,
    });
    if (!result.ok) {
      setLocalError(result.error || "Could not save call outcome.");
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div
        role="dialog"
        aria-modal
        aria-labelledby="college-call-outcome-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#e8dcc8] bg-white p-4 shadow-xl"
      >
        <div className="mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#a68b2e]">After-call update</p>
          <h2 id="college-call-outcome-title" className="text-lg font-semibold text-[#0f172a]">
            You started a call with {pending.visit.college_name}. Please update the call outcome.
          </h2>
          <p className="mt-1 text-xs text-[#64748b]">
            Started {new Date(pending.startedAt).toLocaleString("en-IN")} · {pending.phone}
            {pending.targetLabel ? ` · ${pending.targetLabel}` : ""}
          </p>
        </div>

        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-[#334155]">Call outcome *</span>
            <select
              className="w-full rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as CollegeCallOutcome | "")}
            >
              <option value="">Select outcome…</option>
              {COLLEGE_CALL_OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-[#334155]">Conversation notes / outcome remarks *</span>
            <textarea
              className="min-h-[80px] w-full rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What was discussed?"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-[#334155]">Visit status *</span>
              <select
                className="w-full rounded-lg border border-[#e2e8f0] px-2 py-2 text-sm"
                value={visitStatus}
                onChange={(e) => setVisitStatus(e.target.value)}
              >
                {visitStatuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-[#334155]">Follow-up stage</span>
              <select
                className="w-full rounded-lg border border-[#e2e8f0] px-2 py-2 text-sm"
                value={followUpStage}
                onChange={(e) => setFollowUpStage(e.target.value)}
              >
                <option value="">—</option>
                {followUpStages.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-[#334155]">Final status</span>
              <select
                className="w-full rounded-lg border border-[#e2e8f0] px-2 py-2 text-sm"
                value={finalStatus}
                onChange={(e) => setFinalStatus(e.target.value)}
              >
                {finalStatuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-[#334155]">Priority</span>
              <select
                className="w-full rounded-lg border border-[#e2e8f0] px-2 py-2 text-sm"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {priorities.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-xl border border-[#f1e8d8] bg-[#fffdf8] p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-[#0f172a]">
              <input
                type="checkbox"
                checked={scheduleFollowUp}
                onChange={(e) => setScheduleFollowUp(e.target.checked)}
              />
              Schedule follow-up
            </label>
            {scheduleFollowUp ? (
              <label className="mt-3 block space-y-1">
                <span className="text-xs font-semibold text-[#334155]">Next follow-up date *</span>
                <input
                  type="date"
                  className="w-full rounded-lg border border-[#e2e8f0] px-2 py-2 text-sm"
                  value={nextFollowUpDate}
                  onChange={(e) => setNextFollowUpDate(e.target.value)}
                />
              </label>
            ) : null}
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
              {submitting ? "Saving…" : "Save call outcome"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CollegePendingCallBanner({
  pending,
  onUpdate,
  onDismiss,
}: {
  pending: CollegePendingCall | null;
  onUpdate: () => void;
  onDismiss?: () => void;
}) {
  if (!pending) return null;
  return (
    <div className="rounded-2xl border border-[#bfdbfe] bg-[#eff6ff] px-3 py-3 text-sm text-[#1e3a5f] sm:px-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold">Pending call update</p>
          <p className="mt-0.5 text-[#334155]">
            You started a call with <strong>{pending.visit.college_name}</strong>. Please update the call outcome and
            status.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" className="h-9 bg-[#1e3a5f] text-white" onClick={onUpdate}>
            Update outcome
          </Button>
          {onDismiss ? (
            <Button type="button" size="sm" variant="outline" className="h-9" onClick={onDismiss}>
              Hide
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
