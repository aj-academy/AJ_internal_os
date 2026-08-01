"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { CrmFlash } from "@/components/ui/CrmFlash";
import { Button } from "@/components/ui/button";

type AllocationRow = {
  id: string;
  department_id: string;
  course_id: string | null;
  batch_id: string | null;
  module_id: string | null;
  start_date: string;
  end_date: string | null;
  is_primary: boolean;
  status: string;
  department_name?: string;
  course_name?: string | null;
  batch_name?: string | null;
  module_name?: string | null;
};

export default function MentorLearningOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [rows, setRows] = useState<AllocationRow[]>([]);

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

      await supabase.rpc("lms_expire_mentor_allocations");

      const { data, error: allocError } = await supabase
        .from("mentor_allocations")
        .select("*")
        .eq("mentor_id", user.id)
        .order("start_date", { ascending: false });

      if (allocError) {
        setError(allocError.message);
        setHint("Ask admin to run lms_01_academic_foundation.sql and lms_02_mentor_allocations.sql.");
        return;
      }

      const list = (data ?? []) as AllocationRow[];
      const deptIds = [...new Set(list.map((r) => r.department_id))];
      const courseIds = [...new Set(list.map((r) => r.course_id).filter(Boolean))] as string[];
      const batchIds = [...new Set(list.map((r) => r.batch_id).filter(Boolean))] as string[];
      const moduleIds = [...new Set(list.map((r) => r.module_id).filter(Boolean))] as string[];

      const [depts, courses, batches, modules] = await Promise.all([
        deptIds.length
          ? supabase.from("academic_departments").select("id,name").in("id", deptIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        courseIds.length
          ? supabase.from("academic_courses").select("id,name").in("id", courseIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        batchIds.length
          ? supabase.from("academic_batches").select("id,name").in("id", batchIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        moduleIds.length
          ? supabase.from("academic_modules").select("id,name").in("id", moduleIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);

      const deptMap = new Map((depts.data ?? []).map((d) => [d.id, d.name]));
      const courseMap = new Map((courses.data ?? []).map((c) => [c.id, c.name]));
      const batchMap = new Map((batches.data ?? []).map((b) => [b.id, b.name]));
      const moduleMap = new Map((modules.data ?? []).map((m) => [m.id, m.name]));

      setRows(
        list.map((r) => ({
          ...r,
          department_name: deptMap.get(r.department_id),
          course_name: r.course_id ? courseMap.get(r.course_id) ?? null : null,
          batch_name: r.batch_id ? batchMap.get(r.batch_id) ?? null : null,
          module_name: r.module_id ? moduleMap.get(r.module_id) ?? null : null,
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

  const active = rows.filter((r) => r.status === "active");

  return (
    <section className="space-y-5">
      <PageHeader
        kicker="Learning management"
        title="Mentor Overview"
        description="Your active academic allocations from Supabase. You may create learning content only within these scopes (assignments and tests land in later phases)."
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

      <div className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[#64748b]">Active allocations</p>
          <p className="mt-2 text-2xl font-semibold text-[#0f172a]">{loading ? "…" : active.length}</p>
        </article>
        <article className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[#64748b]">Total allocation records</p>
          <p className="mt-2 text-2xl font-semibold text-[#0f172a]">{loading ? "…" : rows.length}</p>
        </article>
      </div>

      <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-[#0f172a]">My departments & scopes</h2>
        {loading ? (
          <p className="mt-4 text-sm text-[#64748b]">Loading…</p>
        ) : !rows.length ? (
          <p className="mt-4 rounded-xl border border-dashed border-[#e8dcc8] px-4 py-8 text-center text-sm text-[#64748b]">
            No allocations yet. Ask an admin to assign you under Academic Management → Mentor Allocation.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="rounded-xl border border-[#eef2f7] bg-[#f8fbff] px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-[#0f172a]">{r.department_name || "Department"}</p>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs capitalize text-[#64748b]">
                    {r.status}
                    {r.is_primary ? " · primary" : ""}
                  </span>
                </div>
                <p className="mt-1 text-[#334155]">
                  {[r.course_name, r.batch_name, r.module_name].filter(Boolean).join(" · ") ||
                    "Department-wide scope"}
                </p>
                <p className="mt-1 text-xs text-[#64748b]">
                  {r.start_date}
                  {r.end_date ? ` → ${r.end_date}` : " → open"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
