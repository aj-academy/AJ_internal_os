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
  attempts: {
    id: string;
    student_id: string;
    student_name?: string;
    status: string;
    score: number | null;
    max_score?: number | null;
    submitted_at?: string | null;
    server_started_at?: string;
  }[];
  recipients?: {
    id: string;
    student_id: string;
    student_name?: string;
    status: string;
    attempts_used?: number | null;
    updated_at?: string;
    latest_score?: number | null;
    latest_max_score?: number | null;
    latest_attempt_status?: string | null;
    latest_submitted_at?: string | null;
  }[];
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
  const [testSection, setTestSection] = useState<"create" | "insights">("create");
  const [snapshotViewer, setSnapshotViewer] = useState<{
    url: string;
    title: string;
    studentName: string;
    capturedAt: string;
  } | null>(null);
  const [snapshotLoadingId, setSnapshotLoadingId] = useState<string | null>(null);

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

  const openMedia = async (
    media: ProctoringReview["media"][number],
    studentName: string,
  ) => {
    setError(null);
    setSnapshotLoadingId(media.id);
    try {
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
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string; hint?: string };
      if (!res.ok || !json.url) {
        setError(json.error || "Could not open snapshot.");
        if (json.hint) setHint(json.hint);
        return;
      }
      setSnapshotViewer({
        url: json.url,
        title: media.capture_reason.replaceAll("_", " "),
        studentName,
        capturedAt: media.captured_at,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open snapshot.");
    } finally {
      setSnapshotLoadingId(null);
    }
  };

  const closeReview = () => {
    setReviewTestId(null);
    setReview(null);
    setSnapshotViewer(null);
    setSnapshotLoadingId(null);
  };

  const mediaByStudentId = useMemo(() => {
    const map = new Map<string, ProctoringReview["media"]>();
    if (!review) return map;
    const attemptStudent = new Map((review.attempts ?? []).map((a) => [a.id, a.student_id]));
    for (const m of review.media ?? []) {
      const studentId = attemptStudent.get(m.attempt_id);
      if (!studentId) continue;
      const list = map.get(studentId) ?? [];
      list.push(m);
      map.set(studentId, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());
    }
    return map;
  }, [review]);

  const eventsByStudentId = useMemo(() => {
    const map = new Map<string, number>();
    if (!review) return map;
    const attemptStudent = new Map((review.attempts ?? []).map((a) => [a.id, a.student_id]));
    for (const e of review.events ?? []) {
      const studentId = attemptStudent.get(e.attempt_id);
      if (!studentId) continue;
      map.set(studentId, (map.get(studentId) ?? 0) + 1);
    }
    return map;
  }, [review]);

  const scoreRows = useMemo(() => {
    if (!review) return [];

    const byStudent = new Map<
      string,
      {
        studentId: string;
        studentName: string;
        status: string;
        attemptsUsed: number;
        score: number | null;
        maxScore: number | null;
        submittedAt: string | null;
      }
    >();

    for (const r of review.recipients ?? []) {
      byStudent.set(r.student_id, {
        studentId: r.student_id,
        studentName: r.student_name || r.student_id.slice(0, 8),
        status: r.status,
        attemptsUsed: r.attempts_used ?? 0,
        score: r.latest_score ?? null,
        maxScore: r.latest_max_score ?? null,
        submittedAt: r.latest_submitted_at ?? r.updated_at ?? null,
      });
    }

    for (const attempt of review.attempts ?? []) {
      const existing = byStudent.get(attempt.student_id);
      const score = attempt.score != null ? Number(attempt.score) : null;
      const maxScore = attempt.max_score != null ? Number(attempt.max_score) : null;
      if (!existing) {
        byStudent.set(attempt.student_id, {
          studentId: attempt.student_id,
          studentName: attempt.student_name || attempt.student_id.slice(0, 8),
          status: attempt.status,
          attemptsUsed: 1,
          score,
          maxScore,
          submittedAt: attempt.submitted_at ?? null,
        });
        continue;
      }
      if (existing.score == null && score != null) existing.score = score;
      if (existing.maxScore == null && maxScore != null) existing.maxScore = maxScore;
      if (!existing.submittedAt && attempt.submitted_at) existing.submittedAt = attempt.submitted_at;
      if (existing.attemptsUsed < 1) existing.attemptsUsed = 1;
    }

    return [...byStudent.values()].sort((a, b) => {
      const aa = a.score ?? -1;
      const bb = b.score ?? -1;
      if (aa !== bb) return bb - aa;
      return a.studentName.localeCompare(b.studentName);
    });
  }, [review]);

  const avgScore = useMemo(() => {
    const scores = scoreRows.map((r) => r.score).filter((s): s is number => s != null);
    if (!scores.length) return null;
    return Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 100) / 100;
  }, [scoreRows]);

  const recipientSummary = useMemo(() => {
    const rows = scoreRows;
    const submitted = rows.filter((r) => r.status === "submitted" || r.score != null).length;
    const started = rows.filter((r) => r.status === "started").length;
    const notStarted = rows.filter((r) => r.status === "assigned").length;
    return {
      total: rows.length,
      submitted,
      started,
      notStarted,
    };
  }, [scoreRows]);

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

      <div className="rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-1">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={`rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap ${
              testSection === "create" ? "bg-[#2563eb] text-white" : "text-[#334155] hover:bg-white"
            }`}
            onClick={() => setTestSection("create")}
          >
            Create test
          </button>
          <button
            type="button"
            className={`rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap ${
              testSection === "insights" ? "bg-[#2563eb] text-white" : "text-[#334155] hover:bg-white"
            }`}
            onClick={() => setTestSection("insights")}
          >
            Test insights
          </button>
        </div>
      </div>

      {testSection === "create" ? (
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
      ) : (
      <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-[#0f172a]">Test insights</h2>
        <p className="mt-1 text-sm text-[#64748b]">
          Your published and draft tests are listed below. Open any row to view student scores and submission status.
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-[#64748b]">Loading…</p>
        ) : !tests.length ? (
          <p className="mt-4 rounded-xl border border-dashed border-[#e8dcc8] px-4 py-8 text-center text-sm text-[#64748b]">
            No tests yet. Create a test in the Create test section first.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {tests.map((t) => (
              <li key={t.id} className="rounded-xl border border-[#e2e8f0] bg-[#f8fbff] overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div>
                    <p className="font-semibold text-[#0f172a]">{t.title}</p>
                    <p className="text-xs text-[#64748b]">
                      {t.status}
                      {t.created_at ? ` · ${new Date(t.created_at).toLocaleString()}` : ""}
                      {t.duration_minutes ? ` · ${t.duration_minutes} min` : ""}
                      {isAdmin ? ` · ${deptName(t.department_id)}` : ""}
                    </p>
                    {isAdmin ? (
                      <p className="mt-0.5 text-xs text-[#475569]">
                        By {t.assigned_by_name || t.assigned_by_email || "unknown mentor"}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    variant="outline"
                    className="rounded-full border-[#e8dcc8] text-xs"
                    onClick={() => void openReview(t.id)}
                  >
                    View scores
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      )}

      {reviewTestId ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-2 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="test-scores-title"
        >
          <button
            type="button"
            aria-label="Close scores"
            className="absolute inset-0 cursor-default"
            onClick={closeReview}
          />
          <div className="relative flex h-[96vh] max-h-[96vh] w-[98vw] max-w-[1400px] flex-col overflow-hidden rounded-2xl border border-[#e8dcc8] bg-white shadow-[0_24px_60px_rgba(61,52,40,0.22)]">
            <div className="flex items-start justify-between gap-3 border-b border-[#e8dcc8] bg-[#fffdf8] px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#a68b2e]">Test insights</p>
                <h3 id="test-scores-title" className="text-lg font-semibold text-[#0f172a]">
                  {tests.find((t) => t.id === reviewTestId)?.title || "Student scores"}
                </h3>
                <p className="mt-0.5 text-xs text-[#64748b]">
                  Stats, scores, and proctoring snapshots for each assigned student
                </p>
              </div>
              <Button variant="outline" className="rounded-full border-[#e8dcc8] text-xs" onClick={closeReview}>
                Close
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm">
              {reviewLoading ? (
                <p className="py-8 text-center text-[#64748b]">Loading scores…</p>
              ) : !review ? (
                <p className="py-8 text-center text-[#64748b]">No data.</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="rounded-xl border border-[#eef2f7] bg-[#f8fbff] px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-[#64748b]">Should attempt</p>
                      <p className="mt-1 text-lg font-semibold text-[#0f172a]">{recipientSummary.total}</p>
                    </div>
                    <div className="rounded-xl border border-[#eef2f7] bg-[#f8fbff] px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-[#64748b]">Submitted</p>
                      <p className="mt-1 text-lg font-semibold text-[#0f172a]">{recipientSummary.submitted}</p>
                    </div>
                    <div className="rounded-xl border border-[#eef2f7] bg-[#f8fbff] px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-[#64748b]">In progress</p>
                      <p className="mt-1 text-lg font-semibold text-[#0f172a]">{recipientSummary.started}</p>
                    </div>
                    <div className="rounded-xl border border-[#eef2f7] bg-[#f8fbff] px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-[#64748b]">Not started</p>
                      <p className="mt-1 text-lg font-semibold text-[#0f172a]">{recipientSummary.notStarted}</p>
                    </div>
                    <div className="rounded-xl border border-[#eef2f7] bg-[#f8fbff] px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-[#64748b]">Avg score</p>
                      <p className="mt-1 text-lg font-semibold text-[#0f172a]">
                        {avgScore != null ? avgScore : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-[#f8fbff] text-xs uppercase tracking-wide text-[#64748b]">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Student name</th>
                          <th className="px-3 py-2 font-semibold">Score</th>
                          <th className="px-3 py-2 font-semibold">Status</th>
                          <th className="px-3 py-2 font-semibold">Attempts</th>
                          <th className="px-3 py-2 font-semibold">Submitted at</th>
                          <th className="px-3 py-2 font-semibold">Snapshots</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!scoreRows.length ? (
                          <tr>
                            <td colSpan={6} className="px-3 py-4 text-center text-[#64748b]">
                              No students assigned to this test yet.
                            </td>
                          </tr>
                        ) : (
                          scoreRows.map((row) => {
                            const snapshots = mediaByStudentId.get(row.studentId) ?? [];
                            const eventCount = eventsByStudentId.get(row.studentId) ?? 0;
                            return (
                              <tr key={row.studentId} className="border-t border-[#eef2f7] align-top">
                                <td className="px-3 py-3 font-medium text-[#0f172a]">{row.studentName}</td>
                                <td className="px-3 py-3 text-[#0f172a]">
                                  {row.score != null
                                    ? `${row.score}${row.maxScore != null ? ` / ${row.maxScore}` : ""}`
                                    : "—"}
                                </td>
                                <td className="px-3 py-3 capitalize text-[#475569]">{row.status}</td>
                                <td className="px-3 py-3 text-[#475569]">{row.attemptsUsed}</td>
                                <td className="px-3 py-3 text-[#475569]">
                                  {row.submittedAt ? new Date(row.submittedAt).toLocaleString() : "—"}
                                </td>
                                <td className="px-3 py-3">
                                  {!snapshots.length ? (
                                    <span className="text-[#94a3b8]">No snapshots</span>
                                  ) : (
                                    <div className="space-y-1.5">
                                      <p className="text-[11px] text-[#64748b]">
                                        {snapshots.length} photo{snapshots.length === 1 ? "" : "s"}
                                        {eventCount > 0 ? ` · ${eventCount} event${eventCount === 1 ? "" : "s"}` : ""}
                                      </p>
                                      <div className="flex flex-col gap-1">
                                        {snapshots.map((m, idx) => (
                                          <button
                                            key={m.id}
                                            type="button"
                                            disabled={snapshotLoadingId === m.id}
                                            className="text-left text-xs font-medium text-[#a68b2e] underline underline-offset-2 disabled:opacity-60"
                                            onClick={() => void openMedia(m, row.studentName)}
                                          >
                                            {snapshotLoadingId === m.id
                                              ? "Opening…"
                                              : `${m.capture_reason.replaceAll("_", " ")} ${idx + 1}`}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {snapshotViewer ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/70 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Proctoring snapshot"
        >
          <button
            type="button"
            aria-label="Close snapshot"
            className="absolute inset-0 cursor-default"
            onClick={() => setSnapshotViewer(null)}
          />
          <div className="relative flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#e8dcc8] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[#e8dcc8] bg-[#fffdf8] px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#a68b2e]">Proctoring snapshot</p>
                <h4 className="text-base font-semibold capitalize text-[#0f172a]">{snapshotViewer.title}</h4>
                <p className="text-xs text-[#64748b]">
                  {snapshotViewer.studentName}
                  {snapshotViewer.capturedAt
                    ? ` · ${new Date(snapshotViewer.capturedAt).toLocaleString()}`
                    : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="rounded-full border-[#e8dcc8] text-xs"
                onClick={() => setSnapshotViewer(null)}
              >
                Close
              </Button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[#0f172a] p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={snapshotViewer.url}
                alt={`${snapshotViewer.title} for ${snapshotViewer.studentName}`}
                className="max-h-[78vh] max-w-full rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
