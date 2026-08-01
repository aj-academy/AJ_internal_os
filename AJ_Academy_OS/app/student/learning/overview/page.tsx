"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { CrmFlash } from "@/components/ui/CrmFlash";
import { Button } from "@/components/ui/button";

type EnrolmentRow = {
  id: string;
  status: string;
  enrolled_at: string;
  department_id: string;
  course_id: string;
  batch_id: string | null;
  department_name?: string;
  course_name?: string;
  batch_name?: string | null;
};

export default function StudentLearningOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [rows, setRows] = useState<EnrolmentRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        setError("Not authenticated.");
        return;
      }

      const { data, error: enrolError } = await supabase
        .from("student_enrolments")
        .select("*")
        .eq("student_id", user.id)
        .order("enrolled_at", { ascending: false });

      if (enrolError) {
        setError(enrolError.message);
        setHint("Ask admin to run lms_academic_foundation.sql and seed enrolments.");
        return;
      }

      const list = (data ?? []) as EnrolmentRow[];
      const deptIds = [...new Set(list.map((r) => r.department_id))];
      const courseIds = [...new Set(list.map((r) => r.course_id))];
      const batchIds = [...new Set(list.map((r) => r.batch_id).filter(Boolean))] as string[];

      const [depts, courses, batches] = await Promise.all([
        deptIds.length
          ? supabase.from("academic_departments").select("id,name").in("id", deptIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        courseIds.length
          ? supabase.from("academic_courses").select("id,name").in("id", courseIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        batchIds.length
          ? supabase.from("academic_batches").select("id,name").in("id", batchIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);

      const deptMap = new Map((depts.data ?? []).map((d) => [d.id, d.name]));
      const courseMap = new Map((courses.data ?? []).map((c) => [c.id, c.name]));
      const batchMap = new Map((batches.data ?? []).map((b) => [b.id, b.name]));

      setRows(
        list.map((r) => ({
          ...r,
          department_name: deptMap.get(r.department_id),
          course_name: courseMap.get(r.course_id),
          batch_name: r.batch_id ? batchMap.get(r.batch_id) ?? null : null,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-5">
      <PageHeader
        kicker="Learning & assessments"
        title="My Overview"
        description="Your live course enrolments from Supabase. Assignments, projects, tests and materials will appear here as mentors publish them."
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

      <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-[#0f172a]">My enrolments</h2>
        {loading ? (
          <p className="mt-4 text-sm text-[#64748b]">Loading…</p>
        ) : !rows.length ? (
          <p className="mt-4 rounded-xl border border-dashed border-[#e8dcc8] px-4 py-8 text-center text-sm text-[#64748b]">
            No enrolments on file yet. Ask admin to set your department/course and run Seed from Settings on Mentor
            Allocation.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="rounded-xl border border-[#eef2f7] bg-[#f8fbff] px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-[#0f172a]">{r.course_name || "Course"}</p>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs capitalize text-[#64748b]">
                    {r.status}
                  </span>
                </div>
                <p className="mt-1 text-[#334155]">
                  {[r.department_name, r.batch_name].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-1 text-xs text-[#64748b]">Enrolled {r.enrolled_at}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
