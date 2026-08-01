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
import type { AllocationListRow } from "@/lib/lms/mentorAllocations";

type MentorOption = {
  id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  status: string | null;
};

const emptyForm = {
  mentor_id: "",
  department_id: "",
  course_id: "",
  batch_id: "",
  module_id: "",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: "",
  is_primary: true,
  notes: "",
};

export function MentorAllocationWorkbench() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [departments, setDepartments] = useState<AcademicDepartment[]>([]);
  const [courses, setCourses] = useState<AcademicCourse[]>([]);
  const [batches, setBatches] = useState<AcademicBatch[]>([]);
  const [modules, setModules] = useState<AcademicModule[]>([]);
  const [mentors, setMentors] = useState<MentorOption[]>([]);
  const [enrolmentCount, setEnrolmentCount] = useState(0);
  const [allocations, setAllocations] = useState<AllocationListRow[]>([]);

  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState("active");

  const coursesForDept = useMemo(
    () => courses.filter((c) => c.department_id === form.department_id),
    [courses, form.department_id],
  );
  const batchesForCourse = useMemo(
    () => batches.filter((b) => b.course_id === form.course_id),
    [batches, form.course_id],
  );
  const modulesForCourse = useMemo(
    () => modules.filter((m) => m.course_id === form.course_id),
    [modules, form.course_id],
  );

  const filteredAllocations = useMemo(() => {
    if (!statusFilter) return allocations;
    return allocations.filter((a) => a.status === statusFilter);
  }, [allocations, statusFilter]);

  const load = useCallback(async (opts?: { seed?: boolean; silent?: boolean }) => {
    if (opts?.silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setHint(null);
    try {
      const academicUrl = opts?.seed ? "/api/lms/academic?seed=1" : "/api/lms/academic";
      const [academicRes, allocRes] = await Promise.all([
        fetch(academicUrl, { credentials: "include" }),
        fetch("/api/lms/mentor-allocations", { credentials: "include" }),
      ]);
      const academicJson = (await academicRes.json()) as {
        departments?: AcademicDepartment[];
        courses?: AcademicCourse[];
        batches?: AcademicBatch[];
        modules?: AcademicModule[];
        mentors?: MentorOption[];
        activeEnrolmentCount?: number;
        error?: string;
        hint?: string;
      };
      const allocJson = (await allocRes.json()) as {
        allocations?: AllocationListRow[];
        error?: string;
        hint?: string;
      };

      if (!academicRes.ok) {
        setError(academicJson.error || "Could not load academic structure.");
        setHint(academicJson.hint || null);
        return;
      }
      if (!allocRes.ok) {
        setError(allocJson.error || "Could not load mentor allocations.");
        setHint(allocJson.hint || null);
        return;
      }

      setDepartments(academicJson.departments ?? []);
      setCourses(academicJson.courses ?? []);
      setBatches(academicJson.batches ?? []);
      setModules(academicJson.modules ?? []);
      setMentors(academicJson.mentors ?? []);
      setEnrolmentCount(academicJson.activeEnrolmentCount ?? 0);
      setAllocations(allocJson.allocations ?? []);
      if (opts?.seed) setSuccess("Seeded departments/courses from Settings and backfilled student enrolments.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/lms/mentor-allocations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mentor_id: form.mentor_id,
          department_id: form.department_id,
          course_id: form.course_id || null,
          batch_id: form.batch_id || null,
          module_id: form.module_id || null,
          start_date: form.start_date,
          end_date: form.end_date || null,
          is_primary: form.is_primary,
          notes: form.notes || null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not create allocation.");
      setSuccess("Mentor allocation created.");
      setForm((prev) => ({ ...emptyForm, start_date: prev.start_date }));
      await load({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/lms/mentor-allocations/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Update failed.");
      setSuccess(`Allocation marked ${status}. Historical record kept.`);
      await load({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed.");
    }
  };

  return (
    <section className="space-y-5">
      <PageHeader
        kicker="Academic management"
        title="Mentor Allocation"
        description="Assign mentors to departments, courses, batches and modules with effective dates. Mentors can create learning content only within active allocations."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl border-[#e8dcc8]"
              disabled={loading || refreshing}
              onClick={() => void load({ silent: true })}
            >
              {refreshing ? "Updating…" : "Refresh"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl border-[#e8dcc8]"
              disabled={loading || refreshing}
              onClick={() => void load({ seed: true })}
            >
              Seed from Settings
            </Button>
          </div>
        }
      />

      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {hint ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{hint}</div>
      ) : null}
      {success ? <CrmFlash tone="success" message={success} onDismiss={() => setSuccess(null)} /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[#64748b]">Departments</p>
          <p className="mt-2 text-2xl font-semibold text-[#0f172a]">{loading ? "…" : departments.length}</p>
        </article>
        <article className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[#64748b]">Active enrolments</p>
          <p className="mt-2 text-2xl font-semibold text-[#0f172a]">{loading ? "…" : enrolmentCount}</p>
        </article>
        <article className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[#64748b]">Mentors</p>
          <p className="mt-2 text-2xl font-semibold text-[#0f172a]">{loading ? "…" : mentors.length}</p>
        </article>
      </div>

      <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-[#0f172a]">New allocation</h2>
        <p className="mt-1 text-sm text-[#64748b]">
          Leave course/batch/module empty to grant department-wide scope. Changing allocation never deletes history —
          revoke instead. Add missing courses/batches/subjects under{" "}
          <a className="font-medium text-[#a68b2e] underline" href="/admin/academic/catalog">
            Academic Catalog
          </a>
          .
        </p>
        <p className="mt-2 text-xs text-[#64748b]">
          Tip: pick <strong>Department</strong> first, then Course, then Batch/Subject. Those fields stay clickable and
          will tell you what to select next.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm text-[#334155]">
            Mentor
            <select
              className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] bg-white px-3"
              value={form.mentor_id}
              onChange={(e) => setForm((f) => ({ ...f, mentor_id: e.target.value }))}
            >
              <option value="">Select mentor</option>
              {mentors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name || m.email || m.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-[#334155]">
            Department
            <select
              className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] bg-white px-3"
              value={form.department_id}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  department_id: e.target.value,
                  course_id: "",
                  batch_id: "",
                  module_id: "",
                }))
              }
            >
              <option value="">
                {departments.length ? "Select department" : "No departments — add in Academic Catalog"}
              </option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-[#334155]">
            Course (optional)
            <select
              className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] bg-white px-3"
              value={form.course_id}
              onChange={(e) => {
                if (!form.department_id) {
                  setError("Select a department first, then choose a course.");
                  return;
                }
                setForm((f) => ({ ...f, course_id: e.target.value, batch_id: "", module_id: "" }));
              }}
            >
              {!form.department_id ? (
                <option value="">Select a department first</option>
              ) : (
                <>
                  <option value="">
                    {coursesForDept.length
                      ? "All courses in department"
                      : "No courses for this department — add in Academic Catalog"}
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
              className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] bg-white px-3"
              value={form.batch_id}
              onChange={(e) => {
                if (!form.course_id) {
                  setError("Select a course first, then choose a batch.");
                  return;
                }
                setForm((f) => ({ ...f, batch_id: e.target.value }));
              }}
            >
              {!form.course_id ? (
                <option value="">Select a course first</option>
              ) : (
                <>
                  <option value="">
                    {batchesForCourse.length
                      ? "All batches in course"
                      : "No batches for this course — add in Academic Catalog"}
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
            Subject / module (optional)
            <select
              className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] bg-white px-3"
              value={form.module_id}
              onChange={(e) => {
                if (!form.course_id) {
                  setError("Select a course first, then choose a subject.");
                  return;
                }
                setForm((f) => ({ ...f, module_id: e.target.value }));
              }}
            >
              {!form.course_id ? (
                <option value="">Select a course first</option>
              ) : (
                <>
                  <option value="">
                    {modulesForCourse.length
                      ? "All modules"
                      : "No subjects for this course — add in Academic Catalog"}
                  </option>
                  {modulesForCourse.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </>
              )}
            </select>
          </label>
          <label className="text-sm text-[#334155]">
            Start date
            <input
              type="date"
              className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] bg-white px-3"
              value={form.start_date}
              onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
            />
          </label>
          <label className="text-sm text-[#334155]">
            End date (optional)
            <input
              type="date"
              className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] bg-white px-3"
              value={form.end_date}
              onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-[#334155] sm:mt-7">
            <input
              type="checkbox"
              checked={form.is_primary}
              onChange={(e) => setForm((f) => ({ ...f, is_primary: e.target.checked }))}
            />
            Primary mentor for this scope
          </label>
          <label className="text-sm text-[#334155] sm:col-span-2 lg:col-span-3">
            Notes
            <input
              className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] bg-white px-3"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional"
            />
          </label>
        </div>
        <div className="mt-4">
          <Button
            type="button"
            className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]"
            disabled={submitting || !form.mentor_id || !form.department_id}
            onClick={() => void submit()}
          >
            {submitting ? "Saving…" : "Create allocation"}
          </Button>
        </div>
      </div>

      <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[#0f172a]">Allocations</h2>
          <select
            className="h-9 rounded-lg border border-[#dbe6f3] bg-white px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="expired">Expired</option>
            <option value="revoked">Revoked</option>
            <option value="">All statuses</option>
          </select>
        </div>

        {loading && !allocations.length ? (
          <p className="py-8 text-center text-sm text-[#64748b]">Loading allocations…</p>
        ) : !filteredAllocations.length ? (
          <p className="rounded-xl border border-dashed border-[#e8dcc8] px-4 py-10 text-center text-sm text-[#64748b]">
            No allocations yet. Seed academic structure, then create an allocation above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[#e8edf5] text-xs uppercase tracking-wide text-[#64748b]">
                <tr>
                  <th className="px-3 py-2">Mentor</th>
                  <th className="px-3 py-2">Scope</th>
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2">Primary</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef2f7]">
                {filteredAllocations.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-3">
                      <div className="font-medium text-[#0f172a]">{row.mentor_name || "—"}</div>
                      <div className="text-xs text-[#64748b]">{row.mentor_email}</div>
                    </td>
                    <td className="px-3 py-3 text-[#334155]">
                      <div>{row.department_name || "—"}</div>
                      <div className="text-xs text-[#64748b]">
                        {[row.course_name, row.batch_name, row.module_name].filter(Boolean).join(" · ") ||
                          "Department-wide"}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[#334155]">
                      {row.start_date}
                      {row.end_date ? ` → ${row.end_date}` : " → open"}
                    </td>
                    <td className="px-3 py-3">{row.is_primary ? "Yes" : "Secondary"}</td>
                    <td className="px-3 py-3 capitalize">{row.status}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {row.status === "active" ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-8 rounded-full px-3 text-xs"
                              onClick={() => void setStatus(row.id, "inactive")}
                            >
                              Deactivate
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-8 rounded-full px-3 text-xs"
                              onClick={() => void setStatus(row.id, "revoked")}
                            >
                              Revoke
                            </Button>
                          </>
                        ) : row.status !== "expired" ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 rounded-full px-3 text-xs"
                            onClick={() => void setStatus(row.id, "active")}
                          >
                            Reactivate
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
