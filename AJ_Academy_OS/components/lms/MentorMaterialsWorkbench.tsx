"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";
import type { AcademicBatch, AcademicCourse, AcademicDepartment } from "@/types/lms";

type MaterialRow = {
  id: string;
  title: string;
  status: string;
  material_type: string;
  external_url: string | null;
  topic: string | null;
};

type EligibleStudent = { student_id: string; full_name: string | null; email: string | null };

export function MentorMaterialsWorkbench() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
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
    department_id: "",
    course_id: "",
    batch_id: "",
    material_type: "external_link",
    external_url: "",
    topic: "",
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
      const [matRes, deptRes, courseRes, batchRes] = await Promise.all([
        fetch("/api/lms/materials", { credentials: "include" }),
        supabase.from("academic_departments").select("*").eq("status", "active").order("name"),
        supabase.from("academic_courses").select("*").eq("status", "active").order("name"),
        supabase.from("academic_batches").select("*").eq("status", "active").order("name"),
      ]);
      const matJson = (await matRes.json()) as { materials?: MaterialRow[]; error?: string; hint?: string };
      if (!matRes.ok) {
        setError(matJson.error || "Could not load materials.");
        setHint(matJson.hint || null);
        return;
      }
      setMaterials(matJson.materials ?? []);
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
      const res = await fetch("/api/lms/materials", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          course_id: form.course_id || null,
          batch_id: form.batch_id || null,
          external_url: form.external_url || null,
          student_ids: studentIds,
        }),
      });
      const json = (await res.json()) as { error?: string; publish?: { recipient_count?: number } };
      if (!res.ok) throw new Error(json.error || "Save failed.");
      setSuccess(
        form.publish
          ? `Material published${json.publish?.recipient_count != null ? ` to ${json.publish.recipient_count} student(s)` : ""}.`
          : "Draft material saved.",
      );
      setForm((f) => ({ ...f, title: "", description: "", external_url: "", topic: "" }));
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
        title="Study Materials"
        description="Publish links and resources to enrolled students. File-bucket uploads use private study-materials storage (signed URLs in a later pass)."
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
        <h2 className="text-lg font-semibold text-[#0f172a]">Publish material</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            Title
            <input className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </label>
          <label className="text-sm sm:col-span-2">
            Description
            <textarea className="mt-1 min-h-[64px] w-full rounded-lg border border-[#dbe6f3] px-3 py-2" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
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
            Type
            <select className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3" value={form.material_type} onChange={(e) => setForm((f) => ({ ...f, material_type: e.target.value }))}>
              <option value="external_link">External link</option>
              <option value="youtube">YouTube</option>
              <option value="pdf">PDF</option>
              <option value="notes">Notes</option>
              <option value="video">Video</option>
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            URL
            <input className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3" value={form.external_url} onChange={(e) => setForm((f) => ({ ...f, external_url: e.target.value }))} placeholder="https://" />
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
            {submitting ? "Saving…" : form.publish ? "Publish material" : "Save draft"}
          </Button>
        </div>
      </div>

      <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-[#0f172a]">Materials</h2>
        {loading ? (
          <p className="mt-4 text-sm text-[#64748b]">Loading…</p>
        ) : !materials.length ? (
          <p className="mt-4 rounded-xl border border-dashed border-[#e8dcc8] px-4 py-8 text-center text-sm text-[#64748b]">No materials yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {materials.map((m) => (
              <li key={m.id} className="rounded-xl border border-[#eef2f7] bg-[#f8fbff] px-4 py-3 text-sm">
                <p className="font-semibold text-[#0f172a]">{m.title}</p>
                <p className="text-xs text-[#64748b]">
                  {m.status} · {m.material_type}
                  {m.external_url ? (
                    <>
                      {" · "}
                      <a className="text-[#c9a227] underline" href={m.external_url} target="_blank" rel="noreferrer">
                        Open link
                      </a>
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
