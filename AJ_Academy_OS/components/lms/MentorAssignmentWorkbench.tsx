"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";
import type { AcademicCourse, AcademicDepartment, AcademicBatch } from "@/types/lms";
import {
  MentorLockedDepartmentField,
  useMentorDepartmentScope,
} from "@/components/lms/useMentorDepartmentScope";

type AssignmentRow = {
  id: string;
  title: string;
  status: string;
  department_id: string;
  course_id: string | null;
  batch_id: string | null;
  due_at: string | null;
  total_marks: number;
  audience_type: string;
  updated_at: string;
};

type EligibleStudent = {
  student_id: string;
  full_name: string | null;
  email: string | null;
};

export function MentorAssignmentWorkbench() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [departments, setDepartments] = useState<AcademicDepartment[]>([]);
  const [courses, setCourses] = useState<AcademicCourse[]>([]);
  const [batches, setBatches] = useState<AcademicBatch[]>([]);
  const [eligible, setEligible] = useState<EligibleStudent[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [audienceMode, setAudienceMode] = useState<"all" | "selected">("all");
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    title: "",
    description: "",
    instructions: "",
    department_id: "",
    course_id: "",
    batch_id: "",
    due_at: "",
    total_marks: "100",
    passing_marks: "40",
    allow_late: false,
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

  const mentorScope = useMentorDepartmentScope(true, departments);
  const visibleDepartments = mentorScope.departments;

  useEffect(() => {
    if (!mentorScope.locked || !mentorScope.lockedDepartmentId) return;
    setForm((f) =>
      f.department_id === mentorScope.lockedDepartmentId
        ? f
        : { ...f, department_id: mentorScope.lockedDepartmentId, course_id: "", batch_id: "" },
    );
  }, [mentorScope.locked, mentorScope.lockedDepartmentId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const supabase = createClient();

      const [assignRes, deptRes, courseRes, batchRes] = await Promise.all([
        fetch("/api/lms/assignments", { credentials: "include" }),
        supabase.from("academic_departments").select("*").eq("status", "active").order("name"),
        supabase.from("academic_courses").select("*").eq("status", "active").order("name"),
        supabase.from("academic_batches").select("*").eq("status", "active").order("name"),
      ]);

      const assignJson = (await assignRes.json()) as {
        assignments?: AssignmentRow[];
        error?: string;
        hint?: string;
      };
      if (!assignRes.ok) {
        setError(assignJson.error || "Could not load assignments.");
        setHint(assignJson.hint || null);
        return;
      }

      if (deptRes.error || courseRes.error || batchRes.error) {
        setError(deptRes.error?.message || courseRes.error?.message || batchRes.error?.message || "Academic load failed.");
        setHint("Run lms_academic_foundation.sql and seed from Admin → Mentor Allocation.");
        return;
      }

      setAssignments(assignJson.assignments ?? []);
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

  const loadEligible = useCallback(async () => {
    if (!form.department_id) {
      setEligible([]);
      return;
    }
    const params = new URLSearchParams({ department_id: form.department_id });
    if (form.course_id) params.set("course_id", form.course_id);
    if (form.batch_id) params.set("batch_id", form.batch_id);
    const res = await fetch(`/api/lms/eligible-students?${params}`, { credentials: "include" });
    const json = (await res.json()) as { students?: EligibleStudent[]; error?: string };
    if (!res.ok) {
      setError(json.error || "Could not load eligible students.");
      return;
    }
    setEligible(json.students ?? []);
    setSelectedStudents(new Set());
  }, [form.department_id, form.course_id, form.batch_id]);

  useEffect(() => {
    void loadEligible();
  }, [loadEligible]);

  const toggleStudent = (id: string) => {
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const studentIds =
        audienceMode === "selected" ? [...selectedStudents] : undefined;
      if (audienceMode === "selected" && !studentIds?.length) {
        throw new Error("Select at least one student, or choose All eligible students.");
      }
      const res = await fetch("/api/lms/assignments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          instructions: form.instructions,
          department_id: form.department_id,
          course_id: form.course_id || null,
          batch_id: form.batch_id || null,
          due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
          total_marks: Number(form.total_marks) || 100,
          passing_marks: Number(form.passing_marks) || 40,
          allow_late: form.allow_late,
          audience_type: audienceMode === "selected" ? "selected_students" : "department",
          student_ids: studentIds,
          publish: form.publish,
        }),
      });
      const json = (await res.json()) as { error?: string; publish?: { recipient_count?: number } };
      if (!res.ok) throw new Error(json.error || "Could not save assignment.");
      const count = json.publish?.recipient_count;
      setSuccess(
        form.publish
          ? `Assignment published${count != null ? ` to ${count} student(s)` : ""}.`
          : "Draft assignment saved.",
      );
      setForm((f) => ({ ...f, title: "", description: "", instructions: "" }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const publishExisting = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/lms/assignments/${id}/publish`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as { error?: string; result?: { recipient_count?: number } };
      if (!res.ok) throw new Error(json.error || "Publish failed.");
      setSuccess(`Published to ${json.result?.recipient_count ?? "?"} recipient(s).`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed.");
    }
  };

  return (
    <section className="space-y-5">
      <PageHeader
        kicker="Learning management"
        title="Assignment Management"
        description="Create assignments for students in your allocated departments. Recipients are snapshotted at publish time from real enrolments."
        actions={
          <Button variant="outline" className="rounded-xl border-[#e8dcc8]" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />

      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {hint ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{hint}</div>
      ) : null}
      {success ? <CrmFlash tone="success" message={success} onDismiss={() => setSuccess(null)} /> : null}

      <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-[#0f172a]">Create assignment</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-[#334155] sm:col-span-2">
            Title
            <input
              className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </label>
          <label className="text-sm text-[#334155] sm:col-span-2">
            Description
            <textarea
              className="mt-1 min-h-[72px] w-full rounded-lg border border-[#dbe6f3] px-3 py-2"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          {mentorScope.locked || visibleDepartments.length <= 1 ? (
            <MentorLockedDepartmentField
              name={mentorScope.lockedDepartmentName || visibleDepartments[0]?.name || ""}
              loading={mentorScope.loading}
            />
          ) : (
            <label className="text-sm text-[#334155]">
              Department
              <select
                className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3"
                value={form.department_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, department_id: e.target.value, course_id: "", batch_id: "" }))
                }
              >
                <option value="">Select</option>
                {visibleDepartments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-[#64748b]">Only departments allocated to you by admin.</span>
            </label>
          )}
          {!mentorScope.loading && !visibleDepartments.length ? (
            <p className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              No department is assigned for your mentor account. Ask admin to set your department in User Master and/or Academic → Mentor Allocation.
            </p>
          ) : null}
          <label className="text-sm text-[#334155]">
            Course (optional)
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
                  <option value="">
                    {coursesForDept.length ? "All courses in scope" : "No courses — ask admin (Academic Catalog)"}
                  </option>
                  {coursesForDept.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </>
              )}
            </select>
          </label>
          <label className="text-sm text-[#334155]">
            Batch (optional)
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
                  <option value="">
                    {batchesForCourse.length ? "All batches" : "No batches — ask admin (Academic Catalog)"}
                  </option>
                  {batchesForCourse.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </>
              )}
            </select>
          </label>
          <label className="text-sm text-[#334155]">
            Due date/time
            <input
              type="datetime-local"
              className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3"
              value={form.due_at}
              onChange={(e) => setForm((f) => ({ ...f, due_at: e.target.value }))}
            />
          </label>
          <label className="text-sm text-[#334155]">
            Total marks
            <input
              className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3"
              value={form.total_marks}
              onChange={(e) => setForm((f) => ({ ...f, total_marks: e.target.value }))}
            />
          </label>
          <label className="text-sm text-[#334155]">
            Passing marks
            <input
              className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3"
              value={form.passing_marks}
              onChange={(e) => setForm((f) => ({ ...f, passing_marks: e.target.value }))}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-[#334155] sm:mt-7">
            <input
              type="checkbox"
              checked={form.allow_late}
              onChange={(e) => setForm((f) => ({ ...f, allow_late: e.target.checked }))}
            />
            Allow late submission
          </label>
          <label className="flex items-center gap-2 text-sm text-[#334155] sm:mt-7">
            <input
              type="checkbox"
              checked={form.publish}
              onChange={(e) => setForm((f) => ({ ...f, publish: e.target.checked }))}
            />
            Publish immediately (create recipient records)
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-[#eef2f7] bg-[#f8fbff] p-4">
          <p className="text-sm font-semibold text-[#0f172a]">Audience</p>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={audienceMode === "all"}
                onChange={() => setAudienceMode("all")}
              />
              All eligible enrolled students ({eligible.length})
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={audienceMode === "selected"}
                onChange={() => setAudienceMode("selected")}
              />
              Selected students ({selectedStudents.size})
            </label>
          </div>
          {audienceMode === "selected" ? (
            <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm">
              {!eligible.length ? (
                <li className="text-[#64748b]">No eligible students in this scope. Seed enrolments first.</li>
              ) : (
                eligible.map((s) => (
                  <li key={s.student_id}>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedStudents.has(s.student_id)}
                        onChange={() => toggleStudent(s.student_id)}
                      />
                      {s.full_name || s.email || s.student_id.slice(0, 8)}
                    </label>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>

        <div className="mt-4">
          <Button
            className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]"
            disabled={submitting || !form.title || !form.department_id}
            onClick={() => void submit()}
          >
            {submitting ? "Saving…" : form.publish ? "Publish assignment" : "Save draft"}
          </Button>
        </div>
      </div>

      <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-[#0f172a]">Your assignments</h2>
        {loading ? (
          <p className="mt-4 text-sm text-[#64748b]">Loading…</p>
        ) : !assignments.length ? (
          <p className="mt-4 rounded-xl border border-dashed border-[#e8dcc8] px-4 py-8 text-center text-sm text-[#64748b]">
            No assignments yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {assignments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#eef2f7] bg-[#f8fbff] px-4 py-3 text-sm">
                <div>
                  <p className="font-semibold text-[#0f172a]">{a.title}</p>
                  <p className="text-xs text-[#64748b]">
                    {a.status}
                    {a.due_at ? ` · due ${new Date(a.due_at).toLocaleString()}` : ""}
                    {` · ${a.total_marks} marks`}
                  </p>
                </div>
                {a.status === "draft" || a.status === "scheduled" ? (
                  <Button
                    variant="outline"
                    className="h-8 rounded-full px-3 text-xs"
                    onClick={() => void publishExisting(a.id)}
                  >
                    Publish
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
