"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";

type AssignmentRow = { id: string; title: string; status: string; total_marks: number };

type Detail = {
  assignment: AssignmentRow;
  recipients: { id: string; student_id: string; student_name?: string; status: string }[];
  submissions: {
    id: string;
    student_id: string;
    student_name?: string;
    attempt_number: number;
    submission_version: number;
    text_response: string | null;
    link_url: string | null;
    is_late: boolean;
    evaluation_status: string;
    submitted_at: string;
  }[];
};

export default function MentorSubmissionsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [marks, setMarks] = useState("");
  const [feedback, setFeedback] = useState("");
  const [resubmit, setResubmit] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/lms/assignments", { credentials: "include" });
      const json = (await res.json()) as { assignments?: AssignmentRow[]; error?: string; hint?: string };
      if (!res.ok) {
        setError(json.error || "Could not load assignments.");
        setHint(json.hint || null);
        return;
      }
      setAssignments(json.assignments ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async (id: string) => {
    setActiveId(id);
    setSelectedSubmission(null);
    setMarks("");
    setFeedback("");
    setResubmit(false);
    const res = await fetch(`/api/lms/assignments/${id}`, { credentials: "include" });
    const json = (await res.json()) as Detail & { error?: string };
    if (!res.ok) {
      setError(json.error || "Could not open.");
      return;
    }
    setDetail(json);
  };

  const evaluate = async () => {
    if (!selectedSubmission) return;
    const res = await fetch(`/api/lms/submissions/${selectedSubmission}/evaluate`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        awarded_marks: Number(marks),
        feedback_text: feedback,
        request_resubmission: resubmit,
      }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(json.error || "Evaluation failed.");
      return;
    }
    setSuccess(resubmit ? "Returned for resubmission." : "Evaluation saved.");
    if (activeId) await open(activeId);
  };

  return (
    <section className="space-y-5">
      <PageHeader
        kicker="Learning management"
        title="Submissions & Evaluation"
        description="Review student assignment submissions, award marks, and request resubmission when needed."
        actions={<Button variant="outline" className="rounded-xl border-[#e8dcc8]" onClick={() => void load()}>Refresh</Button>}
      />
      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {hint ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{hint}</div> : null}
      {success ? <CrmFlash tone="success" message={success} onDismiss={() => setSuccess(null)} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-[#0f172a]">Assignments</h2>
          {loading ? (
            <p className="mt-4 text-sm text-[#64748b]">Loading…</p>
          ) : !assignments.length ? (
            <p className="mt-4 text-sm text-[#64748b]">No assignments.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {assignments.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className={`w-full rounded-xl border px-3 py-3 text-left text-sm ${activeId === a.id ? "border-[#c9a227] bg-[#fff8e8]" : "border-[#eef2f7] bg-[#f8fbff]"}`}
                    onClick={() => void open(a.id)}
                  >
                    <p className="font-semibold text-[#0f172a]">{a.title}</p>
                    <p className="text-xs text-[#64748b]">{a.status} · {a.total_marks} marks</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
          {!detail ? (
            <p className="text-sm text-[#64748b]">Select an assignment.</p>
          ) : (
            <div className="space-y-4 text-sm">
              <div>
                <h2 className="text-lg font-semibold text-[#0f172a]">{detail.assignment.title}</h2>
                <p className="text-xs text-[#64748b]">
                  Recipients: {detail.recipients.length} · Submissions: {detail.submissions.length}
                </p>
              </div>
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {detail.submissions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`w-full rounded-xl border px-3 py-2 text-left ${selectedSubmission === s.id ? "border-[#c9a227] bg-[#fff8e8]" : "border-[#eef2f7] bg-[#f8fbff]"}`}
                      onClick={() => {
                        setSelectedSubmission(s.id);
                        setMarks("");
                        setFeedback("");
                      }}
                    >
                      <p className="font-medium text-[#0f172a]">{s.student_name || s.student_id.slice(0, 8)}</p>
                      <p className="text-xs text-[#64748b]">
                        Attempt {s.attempt_number} v{s.submission_version} · {s.evaluation_status}
                        {s.is_late ? " · late" : ""}
                      </p>
                      {s.text_response ? <p className="mt-1 line-clamp-3 text-[#334155]">{s.text_response}</p> : null}
                      {s.link_url ? (
                        <a className="text-xs text-[#c9a227] underline" href={s.link_url} target="_blank" rel="noreferrer">
                          Link
                        </a>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>

              {selectedSubmission ? (
                <div className="space-y-2 rounded-xl border border-[#eef2f7] p-3">
                  <label>
                    Marks
                    <input className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3" value={marks} onChange={(e) => setMarks(e.target.value)} />
                  </label>
                  <label>
                    Feedback
                    <textarea className="mt-1 min-h-[72px] w-full rounded-lg border border-[#dbe6f3] px-3 py-2" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={resubmit} onChange={(e) => setResubmit(e.target.checked)} />
                    Request resubmission
                  </label>
                  <Button className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]" onClick={() => void evaluate()}>
                    Save evaluation
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
