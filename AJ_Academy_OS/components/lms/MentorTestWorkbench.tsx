"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";
import type { AcademicBatch, AcademicCourse, AcademicDepartment } from "@/types/lms";
import type { TestQuestionDraft, TestQuestionImportIssue } from "@/lib/lms/testQuestionImport";
import { downloadUrlInSameWindow } from "@/lib/browser/sameWindowDownload";
import {
  MentorLockedDepartmentField,
  useMentorDepartmentScope,
} from "@/components/lms/useMentorDepartmentScope";

type TestRow = {
  id: string;
  title: string;
  status: string;
  duration_minutes: number;
  tab_switch_policy: string;
  camera_required?: boolean;
  security_mode?: string;
  assigned_by?: string;
  assigned_by_name?: string | null;
  assigned_by_email?: string | null;
  department_id?: string;
  created_at?: string;
  updated_at?: string;
};
type EligibleStudent = { student_id: string; full_name: string | null; email: string | null };
type QDraft = TestQuestionDraft;

type ProctoringReview = {
  test?: {
    id: string;
    title: string;
    status: string;
    duration_minutes: number;
    passing_marks?: number | null;
    max_attempts?: number | null;
    department_id?: string | null;
    course_id?: string | null;
    batch_id?: string | null;
    updated_at?: string | null;
  };
  attempts: { id: string; student_id: string; student_name?: string; status: string; score: number | null; started_at?: string; server_started_at?: string }[];
  recipients?: { id: string; student_id: string; student_name?: string; status: string; attempts_used?: number | null; updated_at?: string }[];
  events: { id: string; attempt_id: string; event_type: string; severity: string; created_at: string }[];
  media: { id: string; attempt_id: string; storage_path: string; capture_reason: string; review_status: string; captured_at: string }[];
};

const emptyQuestion = (): QDraft => ({
  question: "",
  options: "Option A\nOption B\nOption C\nOption D",
  correct_index: "0",
  marks: "1",
});

type Props = { mode?: "mentor" | "admin" };

