"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";
import type { AcademicBatch, AcademicCourse, AcademicDepartment } from "@/types/lms";

type ProjectRow = {
  id: string;
  title: string;
  status: string;
  department_id: string;
  final_deadline: string | null;
  total_marks: number;
  team_mode: string;
};

type EligibleStudent = { student_id: string; full_name: string | null; email: string | null };

export function MentorProjectWorkbench() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [departments, setDepartments] = useState<AcademicDepartment[]>([]);
  const [courses, setCourses] = useState<AcademicCourse[]>([]);
  const [batches, setBatches] = useState<AcademicBatch[]>([]);
  const [eligible, setEligible] = useState<EligibleStudent[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [audienceMode, setAudienceMode] = useState<"all" | "selected">("all");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    problem_statement: "",
    description: "",
    department_id: "",
    course_id: "",
    batch_id: "",
    team_mode: "individual",
    final_deadline: "",
    total_marks: "100",
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
      const [projRes, deptRes, courseRes, batchRes] = await Promise.all([
        fetch("/api/lms/projects", { credentials: "include" }),
        supabase.from("academic_departments").select("*").eq("status", "active").order("name"),
        supabase.from("academic_courses").select("*").eq("status", "active").order("name"),
        supabase.from("academic_batches").select("*").eq("status", "active").order("name"),
      ]);
      const projJson = (await projRes.json()) as { projects?: ProjectRow[]; error?: string; hint?: string };
      if (!projRes.ok) {
        setError(projJson.error || "Could not load projects.");
        setHint(projJson.hint || null);
        return;
      }
      setProjects(projJson.projects ?? []);
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
      if (audienceMode === "selected" && !studentIds?.length) {
        throw new Error("Select at least one student.");
      }
      const res = await fetch("/api/lms/projects", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          course_id: form.course_id || null,
          batch_id: form.batch_id || null,
          final_deadline: form.final_deadline || null,
          total_marks: Number(form.total_marks) || 100,
          student_ids: studentIds,
          seed_milestones: true,
        }),
      });
      const json = (await res.json()) as { error?: string; publish?: { recipient_count?: number } };
      if (!res.ok) throw new Error(json.error || "Save failed.");
      setSuccess(
        form.publish
          ? `Project published${json.publish?.recipient_count != null ? ` to ${json.publish.recipient_count} student(s)` : ""}. Default milestones seeded.`
          : "Draft project saved with milestones.",
      );
      setForm((f) => ({ ...f, title: "", problem_statement: "", description: "" }));
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
        title="Project Management"
        description="Academic projects with milestone templates. Separate from ops Project Master. Recipients are snapshotted at publish."
        actions={
          <Button variant="outline" className="rounded-xl border-[#e8dcc8]" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />
      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {hint ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{hint}</div> : null}
      {success ? <CrmFlash tone="success" message={success} onDismiss={() => setSuccess(null)} /> : null}

      <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-[#0f172a]">Create project</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            Title
            <input className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </label>
          <label className="text-sm sm:col-span-2">
            Problem statement
            <textarea className="mt-1 min-h-[72px] w-full rounded-lg border border-[#dbe6f3] px-3 py-2" value={form.problem_statement} onChange={(e) => setForm((f) => ({ ...f, problem_statement: e.target.value }))} />
          </label>
          <label className="text-sm">
            Department
            <select className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3" value={form.department_id} onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value, course_id: "", batch_id: "" }))}>
              <option value="">Select</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Course
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
          <label className="text-sm">
            Batch
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
          <label className="text-sm">
            Team mode
            <select className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3" value={form.team_mode} onChange={(e) => setForm((f) => ({ ...f, team_mode: e.target.value }))}>
              <option value="individual">Individual</option>
              <option value="mentor_team">Mentor-created team</option>
              <option value="student_team">Student-proposed team</option>
              <option value="batch">Entire batch</option>
            </select>
          </label>
          <label className="text-sm">
            Final deadline
            <input type="date" className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3" value={form.final_deadline} onChange={(e) => setForm((f) => ({ ...f, final_deadline: e.target.value }))} />
          </label>
          <label className="flex items-center gap-2 text-sm sm:mt-7">
            <input type="checkbox" checked={form.publish} onChange={(e) => setForm((f) => ({ ...f, publish: e.target.checked }))} />
            Publish immediately
          </label>
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
                    <input
                      type="checkbox"
                      checked={selectedStudents.has(s.student_id)}
                      onChange={() =>
                        setSelectedStudents((prev) => {
                          const n = new Set(prev);
                          if (n.has(s.student_id)) n.delete(s.student_id);
                          else n.add(s.student_id);
                          return n;
                        })
                      }
                    />
                    {s.full_name || s.email}
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="mt-4">
          <Button className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]" disabled={submitting || !form.title || !form.department_id} onClick={() => void submit()}>
            {submitting ? "Saving…" : form.publish ? "Publish project" : "Save draft"}
          </Button>
        </div>
      </div>

      <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-[#0f172a]">Projects</h2>
        {loading ? (
          <p className="mt-4 text-sm text-[#64748b]">Loading…</p>
        ) : !projects.length ? (
          <p className="mt-4 rounded-xl border border-dashed border-[#e8dcc8] px-4 py-8 text-center text-sm text-[#64748b]">No academic projects yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {projects.map((p) => (
              <li key={p.id} className="rounded-xl border border-[#eef2f7] bg-[#f8fbff] px-4 py-3 text-sm">
                <p className="font-semibold text-[#0f172a]">{p.title}</p>
                <p className="text-xs text-[#64748b]">
                  {p.status} · {p.team_mode}
                  {p.final_deadline ? ` · due ${p.final_deadline}` : ""} · {p.total_marks} marks
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
