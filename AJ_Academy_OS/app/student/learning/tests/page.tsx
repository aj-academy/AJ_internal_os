"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";

type ListItem = {
  recipient: {
    id: string;
    status: string;
    attempts_used: number;
    test_id: string;
    latest_attempt_status?: string | null;
    latest_score?: number | null;
    latest_max_score?: number | null;
    latest_submitted_at?: string | null;
  };
  test: {
    id: string;
    title: string;
    duration_minutes: number;
    tab_switch_policy: string;
    status: string;
    camera_required?: boolean;
    security_mode?: string;
  } | null;
};

type Question = {
  test_question_id: string;
  question?: string;
  options?: { id: string; label: string }[];
  marks?: number;
};

function detectSafeExamBrowser() {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  const w = window as Window & { SafeExamBrowser?: unknown };
  return /SEB/i.test(ua) || Boolean(w.SafeExamBrowser);
}

async function blobFromVideo(video: HTMLVideoElement): Promise<Blob | null> {
  try {
    const canvas = document.createElement("canvas");
    const w = video.videoWidth || 320;
    const h = video.videoHeight || 240;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.72));
  } catch {
    return null;
  }
}

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
  const [policy, setPolicy] = useState<{ version: string; title: string; body: string } | null>(null);
  const [consentPending, setConsentPending] = useState<{
    testId: string;
    policy: string;
    camera?: boolean;
    securityMode?: string;
  } | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const attemptRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    attemptRef.current = attemptId;
  }, [attemptId]);

  useEffect(() => {
    streamRef.current = cameraStream;
  }, [cameraStream]);

  const logEvent = async (attempt: string, event_type: string, severity = "warn") => {
    try {
      const res = await fetch("/api/lms/proctoring", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "event",
          attempt_id: attempt,
          event_type,
          severity,
          browser_state: {
            visibility: document.visibilityState,
            userAgent: navigator.userAgent,
            online: navigator.onLine,
            seb: detectSafeExamBrowser(),
          },
        }),
      });
      const json = (await res.json()) as { eventId?: string };
      return json.eventId || null;
    } catch {
      return null;
    }
  };

  const uploadSnapshot = async (attempt: string, reason: string, eventId?: string | null) => {
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
    const blob = await blobFromVideo(video);
    if (!blob) return;
    const fd = new FormData();
    fd.set("file", blob, `${reason}.jpg`);
    fd.set("attempt_id", attempt);
    fd.set("capture_reason", reason);
    if (eventId) fd.set("event_id", eventId);
    try {
      await fetch("/api/lms/uploads/proctoring-snapshot", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
    } catch {
      /* best-effort */
    }
  };

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

  // Periodic snapshots while camera is on
  useEffect(() => {
    if (!attemptId || !cameraStream) return;
    const id = setInterval(() => {
      const aid = attemptRef.current;
      if (aid) void uploadSnapshot(aid, "periodic_snapshot");
    }, 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, cameraStream]);

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
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setCameraStream(null);
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
        void (async () => {
          const eventId = await logEvent(attemptId, "visibility_hidden", "critical");
          await uploadSnapshot(attemptId, "violation_snapshot", eventId);
        })();
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
    const onBlur = () => {
      void logEvent(attemptId, "window_blur", "warn");
    };
    const onOffline = () => {
      void logEvent(attemptId, "network_offline", "critical");
      setError("Network disconnected. Your attempt is still timed on the server.");
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("offline", onOffline);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("offline", onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, tabPolicy]);

  const beginAttempt = async (
    testId: string,
    policyName: string,
    cameraRequired?: boolean,
    securityMode?: string,
  ) => {
    setError(null);
    setSuccess(null);
    setTabPolicy(policyName || "warn");
    setViolations(0);

    if (securityMode === "safe_exam_browser" && !detectSafeExamBrowser()) {
      setError(
        "This test requires Safe Exam Browser (SEB). Open the exam inside SEB, then try again. Full SEB config/quit-password is managed outside AJ OS.",
      );
      return;
    }

    if (cameraRequired) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        setCameraStream(stream);
      } catch {
        setError("Camera permission is required for this test. Enable camera and try again.");
        return;
      }
    }

    const res = await fetch(`/api/lms/tests/${testId}/start`, { method: "POST", credentials: "include" });
    const json = (await res.json()) as {
      error?: string;
      attempt?: { id: string; server_deadline_at: string };
      result?: { attempt_id: string; server_deadline_at: string };
      questions?: Question[];
    };
    if (!res.ok) {
      setError(json.error || "Could not start test.");
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
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
    if (cameraRequired) {
      // wait a tick for video element to attach
      setTimeout(() => {
        void (async () => {
          const eventId = await logEvent(id, "identity_snapshot", "info");
          await uploadSnapshot(id, "identity_snapshot", eventId);
        })();
      }, 800);
    }
  };

  const start = async (
    testId: string,
    policyName: string,
    cameraRequired?: boolean,
    securityMode?: string,
  ) => {
    const polRes = await fetch("/api/lms/proctoring", { credentials: "include" });
    const polJson = (await polRes.json()) as {
      policy?: { version: string; title: string; body: string };
      error?: string;
      hint?: string;
    };
    if (!polRes.ok || !polJson.policy) {
      if (polJson.hint) setHint(polJson.hint);
      await beginAttempt(testId, policyName, cameraRequired, securityMode);
      return;
    }
    setPolicy(polJson.policy);
    setConsentPending({ testId, policy: policyName, camera: cameraRequired, securityMode });
  };

  const acceptConsentAndStart = async () => {
    if (!consentPending || !policy) return;
    const res = await fetch("/api/lms/proctoring", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "consent",
        test_id: consentPending.testId,
        policy_version: policy.version,
        browser_state: { userAgent: navigator.userAgent, seb: detectSafeExamBrowser() },
      }),
    });
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      setError(json.error || "Could not record consent.");
      return;
    }
    const pending = consentPending;
    setConsentPending(null);
    await beginAttempt(pending.testId, pending.policy, pending.camera, pending.securityMode);
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
        description="Assigned tests with server-side countdown, autosave, and optional camera snapshots. Do not switch tabs if your test uses a strict policy."
        actions={
          <Button variant="outline" className="rounded-xl border-[#e8dcc8]" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />
      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {hint ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{hint}</div> : null}
      {success ? <CrmFlash tone="success" message={success} onDismiss={() => setSuccess(null)} /> : null}

      {consentPending && policy ? (
        <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-[#0f172a]">{policy.title}</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-[#334155]">{policy.body}</p>
          <p className="mt-2 text-xs text-[#64748b]">Policy version: {policy.version}</p>
          {consentPending.securityMode === "safe_exam_browser" ? (
            <p className="mt-2 text-sm text-amber-900">
              SEB mode is enabled. {detectSafeExamBrowser() ? "SEB detected." : "SEB not detected in this browser."}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]" onClick={() => void acceptConsentAndStart()}>
              I understand and consent — continue
            </Button>
            <Button variant="outline" className="rounded-full" onClick={() => setConsentPending(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {attemptId ? (
        <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-[#0f172a]">In progress</h2>
            <div className="text-sm text-[#334155]">
              Time left: <strong>{mmss(remainingSec)}</strong> · {saveState}
              {violations ? ` · Violations: ${violations}` : ""}
            </div>
          </div>
          {cameraStream ? (
            <video
              className="mt-3 h-28 w-40 rounded-lg border border-[#e8dcc8] object-cover"
              autoPlay
              muted
              playsInline
              ref={(el) => {
                videoRef.current = el;
                if (el && el.srcObject !== cameraStream) el.srcObject = cameraStream;
              }}
            />
          ) : null}
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
            <p className="rounded-xl border border-dashed border-[#e8dcc8] px-4 py-10 text-center text-sm text-[#64748b]">
              No tests assigned.
            </p>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li
                  key={item.recipient.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#eef2f7] bg-[#f8fbff] px-4 py-3"
                >
                  <div>
                    <p className="font-semibold text-[#0f172a]">{item.test?.title || "Test"}</p>
                    <p className="text-xs text-[#64748b]">
                      {item.recipient.status} · {item.test?.duration_minutes} min · attempts used{" "}
                      {item.recipient.attempts_used}
                      {item.test?.camera_required ? " · camera" : ""}
                      {item.test?.security_mode === "safe_exam_browser" ? " · SEB" : ""}
                    </p>
                    {item.recipient.latest_score != null ? (
                      <p className="mt-0.5 text-xs font-medium text-[#166534]">
                        Score: {item.recipient.latest_score}
                        {item.recipient.latest_max_score != null
                          ? `/${item.recipient.latest_max_score}`
                          : ""}
                        {item.recipient.latest_submitted_at
                          ? ` · submitted ${new Date(item.recipient.latest_submitted_at).toLocaleString()}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                  {item.test && item.recipient.status !== "submitted" ? (
                    <Button
                      className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]"
                      onClick={() =>
                        void start(
                          item.test!.id,
                          item.test!.tab_switch_policy,
                          item.test!.camera_required,
                          item.test!.security_mode,
                        )
                      }
                    >
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
