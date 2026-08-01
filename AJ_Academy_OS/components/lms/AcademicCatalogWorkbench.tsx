"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";
import type {
  AcademicBatch,
  AcademicCourse,
  AcademicDepartment,
  AcademicModule,
} from "@/types/lms";

export function AcademicCatalogWorkbench() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [departments, setDepartments] = useState<AcademicDepartment[]>([]);
  const [courses, setCourses] = useState<AcademicCourse[]>([]);
  const [batches, setBatches] = useState<AcademicBatch[]>([]);
  const [modules, setModules] = useState<AcademicModule[]>([]);

  const [departmentId, setDepartmentId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [courseName, setCourseName] = useState("");
  const [batchName, setBatchName] = useState("");
  const [batchYear, setBatchYear] = useState("");
  const [moduleName, setModuleName] = useState("");
  const [deptName, setDeptName] = useState("");
  const [busy, setBusy] = useState(false);

  const coursesForDept = useMemo(
    () => courses.filter((c) => c.department_id === departmentId),
    [courses, departmentId],
  );
  const batchesForCourse = useMemo(
    () => batches.filter((b) => b.course_id === courseId),
    [batches, courseId],
  );
  const modulesForCourse = useMemo(
    () => modules.filter((m) => m.course_id === courseId),
    [modules, courseId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch("/api/lms/academic", { credentials: "include" });
      const json = (await res.json()) as {
        departments?: AcademicDepartment[];
        courses?: AcademicCourse[];
        batches?: AcademicBatch[];
        modules?: AcademicModule[];
        error?: string;
        hint?: string;
      };
      if (!res.ok) {
        setError(json.error || "Could not load catalog.");
        setHint(json.hint || null);
        return;
      }
      setDepartments(json.departments ?? []);
      setCourses(json.courses ?? []);
      setBatches(json.batches ?? []);
      setModules(json.modules ?? []);
      if (!departmentId && json.departments?.[0]?.id) {
        setDepartmentId(json.departments[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async (entity: "department" | "course" | "batch" | "module", name: string, extra?: Record<string, string | null>) => {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/lms/academic", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, name: name.trim(), ...extra }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Save failed.");
      setSuccess(`${entity} “${name.trim()}” saved.`);
      if (entity === "department") setDeptName("");
      if (entity === "course") setCourseName("");
      if (entity === "batch") setBatchName("");
      if (entity === "module") setModuleName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-5">
      <PageHeader
        kicker="Academic management"
        title="LMS Catalog"
        description="Link courses, batches, and subjects under a department for LMS dropdowns (assignments, mentor allocation, tests)."
        actions={
          <Button variant="outline" className="rounded-xl border-[#e8dcc8]" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />
      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {hint ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{hint}</div> : null}
      {success ? <CrmFlash tone="success" message={success} onDismiss={() => setSuccess(null)} /> : null}

      <div className="rounded-[24px] border border-[#e8dcc8] bg-[#fffaf0] px-4 py-3 text-sm text-[#334155]">
        <p className="font-semibold text-[#0f172a]">Why dropdowns were empty</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>
            <strong>Seed from Settings</strong> only imports department &amp; course <em>names</em> from Admin → Settings →
            Departments &amp; courses. It does <strong>not</strong> create batches or subjects.
          </li>
          <li>Course / Batch / Subject dropdowns only show options that exist in this catalog for the selected department/course.</li>
          <li>Create rows below, then reopen Mentor Allocation or mentor Learning forms.</li>
        </ul>
      </div>

      {loading ? (
        <p className="text-sm text-[#64748b]">Loading…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-[#0f172a]">Add department</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                className="h-10 min-w-[200px] flex-1 rounded-lg border border-[#dbe6f3] px-3 text-sm"
                placeholder="e.g. Engineering"
                value={deptName}
                onChange={(e) => setDeptName(e.target.value)}
              />
              <Button
                className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]"
                disabled={busy}
                onClick={() => void create("department", deptName)}
              >
                Add department
              </Button>
            </div>
            <ul className="mt-4 max-h-40 space-y-1 overflow-y-auto text-sm text-[#334155]">
              {departments.map((d) => (
                <li key={d.id} className="rounded-lg bg-[#f8fbff] px-3 py-2">
                  {d.name}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-[#0f172a]">Department you&apos;re editing</h2>
            <p className="mt-1 text-xs text-[#64748b]">
              Not a new department type — pick which department to add courses/batches/subjects under. For User Master
              department/course lists, use{" "}
              <a className="text-[#a68b2e] underline" href="/admin/academic/departments-courses">
                Departments &amp; Courses
              </a>
              .
            </p>
            <label className="mt-3 block text-sm">
              Select department
              <select
                className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3"
                value={departmentId}
                onChange={(e) => {
                  setDepartmentId(e.target.value);
                  setCourseId("");
                }}
              >
                <option value="">Select</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-2 text-xs text-[#64748b]">
              Courses below are saved under this department ({coursesForDept.length} course(s)).
            </p>
          </div>

          <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-[#0f172a]">Add course</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                className="h-10 min-w-[200px] flex-1 rounded-lg border border-[#dbe6f3] px-3 text-sm"
                placeholder="e.g. Full Stack Development"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
              />
              <Button
                className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]"
                disabled={busy || !departmentId}
                onClick={() => void create("course", courseName, { department_id: departmentId })}
              >
                Add course
              </Button>
            </div>
            <ul className="mt-4 max-h-40 space-y-1 overflow-y-auto text-sm">
              {coursesForDept.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`w-full rounded-lg px-3 py-2 text-left ${
                      courseId === c.id ? "border border-[#c9a227] bg-[#fff8e8]" : "bg-[#f8fbff]"
                    }`}
                    onClick={() => setCourseId(c.id)}
                  >
                    {c.name}
                  </button>
                </li>
              ))}
              {!coursesForDept.length ? (
                <li className="text-xs text-[#64748b]">No courses for this department yet.</li>
              ) : null}
            </ul>
          </div>

          <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-[#0f172a]">Add batch / subject</h2>
            <label className="mt-3 block text-sm">
              Course
              <select
                className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3"
                value={courseId}
                onChange={(e) => {
                  if (!departmentId) return;
                  setCourseId(e.target.value);
                }}
              >
                {!departmentId ? (
                  <option value="">Select a department first</option>
                ) : (
                  <>
                    <option value="">{coursesForDept.length ? "Select course" : "No courses — add one above"}</option>
                    {coursesForDept.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </label>

            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Batch</p>
              <div className="flex flex-wrap gap-2">
                <input
                  className="h-10 min-w-[140px] flex-1 rounded-lg border border-[#dbe6f3] px-3 text-sm"
                  placeholder="e.g. 2026-A"
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                />
                <input
                  className="h-10 w-28 rounded-lg border border-[#dbe6f3] px-3 text-sm"
                  placeholder="Year"
                  value={batchYear}
                  onChange={(e) => setBatchYear(e.target.value)}
                />
                <Button
                  className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]"
                  disabled={busy || !courseId}
                  onClick={() =>
                    void create("batch", batchName, {
                      course_id: courseId,
                      academic_year: batchYear || null,
                    })
                  }
                >
                  Add batch
                </Button>
              </div>
              <ul className="max-h-28 space-y-1 overflow-y-auto text-sm text-[#334155]">
                {batchesForCourse.map((b) => (
                  <li key={b.id} className="rounded-lg bg-[#f8fbff] px-3 py-2">
                    {b.name}
                    {b.academic_year ? ` · ${b.academic_year}` : ""}
                  </li>
                ))}
                {!batchesForCourse.length ? <li className="text-xs text-[#64748b]">No batches yet.</li> : null}
              </ul>
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Subject / module</p>
              <div className="flex flex-wrap gap-2">
                <input
                  className="h-10 min-w-[200px] flex-1 rounded-lg border border-[#dbe6f3] px-3 text-sm"
                  placeholder="e.g. React Fundamentals"
                  value={moduleName}
                  onChange={(e) => setModuleName(e.target.value)}
                />
                <Button
                  className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]"
                  disabled={busy || !courseId}
                  onClick={() => void create("module", moduleName, { course_id: courseId })}
                >
                  Add subject
                </Button>
              </div>
              <ul className="max-h-28 space-y-1 overflow-y-auto text-sm text-[#334155]">
                {modulesForCourse.map((m) => (
                  <li key={m.id} className="rounded-lg bg-[#f8fbff] px-3 py-2">
                    {m.name}
                  </li>
                ))}
                {!modulesForCourse.length ? <li className="text-xs text-[#64748b]">No subjects yet.</li> : null}
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
