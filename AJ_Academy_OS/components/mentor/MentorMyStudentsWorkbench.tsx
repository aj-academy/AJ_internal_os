"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";

type Row = {
  id: string;
  mentor_role: string;
  is_primary: boolean;
  status: string;
  start_date: string;
  end_date: string | null;
  student: {
    id: string;
    full_name: string | null;
    email: string | null;
    department: string | null;
    course: string | null;
    registration_number: string | null;
    phone?: string | null;
    status?: string | null;
  } | null;
};

const ROLE_LABEL: Record<string, string> = {
  primary_academic: "Primary academic",
  secondary: "Secondary",
  academic: "Academic",
  project: "Project",
  placement: "Placement",
  technical: "Technical",
  support: "Support",
  backup: "Backup",
};

const FILTERS = [
  { id: "", label: "All allotted" },
  { id: "primary", label: "Primary" },
  { id: "secondary", label: "Secondary" },
  { id: "project", label: "Project" },
  { id: "placement", label: "Placement" },
] as const;

export function MentorMyStudentsWorkbench() {
  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);

  const load = useCallback(async (role = filter) => {
    setLoading(true);
    setError(null);
    try {
      const q = role ? `?role=${encodeURIComponent(role)}` : "";
      const res = await fetch(`/api/mentor/my-students${q}`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.hint || "Failed to load your students");
      setRows(json.assignments ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load(filter);
  }, [load, filter]);

  const visible = useMemo(() => {
    let list = rows;
    if (activeOnly) list = list.filter((r) => r.status === "active");
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const s = r.student;
        const hay = [s?.full_name, s?.email, s?.registration_number, s?.department, s?.course, r.mentor_role]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [rows, activeOnly, search]);

  const counts = useMemo(() => {
    const active = rows.filter((r) => r.status === "active");
    return {
      total: active.length,
      primary: active.filter((r) => r.is_primary).length,
      secondary: active.filter((r) => !r.is_primary).length,
    };
  }, [rows]);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="My Students"
        title="Students allotted to me"
        description="These are the portal students assigned to you as mentor. You only see your own allotments."
        actions={
          <Button type="button" variant="outline" onClick={() => void load(filter)} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        }
      />

      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Active allotments</p>
          <p className="text-2xl font-semibold tabular-nums">{counts.total}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">As primary mentor</p>
          <p className="text-2xl font-semibold tabular-nums">{counts.primary}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">As secondary / other</p>
          <p className="text-2xl font-semibold tabular-nums">{counts.secondary}</p>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.id || "all"}
              type="button"
              size="sm"
              variant={filter === f.id ? "default" : "outline"}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="min-w-[200px] flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Search student name, email, reg no…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
            Active only
          </label>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading your students…</p>
        ) : visible.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">No students allotted to you yet</p>
            <p>When an admin assigns students to you, they will appear in this list.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-3 font-medium">Student</th>
                  <th className="py-2 pr-3 font-medium">Reg No</th>
                  <th className="py-2 pr-3 font-medium">Department / Course</th>
                  <th className="py-2 pr-3 font-medium">Your role</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 font-medium">Period</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className="border-b border-border/60">
                    <td className="py-2.5 pr-3">
                      <div className="font-medium">{r.student?.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.student?.email}</div>
                    </td>
                    <td className="py-2.5 pr-3">{r.student?.registration_number || "—"}</td>
                    <td className="py-2.5 pr-3">
                      {r.student?.department || "—"} / {r.student?.course || "—"}
                    </td>
                    <td className="py-2.5 pr-3">
                      {ROLE_LABEL[r.mentor_role] || r.mentor_role}
                      {r.is_primary ? (
                        <span className="ml-1 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-900">
                          Primary
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3 capitalize">{r.status}</td>
                    <td className="py-2.5 text-xs text-muted-foreground">
                      {r.start_date}
                      {r.end_date ? ` → ${r.end_date}` : " → open"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
