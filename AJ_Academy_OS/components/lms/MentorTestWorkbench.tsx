"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";
import type { AcademicBatch, AcademicCourse, AcademicDepartment } from "@/types/lms";

type TestRow = {
  id: string;
  title: string;
  status: string;
  duration_minutes: number;
  tab_switch_policy: string;
  camera_required?: boolean;
  security_mode?: string;
};
type EligibleStudent = { student_id: string; full_name: string | null; email: string | null };
type QDraft = { question: string; options: string; correct_index: string; marks: string };

type ProctoringReview = {
  attempts: { id: string; student_id: string; student_name?: string; status: string; score: number | null; started_at?: string; server_started_at?: string }[];
  events: { id: string; attempt_id: string; event_type: string; severity: string; created_at: string }[];
  media: { id: string; attempt_id: string; storage_path: string; capture_reason: string; review_status: string; captured_at: string }[];
};

export function MentorTestWorkbench() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tests, setTests] = useState<TestRow[]>([]);
  const [departments, setDepartments] = useState<AcademicDepartment[]>([]);
  const [courses, setCourses] = useState<AcademicCourse[]>([]);
  const [batches, setBatches] = useState<AcademicBatch[]>([]);
  const [eligible, setEligible] = useState<EligibleStudent[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [audienceMode, setAudienceMode] = useState<"all" | "selected">("all");
  const [submitting, setSubmitting] = useState(false);
  const [questions, setQuestions] = useState<QDraft[]>([
    { question: "", options: "Option A\nOption B\nOption C\nOption D", correct_index: "0", marks: "1" },
  ]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    department_id: "",
    course_id: "",
    batch_id: "",
    duration_minutes: "30",
    tab_switch_policy: "warn",
    camera_required: false,
    security_mode: "normal",
    publish: true,
  });
  const [reviewTestId, setReviewTestId] = useState<string | null>(null);
  const [review, setReview] = useState<ProctoringReview | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  const coursesForDept = useMemo(
    () => courses.filter((c) => c.department_id === form.department_id),
    [courses, form.department_id],
  );
  const batchesForCourse = useMemo(
    () => batches.filter((b) => b.course_id === form.course_id),
    [batches, form.course_id],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const supabase = createClient();
      const [testRes, deptRes, courseRes, batchRes] = await Promise.all([
        fetch("/api/lms/tests", { credentials: "include" }),
        supabase.from("academic_departments").select("*").eq("status", "active").order("name"),
        supabase.from("academic_courses").select("*").eq("status", "active").order("name"),
        supabase.from("academic_batches").select("*").eq("status", "active").order("name"),
      ]);
      const testJson = (await testRes.json()) as { tests?: TestRow[]; error?: string; hint?: string };
      if (!testRes.ok) {
        setError(testJson.error || "Could not load tests.");
        setHint(testJson.hint || null);
        return;
      }
      setTests(testJson.tests ?? []);
      setDepartments((deptRes.data as AcademicDepartment[]) ?? []);
      setCourses((courseRes.data as AcademicCourse[]) ?? []);
      setBatches((batchRes.data as AcademicBatch[]) ?? []);
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
    if (!form.department_id) {
      setEligible([]);
      return;
    }
    const params = new URLSearchParams({ department_id: form.department_id });
    if (form.course_id) params.set("course_id", form.course_id);
    if (form.batch_id) params.set("batch_id", form.batch_id);
    void fetch(`/api/lms/eligible-students?${params}`, { credentials: "include" })
      .then((r) => r.json())
      .then((j: { students?: EligibleStudent[] }) => setEligible(j.students ?? []));
  }, [form.department_id, form.course_id, form.batch_id]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const studentIds = audienceMode === "selected" ? [...selectedStudents] : undefined;
      if (audienceMode === "selected" && !studentIds?.length) throw new Error("Select at least one student.");
      const payloadQuestions = questions
        .filter((q) => q.question.trim())
        .map((q) => ({
          question: q.question.trim(),
          question_type: "single_mcq",
          options: q.options.split("\n").map((o) => o.trim()).filter(Boolean),
          correct_index: Number(q.correct_index) || 0,
          marks: Number(q.marks) || 1,
        }));
      if (!payloadQuestions.length) throw new Error("Add at least one question.");

      const res = await fetch("/api/lms/tests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          department_id: form.department_id,
          course_id: form.course_id || null,
          batch_id: form.batch_id || null,
          duration_minutes: Number(form.duration_minutes) || 30,
          tab_switch_policy: form.tab_switch_policy,
          camera_required: form.camera_required,
          security_mode: form.security_mode,
          questions: payloadQuestions,
          student_ids: studentIds,
          publish: form.publish,
        }),
      });
      const json = (await res.json()) as { error?: string; publish?: { recipient_count?: number } };
      if (!res.ok) throw new Error(json.error || "Save failed.");
      setSuccess(
        form.publish
          ? `Test published${json.publish?.recipient_count != null ? ` to ${json.publish.recipient_count} student(s)` : ""}.`
          : "Draft test saved.",
      );
      setForm((f) => ({ ...f, title: "", description: "" }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const openReview = async (testId: string) => {
    setReviewTestId(testId);
    setReviewLoading(true);
    setReview(null);
    setError(null);
    const res = await fetch(`/api/lms/tests/${testId}/proctoring`, { credentials: "include" });
    const json = (await res.json()) as ProctoringReview & { error?: string; hint?: string };
    setReviewLoading(false);
    if (!res.ok) {
      setError(json.error || "Could not load proctoring review.");
      if (json.hint) setHint(json.hint);
      return;
    }
    setReview(json);
  };

  const openMedia = async (media: ProctoringReview["media"][number]) => {
    const res = await fetch("/api/lms/storage/signed-url", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "proctoring_media",
        bucket: "test-proctoring",
        path: media.storage_path,
        media_id: media.id,
        fileName: `${media.capture_reason}.jpg`,
      }),
    });
    const json = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !json.url) {
      setError(json.error || "Could not open snapshot.");
      return;
    }
    window.open(json.url, "_blank", "noopener,noreferrer");
  };

  return (
    <section className="space-y-5">
      <PageHeader
        kicker="Learning management"
        title="Test Management"
        description="Create MCQ tests with server-side timers. Tab-switch policy is configurable (log/warn/auto-submit)."
        actions={<Button variant="outline" className="rounded-xl border-[#e8dcc8]" onClick={() => void load()}>Refresh</Button>}
      />
      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {hint ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{hint}</div> : null}
      {success ? <CrmFlash tone="success" message={success} onDismiss={() => setSuccess(null)} /> : null}

      <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-[#0f172a]">Create test</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">Title<input className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></label>
          <label className="text-sm">Department
            <select className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3" value={form.department_id} onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value, course_id: "", batch_id: "" }))}>
              <option value="">Select</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="text-sm">Duration (minutes)
            <input className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3" value={form.duration_minutes} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))} />
          </label>
          <label className="text-sm">Course
            <select className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3" value={form.course_id} disabled={!form.department_id} onChange={(e) => setForm((f) => ({ ...f, course_id: e.target.value, batch_id: "" }))}>
              <option value="">Optional</option>
              {coursesForDept.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-sm">Batch
            <select className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3" value={form.batch_id} disabled={!form.course_id} onChange={(e) => setForm((f) => ({ ...f, batch_id: e.target.value }))}>
              <option value="">Optional</option>
              {batchesForCourse.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="text-sm">Tab-switch policy
            <select className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3" value={form.tab_switch_policy} onChange={(e) => setForm((f) => ({ ...f, tab_switch_policy: e.target.value }))}>
              <option value="log_only">Log only</option>
              <option value="warn">Warn</option>
              <option value="auto_submit_after_count">Auto-submit after limit</option>
              <option value="immediate_auto_submit">Immediate auto-submit</option>
            </select>
          </label>
          <label className="text-sm">Security mode
            <select className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3" value={form.security_mode} onChange={(e) => setForm((f) => ({ ...f, security_mode: e.target.value }))}>
              <option value="normal">Normal browser</option>
              <option value="strict_browser">Strict browser</option>
              <option value="safe_exam_browser">Safe Exam Browser (soft check)</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm sm:mt-7">
            <input type="checkbox" checked={form.camera_required} onChange={(e) => setForm((f) => ({ ...f, camera_required: e.target.checked }))} />
            Require camera
          </label>
          <label className="flex items-center gap-2 text-sm sm:mt-7">
            <input type="checkbox" checked={form.publish} onChange={(e) => setForm((f) => ({ ...f, publish: e.target.checked }))} />
            Publish immediately
          </label>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-[#0f172a]">Questions</h3>
            <Button type="button" variant="outline" className="h-8 rounded-full text-xs" onClick={() => setQuestions((q) => [...q, { question: "", options: "Option A\nOption B\nOption C\nOption D", correct_index: "0", marks: "1" }])}>+ Question</Button>
          </div>
          {questions.map((q, idx) => (
            <div key={idx} className="rounded-xl border border-[#eef2f7] bg-[#f8fbff] p-3 text-sm">
              <label className="block">Question {idx + 1}
                <input className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3" value={q.question} onChange={(e) => setQuestions((all) => all.map((x, i) => (i === idx ? { ...x, question: e.target.value } : x)))} />
              </label>
              <label className="mt-2 block">Options (one per line)
                <textarea className="mt-1 min-h-[88px] w-full rounded-lg border border-[#dbe6f3] px-3 py-2" value={q.options} onChange={(e) => setQuestions((all) => all.map((x, i) => (i === idx ? { ...x, options: e.target.value } : x)))} />
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label>Correct option index (0-based)
                  <input className="mt-1 h-9 w-full rounded-lg border border-[#dbe6f3] px-3" value={q.correct_index} onChange={(e) => setQuestions((all) => all.map((x, i) => (i === idx ? { ...x, correct_index: e.target.value } : x)))} />
                </label>
                <label>Marks
                  <input className="mt-1 h-9 w-full rounded-lg border border-[#dbe6f3] px-3" value={q.marks} onChange={(e) => setQuestions((all) => all.map((x, i) => (i === idx ? { ...x, marks: e.target.value } : x)))} />
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-[#eef2f7] bg-[#f8fbff] p-4 text-sm">
          <p className="font-semibold">Audience ({eligible.length} eligible)</p>
          <div className="mt-2 flex gap-4">
            <label className="flex items-center gap-2"><input type="radio" checked={audienceMode === "all"} onChange={() => setAudienceMode("all")} /> All eligible</label>
            <label className="flex items-center gap-2"><input type="radio" checked={audienceMode === "selected"} onChange={() => setAudienceMode("selected")} /> Selected ({selectedStudents.size})</label>
          </div>
          {audienceMode === "selected" ? (
            <ul className="mt-2 max-h-40 overflow-y-auto">
              {eligible.map((s) => (
                <li key={s.student_id}>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={selectedStudents.has(s.student_id)} onChange={() => setSelectedStudents((prev) => { const n = new Set(prev); if (n.has(s.student_id)) n.delete(s.student_id); else n.add(s.student_id); return n; })} />
                    {s.full_name || s.email}
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="mt-4">
          <Button className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]" disabled={submitting || !form.title || !form.department_id} onClick={() => void submit()}>
            {submitting ? "Saving…" : form.publish ? "Publish test" : "Save draft"}
          </Button>
        </div>
      </div>

      <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-[#0f172a]">Tests</h2>
        {loading ? <p className="mt-4 text-sm text-[#64748b]">Loading…</p> : !tests.length ? (
          <p className="mt-4 rounded-xl border border-dashed border-[#e8dcc8] px-4 py-8 text-center text-sm text-[#64748b]">No tests yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {tests.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#eef2f7] bg-[#f8fbff] px-4 py-3 text-sm">
                <div>
                  <p className="font-semibold text-[#0f172a]">{t.title}</p>
                  <p className="text-xs text-[#64748b]">
                    {t.status} · {t.duration_minutes} min · tab: {t.tab_switch_policy}
                    {t.camera_required ? " · camera" : ""}
                    {t.security_mode ? ` · ${t.security_mode}` : ""}
                  </p>
                </div>
                <Button variant="outline" className="rounded-full border-[#e8dcc8] text-xs" onClick={() => void openReview(t.id)}>
                  Proctoring review
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {reviewTestId ? (
        <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-[#0f172a]">Proctoring review</h2>
            <Button variant="outline" className="rounded-full text-xs" onClick={() => { setReviewTestId(null); setReview(null); }}>
              Close
            </Button>
          </div>
          {reviewLoading ? (
            <p className="mt-4 text-sm text-[#64748b]">Loading…</p>
          ) : !review ? (
            <p className="mt-4 text-sm text-[#64748b]">No data.</p>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-3 text-sm">
              <div>
                <h3 className="font-semibold">Attempts ({review.attempts.length})</h3>
                <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                  {review.attempts.map((a) => (
                    <li key={a.id} className="rounded-lg border border-[#eef2f7] bg-[#f8fbff] px-3 py-2">
                      <p className="font-medium">{a.student_name || a.student_id.slice(0, 8)}</p>
                      <p className="text-xs text-[#64748b]">
                        {a.status}
                        {a.score != null ? ` · score ${a.score}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-semibold">Events ({review.events.length})</h3>
                <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                  {review.events.slice(0, 80).map((e) => (
                    <li key={e.id} className="rounded-lg border border-[#eef2f7] px-3 py-2 text-xs">
                      <p className="font-medium capitalize text-[#0f172a]">{e.event_type.replaceAll("_", " ")}</p>
                      <p className="text-[#64748b]">
                        {e.severity} · {new Date(e.created_at).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-semibold">Snapshots ({review.media.length})</h3>
                <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                  {review.media.map((m) => (
                    <li key={m.id} className="rounded-lg border border-[#eef2f7] px-3 py-2">
                      <p className="text-xs capitalize">{m.capture_reason.replaceAll("_", " ")}</p>
                      <p className="text-xs text-[#64748b]">{new Date(m.captured_at).toLocaleString()}</p>
                      <button type="button" className="mt-1 text-xs text-[#c9a227] underline" onClick={() => void openMedia(m)}>
                        Open snapshot
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
