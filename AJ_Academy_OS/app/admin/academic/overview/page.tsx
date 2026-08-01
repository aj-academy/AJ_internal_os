"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";

type OverviewState = {
  departments: number;
  courses: number;
  batches: number;
  modules: number;
  enrolments: number;
  mentors: number;
  allocations: number;
};

export default function AcademicOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [stats, setStats] = useState<OverviewState>({
    departments: 0,
    courses: 0,
    batches: 0,
    modules: 0,
    enrolments: 0,
    mentors: 0,
    allocations: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const [academicRes, allocRes] = await Promise.all([
        fetch("/api/lms/academic", { credentials: "include" }),
        fetch("/api/lms/mentor-allocations", { credentials: "include" }),
      ]);
      const academicJson = (await academicRes.json()) as {
        departments?: unknown[];
        courses?: unknown[];
        batches?: unknown[];
        modules?: unknown[];
        mentors?: unknown[];
        activeEnrolmentCount?: number;
        error?: string;
        hint?: string;
      };
      const allocJson = (await allocRes.json()) as {
        allocations?: { status?: string }[];
        error?: string;
        hint?: string;
      };
      if (!academicRes.ok) {
        setError(academicJson.error || "Could not load academic overview.");
        setHint(academicJson.hint || null);
        return;
      }
      if (!allocRes.ok) {
        setError(allocJson.error || "Could not load allocations.");
        setHint(allocJson.hint || null);
        return;
      }
      setStats({
        departments: academicJson.departments?.length ?? 0,
        courses: academicJson.courses?.length ?? 0,
        batches: academicJson.batches?.length ?? 0,
        modules: academicJson.modules?.length ?? 0,
        enrolments: academicJson.activeEnrolmentCount ?? 0,
        mentors: academicJson.mentors?.length ?? 0,
        allocations: (allocJson.allocations ?? []).filter((a) => a.status === "active").length,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = [
    { title: "Departments", value: stats.departments },
    { title: "Courses", value: stats.courses },
    { title: "Batches", value: stats.batches },
    { title: "Modules", value: stats.modules },
    { title: "Active enrolments", value: stats.enrolments },
    { title: "Mentors", value: stats.mentors },
    { title: "Active allocations", value: stats.allocations },
  ];

  return (
    <section className="space-y-5">
      <PageHeader
        kicker="Academic management"
        title="Academic Overview"
        description="Live LMS foundation metrics from Supabase. Start with Mentor Allocation after seeding departments and enrolments."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-xl border-[#e8dcc8]" onClick={() => void load()}>
              Refresh
            </Button>
            <Link href="/admin/academic/mentor-allocation">
              <Button className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]">Mentor Allocation</Button>
            </Link>
          </div>
        }
      />

      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {hint ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{hint}</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <article key={c.title} className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-[#64748b]">{c.title}</p>
            <p className="mt-2 text-2xl font-semibold text-[#0f172a]">{loading ? "…" : c.value}</p>
          </article>
        ))}
      </div>

      <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-5 text-sm text-[#334155] shadow-sm">
        <p className="font-semibold text-[#0f172a]">Next steps</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Open{" "}
            <a className="underline" href="/admin/academic/departments-courses">
              Departments &amp; Courses
            </a>{" "}
            (moved from Settings), then Sync to LMS catalog.
          </li>
          <li>
            Open <a className="underline" href="/admin/academic/catalog">LMS Catalog</a> and add batches/subjects under
            each department.
          </li>
          <li>Create effective-dated mentor allocations for each department/course/batch.</li>
          <li>Use Calendar & Reports for LMS activity summary and academic events.</li>
        </ol>
      </div>
    </section>
  );
}