export function MentorTestWorkbench({ mode = "mentor" }: Props) {
  const isAdmin = mode === "admin";
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
  const [questions, setQuestions] = useState<QDraft[]>([emptyQuestion()]);
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

  const [importing, setImporting] = useState(false);
  const [importIssues, setImportIssues] = useState<TestQuestionImportIssue[]>([]);
  const [gformsUrl, setGformsUrl] = useState("");
  const [importMode, setImportMode] = useState<"replace" | "append">("replace");
  const fileRef = useRef<HTMLInputElement>(null);

  const coursesForDept = useMemo(
    () => courses.filter((c) => c.department_id === form.department_id),
    [courses, form.department_id],
  );
  const batchesForCourse = useMemo(
    () => batches.filter((b) => b.course_id === form.course_id),
    [batches, form.course_id],
  );
  const mentorScope = useMentorDepartmentScope(!isAdmin, departments);
  const selectableDepartments = isAdmin ? departments : mentorScope.departments;

  const deptName = useCallback(
    (id?: string) => departments.find((d) => d.id === id)?.name || "—",
    [departments],
  );

  useEffect(() => {
    if (isAdmin) return;
    if (!mentorScope.locked || !mentorScope.lockedDepartmentId) return;
    setForm((f) =>
      f.department_id === mentorScope.lockedDepartmentId
        ? f
        : { ...f, department_id: mentorScope.lockedDepartmentId, course_id: "", batch_id: "" },
    );
  }, [isAdmin, mentorScope.locked, mentorScope.lockedDepartmentId]);

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

  const applyImported = (incoming: QDraft[], issues: TestQuestionImportIssue[], needsReview: boolean) => {
    setImportIssues(issues);
    if (!incoming.length) {
      setError(issues.find((i) => i.severity === "error")?.message || "No questions detected.");
      return;
    }
    setQuestions((prev) => {
      if (importMode === "append") {
        const base = prev.filter((q) => q.question.trim());
        return [...base, ...incoming];
      }
      return incoming;
    });
    setSuccess(
      `Imported ${incoming.length} question(s)${needsReview ? " — review Correct answers before publish" : ""}.`,
    );
  };

  const runImportFile = async (file: File) => {
    setImporting(true);
    setError(null);
    setSuccess(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/lms/tests/import-parse", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const json = (await res.json()) as {
        questions?: QDraft[];
        issues?: TestQuestionImportIssue[];
        needsCorrectReview?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Import failed.");
      applyImported(json.questions ?? [], json.issues ?? [], Boolean(json.needsCorrectReview));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const runImportGforms = async () => {
    if (!gformsUrl.trim()) {
      setError("Paste a Google Forms public link (…/viewform).");
      return;
    }
    setImporting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/lms/tests/import-parse", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gforms_url: gformsUrl.trim() }),
      });
      const json = (await res.json()) as {
        questions?: QDraft[];
        issues?: TestQuestionImportIssue[];
        needsCorrectReview?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Google Forms import failed.");
      applyImported(json.questions ?? [], json.issues ?? [], Boolean(json.needsCorrectReview));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google Forms import failed.");
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = (format: "xlsx" | "csv") => {
    void downloadUrlInSameWindow(
      `/api/lms/tests/question-template?format=${format}`,
      `question-template.${format}`,
    ).catch((e) => setError(e instanceof Error ? e.message : "Download failed."));
  };

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
      setQuestions([emptyQuestion()]);
      setImportIssues([]);
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
    try {
      await downloadUrlInSameWindow(json.url, `${media.capture_reason}.jpg`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open snapshot.");
    }
  };

  const scoreRows = useMemo(() => {
    if (!review?.attempts?.length) return [];
    const byStudent = new Map<
      string,
      {
        studentId: string;
        studentName: string;
        attempts: number;
        submittedAttempts: number;
        bestScore: number | null;
        latestScore: number | null;
      }
    >();
    for (const attempt of review.attempts) {
      const key = attempt.student_id;
      const row = byStudent.get(key) ?? {
        studentId: key,
        studentName: attempt.student_name || key.slice(0, 8),
        attempts: 0,
        submittedAttempts: 0,
        bestScore: null,
        latestScore: null,
      };
      row.attempts += 1;
      if (attempt.status !== "in_progress") row.submittedAttempts += 1;
      if (attempt.score != null) {
        row.latestScore = row.latestScore == null ? attempt.score : row.latestScore;
        row.bestScore = row.bestScore == null ? attempt.score : Math.max(row.bestScore, attempt.score);
      }
      byStudent.set(key, row);
    }
    return [...byStudent.values()].sort((a, b) => {
      const aa = a.bestScore ?? -1;
      const bb = b.bestScore ?? -1;
      if (aa !== bb) return bb - aa;
      return a.studentName.localeCompare(b.studentName);
    });
  }, [review]);

  const avgScore = useMemo(() => {
    const scores = scoreRows.map((r) => r.bestScore).filter((s): s is number => s != null);
    if (!scores.length) return null;
    return Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 100) / 100;
  }, [scoreRows]);

  const recipientSummary = useMemo(() => {
    const recipients = review?.recipients ?? [];
    return {
      total: recipients.length,
      submitted: recipients.filter((r) => r.status === "submitted").length,
      started: recipients.filter((r) => r.status === "started").length,
      assigned: recipients.filter((r) => r.status === "assigned").length,
    };
  }, [review]);

  return (
    <section className="space-y-5">
      <PageHeader
        kicker={isAdmin ? "Academic management" : "Learning management"}
        title={isAdmin ? "Test Monitoring" : "Test Management"}
        description={
          isAdmin
            ? "Create tests and monitor every mentor-published test, audience, and proctoring activity."
            : "Create MCQ tests with server-side timers. Bulk-upload questions from Excel, CSV, PDF, or Google Forms."
        }
        actions={<Button variant="outline" className="rounded-xl border-[#e8dcc8]" onClick={() => void load()}>Refresh</Button>}
      />
      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {hint ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{hint}</div> : null}
      {success ? <CrmFlash tone="success" message={success} onDismiss={() => setSuccess(null)} /> : null}

      <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-[#0f172a]">Create test</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">Title<input className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></label>
          {isAdmin ? (
            <label className="text-sm">Department
              <select className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3" value={form.department_id} onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value, course_id: "", batch_id: "" }))}>
                <option value="">Select</option>
                {selectableDepartments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          ) : mentorScope.locked || selectableDepartments.length <= 1 ? (
            <MentorLockedDepartmentField
              name={
                mentorScope.lockedDepartmentName ||
                selectableDepartments[0]?.name ||
                mentorScope.lockedDepartmentName
              }
              loading={mentorScope.loading}
            />
          ) : (
            <label className="text-sm">Department
              <select
                className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3"
                value={form.department_id}
                onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value, course_id: "", batch_id: "" }))}
              >
                <option value="">Select</option>
                {selectableDepartments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-[#64748b]">Only departments allocated to you by admin.</span>
            </label>
          )}
          {!isAdmin && !mentorScope.loading && !selectableDepartments.length ? (
            <p className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              No department is assigned for your mentor account. Ask admin to set your department in User Master and/or Academic → Mentor Allocation.
            </p>
          ) : null}
          <label className="text-sm">Duration (minutes)
            <input className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3" value={form.duration_minutes} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))} />
          </label>
          <label className="text-sm">Course
            <select
              className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3"
              value={form.course_id}
              onChange={(e) => {
                if (!form.department_id) return;
                setForm((f) => ({ ...f, course_id: e.target.value, batch_id: "" }));
              }}
            >
              {!form.department_id ? (
                <option value="">Select a department first</option>
              ) : (
                <>
                  <option value="">{coursesForDept.length ? "Optional" : "No courses for this department"}</option>
                  {coursesForDept.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </>
              )}
            </select>
          </label>
          <label className="text-sm">Batch
            <select
              className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3"
              value={form.batch_id}
              onChange={(e) => {
                if (!form.course_id) return;
                setForm((f) => ({ ...f, batch_id: e.target.value }));
              }}
            >
              {!form.course_id ? (
                <option value="">Select a course first</option>
              ) : (
                <>
                  <option value="">{batchesForCourse.length ? "Optional" : "No batches for this course"}</option>
                  {batchesForCourse.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </>
              )}
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-[#0f172a]">Questions ({questions.filter((q) => q.question.trim()).length})</h3>
            <Button
              type="button"
              variant="outline"
              className="h-8 rounded-full text-xs"
              onClick={() => setQuestions((q) => [...q, emptyQuestion()])}
            >
              + Question
            </Button>
          </div>

          <div className="rounded-xl border border-[#e8dcc8] bg-[#fffdf7] p-4 text-sm">
            <p className="font-semibold text-[#0f172a]">Bulk upload</p>
            <p className="mt-1 text-xs text-[#64748b]">
              Import questions and answers only from Excel, CSV, PDF, or a public Google Forms link. Download the template first for best results.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-8 rounded-full border-[#e8dcc8] text-xs" onClick={() => downloadTemplate("xlsx")}>
                Download XL template
              </Button>
              <Button type="button" variant="outline" className="h-8 rounded-full border-[#e8dcc8] text-xs" onClick={() => downloadTemplate("csv")}>
                Download CSV template
              </Button>
              <Button
                type="button"
                className="h-8 rounded-full bg-[#c9a227] text-xs text-white hover:bg-[#b8921f]"
                disabled={importing}
                onClick={() => fileRef.current?.click()}
              >
                {importing ? "Importing…" : "Upload XL / CSV / PDF"}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,.pdf,.txt,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void runImportFile(f);
                }}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="min-w-[220px] flex-1 text-xs">
                Google Forms public link
                <input
                  className="mt-1 h-9 w-full rounded-lg border border-[#dbe6f3] px-3 text-sm"
                  placeholder="https://docs.google.com/forms/d/e/…/viewform"
                  value={gformsUrl}
                  onChange={(e) => setGformsUrl(e.target.value)}
                />
              </label>
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-full border-[#e8dcc8] text-xs"
                disabled={importing}
                onClick={() => void runImportGforms()}
              >
                Import from GForms
              </Button>
              <label className="flex items-center gap-2 text-xs sm:mb-2">
                <select
                  className="h-9 rounded-lg border border-[#dbe6f3] px-2"
                  value={importMode}
                  onChange={(e) => setImportMode(e.target.value as "replace" | "append")}
                >
                  <option value="replace">Replace questions</option>
                  <option value="append">Append questions</option>
                </select>
              </label>
            </div>
            {importIssues.length ? (
              <ul className="mt-3 max-h-28 space-y-1 overflow-y-auto text-xs text-[#92400e]">
                {importIssues.slice(0, 12).map((iss, i) => (
                  <li key={`${iss.rowNumber}-${i}`}>
                    {iss.severity === "error" ? "Error" : "Warning"}
                    {iss.rowNumber ? ` (row ${iss.rowNumber})` : ""}: {iss.message}
                  </li>
                ))}
                {importIssues.length > 12 ? <li>…and {importIssues.length - 12} more</li> : null}
              </ul>
            ) : null}
          </div>

          {questions.map((q, idx) => (
            <div key={idx} className="rounded-xl border border-[#eef2f7] bg-[#f8fbff] p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <label className="block flex-1">Question {idx + 1}
                  <input className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3" value={q.question} onChange={(e) => setQuestions((all) => all.map((x, i) => (i === idx ? { ...x, question: e.target.value } : x)))} />
                </label>
                {questions.length > 1 ? (
                  <button
                    type="button"
                    className="mt-6 text-xs text-red-600 underline"
                    onClick={() => setQuestions((all) => all.filter((_, i) => i !== idx))}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
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
          {!eligible.length && form.department_id ? (
            <p className="mt-1 text-xs text-amber-800">
              No eligible students yet. Assign mentees under Admin → Student Management → Mentor Allocation, and ensure this mentor’s User Master department matches the test department (or add Academic → Mentor Allocation). If the error persists, run{" "}
              <code className="rounded bg-amber-100 px-1">lms_mentor_scope_user_master_fix.sql</code> in Supabase.
            </p>
          ) : null}
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
        <h2 className="text-lg font-semibold text-[#0f172a]">Test Management sections</h2>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-[#eef2f7] bg-[#f8fbff] p-4">
            <h3 className="text-base font-semibold text-[#0f172a]">{isAdmin ? "All tests (mentors + admins)" : "Your tests"}</h3>
            {loading ? <p className="mt-3 text-sm text-[#64748b]">Loading…</p> : !tests.length ? (
              <p className="mt-3 rounded-xl border border-dashed border-[#e8dcc8] px-4 py-8 text-center text-sm text-[#64748b]">No tests yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {tests.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e2e8f0] bg-white px-3 py-3 text-sm">
                    <div>
                      <p className="font-semibold text-[#0f172a]">{t.title}</p>
                      <p className="text-xs text-[#64748b]">
                        {t.status} · {t.duration_minutes} min · tab: {t.tab_switch_policy}
                        {t.camera_required ? " · camera" : ""}
                        {t.security_mode ? ` · ${t.security_mode}` : ""}
                        {isAdmin ? ` · ${deptName(t.department_id)}` : ""}
                      </p>
                      {isAdmin ? (
                        <p className="mt-0.5 text-xs text-[#475569]">
                          By {t.assigned_by_name || t.assigned_by_email || "unknown mentor"}
                          {t.updated_at ? ` · updated ${new Date(t.updated_at).toLocaleString()}` : ""}
                        </p>
                      ) : null}
                    </div>
                    <Button variant="outline" className="rounded-full border-[#e8dcc8] text-xs" onClick={() => void openReview(t.id)}>
                      View scores
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-[#eef2f7] bg-[#f8fbff] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-[#0f172a]">Test insights</h3>
              {reviewTestId ? (
                <Button variant="outline" className="rounded-full text-xs" onClick={() => { setReviewTestId(null); setReview(null); }}>
                  Clear
                </Button>
              ) : null}
            </div>
            {!reviewTestId ? (
              <p className="mt-3 text-sm text-[#64748b]">
                Select any test from <strong>Your tests</strong> and click <strong>View scores</strong> to load this subsection.
              </p>
            ) : reviewLoading ? (
              <p className="mt-3 text-sm text-[#64748b]">Loading…</p>
            ) : !review ? (
              <p className="mt-3 text-sm text-[#64748b]">No data.</p>
            ) : (
              <div className="mt-3 space-y-4 text-sm">
                <div className="rounded-xl border border-[#e2e8f0] bg-white p-3">
                  <p className="mb-2 text-sm font-semibold text-[#0f172a]">Score section</p>
                  <p className="font-semibold text-[#0f172a]">{review.test?.title || "Test"}</p>
                  <p className="mt-1 text-xs text-[#64748b]">
                    {review.test?.status || "—"} · {review.test?.duration_minutes ?? "—"} min
                    {review.test?.passing_marks != null ? ` · pass ${review.test.passing_marks}` : ""}
                    {review.test?.max_attempts != null ? ` · max attempts ${review.test.max_attempts}` : ""}
                    {isAdmin ? ` · ${deptName(review.test?.department_id || undefined)}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-[#64748b]">
                    Students assigned: {recipientSummary.total} · Submitted: {recipientSummary.submitted} ·
                    Started: {recipientSummary.started} · Not started: {recipientSummary.assigned}
                  </p>
                  <p className="mt-1 text-xs text-[#64748b]">
                    Students attempted: {scoreRows.length} · Attempts logged: {review.attempts.length}
                    {avgScore != null ? ` · Avg best score ${avgScore}` : ""}
                  </p>
                  <p className="mt-1 text-[11px] text-[#64748b]">Test ID: {review.test?.id || "—"}</p>
                </div>

                <div>
                  <h4 className="font-semibold">Student scores ({scoreRows.length})</h4>
                  {!scoreRows.length ? (
                    <p className="mt-2 text-xs text-[#64748b]">No attempt scores yet for this test.</p>
                  ) : (
                    <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto">
                      {scoreRows.map((row) => (
                        <li key={row.studentId} className="rounded-lg border border-[#e2e8f0] bg-white px-3 py-2">
                          <p className="font-medium">{row.studentName}</p>
                          <p className="text-xs text-[#64748b]">
                            Best: {row.bestScore != null ? row.bestScore : "—"} · Latest:{" "}
                            {row.latestScore != null ? row.latestScore : "—"} · Submitted attempts:{" "}
                            {row.submittedAttempts}/{row.attempts}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h4 className="font-semibold">Submission status ({review.recipients?.length ?? 0})</h4>
                  {!review.recipients?.length ? (
                    <p className="mt-2 text-xs text-[#64748b]">No recipients found for this test.</p>
                  ) : (
                    <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto">
                      {review.recipients.map((r) => (
                        <li key={r.id} className="rounded-lg border border-[#e2e8f0] bg-white px-3 py-2">
                          <p className="font-medium">{r.student_name || r.student_id.slice(0, 8)}</p>
                          <p className="text-xs text-[#64748b]">
                            {r.status} · attempts used {r.attempts_used ?? 0}
                            {r.updated_at ? ` · ${new Date(r.updated_at).toLocaleString()}` : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold text-[#0f172a]">Proctoring section</p>
                  <div className="grid gap-4 lg:grid-cols-3">
                    <div>
                      <h4 className="font-semibold">Attempts ({review.attempts.length})</h4>
                      <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                        {review.attempts.map((a) => (
                          <li key={a.id} className="rounded-lg border border-[#e2e8f0] bg-white px-3 py-2">
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
                      <h4 className="font-semibold">Events ({review.events.length})</h4>
                      <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                        {review.events.slice(0, 80).map((e) => (
                          <li key={e.id} className="rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-xs">
                            <p className="font-medium capitalize text-[#0f172a]">{e.event_type.replaceAll("_", " ")}</p>
                            <p className="text-[#64748b]">
                              {e.severity} · {new Date(e.created_at).toLocaleString()}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-semibold">Snapshots ({review.media.length})</h4>
                      <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                        {review.media.map((m) => (
                          <li key={m.id} className="rounded-lg border border-[#e2e8f0] bg-white px-3 py-2">
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
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
