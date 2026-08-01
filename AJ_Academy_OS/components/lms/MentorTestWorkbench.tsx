"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";
import type { AcademicBatch, AcademicCourse, AcademicDepartment } from "@/types/lms";

type TestRow = { id: string; title: string; status: string; duration_minutes: number; tab_switch_policy: string };
type EligibleStudent = { student_id: string; full_name: string | null; email: string | null };
type QDraft = { question: string; options: string; correct_index: string; marks: string };

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
    publish: true,
  });

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
              <li key={t.id} className="rounded-xl border border-[#eef2f7] bg-[#f8fbff] px-4 py-3 text-sm">
                <p className="font-semibold text-[#0f172a]">{t.title}</p>
                <p className="text-xs text-[#64748b]">{t.status} · {t.duration_minutes} min · tab policy: {t.tab_switch_policy}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
