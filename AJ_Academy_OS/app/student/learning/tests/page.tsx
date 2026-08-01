"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";

type ListItem = {
  recipient: { id: string; status: string; attempts_used: number; test_id: string };
  test: {
    id: string;
    title: string;
    duration_minutes: number;
    tab_switch_policy: string;
    status: string;
  } | null;
};

type Question = {
  test_question_id: string;
  question?: string;
  options?: { id: string; label: string }[];
  marks?: number;
};

export default function StudentTestsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [activeTestId, setActiveTestId] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState("Idle");
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [tabPolicy, setTabPolicy] = useState("warn");
  const [violations, setViolations] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/lms/tests", { credentials: "include" });
      const json = (await res.json()) as { items?: ListItem[]; error?: string; hint?: string };
      if (!res.ok) {
        setError(json.error || "Could not load tests.");
        setHint(json.hint || null);
        return;
      }
      setItems(json.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!deadline) {
      setRemainingSec(null);
      return;
    }
    const tick = () => {
      const ms = new Date(deadline).getTime() - Date.now();
      setRemainingSec(Math.max(0, Math.floor(ms / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  useEffect(() => {
    if (remainingSec === 0 && attemptId) {
      void submitAttempt("AUTO_SUBMITTED_TIME_EXPIRED");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSec, attemptId]);

  const saveAnswer = async (questionId: string, selected: string) => {
    if (!attemptId) return;
    setAnswers((a) => ({ ...a, [questionId]: selected }));
    setSaveState("Saving…");
    const res = await fetch(`/api/lms/tests/attempts/${attemptId}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", test_question_id: questionId, selected_answer: selected }),
    });
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      setSaveState("Save failed");
      setError(json.error || "Autosave failed.");
      return;
    }
    setSaveState("Saved");
  };

  const submitAttempt = async (reason = "manual") => {
    if (!attemptId) return;
    setSaveState("Submitting…");
    const res = await fetch(`/api/lms/tests/attempts/${attemptId}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit", reason }),
    });
    const json = (await res.json()) as { error?: string; result?: { score?: number; max_score?: number } };
    if (!res.ok) {
      setError(json.error || "Submit failed.");
      return;
    }
    setSuccess(
      `Test submitted${json.result?.score != null ? ` · Score ${json.result.score}/${json.result.max_score}` : ""}.`,
    );
    setActiveTestId(null);
    setAttemptId(null);
    setQuestions([]);
    setDeadline(null);
    await load();
  };

  useEffect(() => {
    if (!attemptId) return;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        setViolations((v) => {
          const next = v + 1;
          if (tabPolicy === "immediate_auto_submit") {
            void submitAttempt("AUTO_SUBMITTED_TAB_SWITCH");
          } else if (tabPolicy === "auto_submit_after_count" && next >= 1) {
            void submitAttempt("AUTO_SUBMITTED_TAB_SWITCH");
          } else if (tabPolicy === "warn") {
            setError("Tab switch detected. Stay on the test page.");
          }
          return next;
        });
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, tabPolicy]);

  const start = async (testId: string, policy: string) => {
    setError(null);
    setSuccess(null);
    setTabPolicy(policy || "warn");
    setViolations(0);
    const res = await fetch(`/api/lms/tests/${testId}/start`, { method: "POST", credentials: "include" });
    const json = (await res.json()) as {
      error?: string;
      attempt?: { id: string; server_deadline_at: string };
      result?: { attempt_id: string; server_deadline_at: string };
      questions?: Question[];
    };
    if (!res.ok) {
      setError(json.error || "Could not start test.");
      return;
    }
    const id = json.attempt?.id || json.result?.attempt_id;
    const dl = json.attempt?.server_deadline_at || json.result?.server_deadline_at;
    if (!id) {
      setError("Attempt id missing.");
      return;
    }
    setActiveTestId(testId);
    setAttemptId(id);
    setDeadline(dl || null);
    setQuestions(json.questions ?? []);
  };

  const mmss = (sec: number | null) => {
    if (sec == null) return "—";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <section className="space-y-5">
      <PageHeader
        kicker="Learning & assessments"
        title="Tests"
        description="Assigned tests with server-side countdown and autosave. Do not switch tabs if your test uses a strict policy."
        actions={<Button variant="outline" className="rounded-xl border-[#e8dcc8]" onClick={() => void load()}>Refresh</Button>}
      />
      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {hint ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{hint}</div> : null}
      {success ? <CrmFlash tone="success" message={success} onDismiss={() => setSuccess(null)} /> : null}

      {attemptId ? (
        <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-[#0f172a]">In progress</h2>
            <div className="text-sm text-[#334155]">
              Time left: <strong>{mmss(remainingSec)}</strong> · {saveState}
              {violations ? ` · Violations: ${violations}` : ""}
            </div>
          </div>
          <ul className="mt-4 space-y-4">
            {questions.map((q, idx) => (
              <li key={q.test_question_id} className="rounded-xl border border-[#eef2f7] bg-[#f8fbff] p-4">
                <p className="font-medium text-[#0f172a]">
                  {idx + 1}. {q.question} <span className="text-xs text-[#64748b]">({q.marks} mark)</span>
                </p>
                <div className="mt-2 space-y-1">
                  {(q.options || []).map((opt) => (
                    <label key={opt.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={q.test_question_id}
                        checked={answers[q.test_question_id] === opt.id}
                        onChange={() => void saveAnswer(q.test_question_id, opt.id)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <Button className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]" onClick={() => void submitAttempt("manual")}>
              Submit test
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
          {loading ? (
            <p className="text-sm text-[#64748b]">Loading…</p>
          ) : !items.length ? (
            <p className="rounded-xl border border-dashed border-[#e8dcc8] px-4 py-10 text-center text-sm text-[#64748b]">No tests assigned.</p>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.recipient.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#eef2f7] bg-[#f8fbff] px-4 py-3">
                  <div>
                    <p className="font-semibold text-[#0f172a]">{item.test?.title || "Test"}</p>
                    <p className="text-xs text-[#64748b]">
                      {item.recipient.status} · {item.test?.duration_minutes} min · attempts used {item.recipient.attempts_used}
                    </p>
                  </div>
                  {item.test && item.recipient.status !== "submitted" ? (
                    <Button className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]" onClick={() => void start(item.test!.id, item.test!.tab_switch_policy)}>
                      {activeTestId === item.test.id ? "Resume" : "Start"}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
