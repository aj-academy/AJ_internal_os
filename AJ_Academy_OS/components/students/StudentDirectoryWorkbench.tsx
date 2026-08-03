"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";

type MentorLink = {
  id: string;
  mentor_id: string;
  mentor_role: string;
  is_primary: boolean;
  start_date: string;
  end_date: string | null;
  mentor_name: string | null;
  mentor_email: string | null;
};

type StudentRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  department: string | null;
  course: string | null;
  registration_number: string | null;
  status: string | null;
  mentor_count: number;
  primary_mentor: { id: string; name: string | null; email: string | null; role: string } | null;
  mentors: MentorLink[];
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
  legacy_assigned_mentor: "Primary (legacy)",
};

export function StudentDirectoryWorkbench() {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [summary, setSummary] = useState({ total: 0, withMentor: 0, withoutMentor: 0 });
  const [search, setSearch] = useState("");
  const [mentorFilter, setMentorFilter] = useState<"all" | "with" | "without">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        mentorFilter,
        status: "active",
      });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/admin/students/directory?${params}`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load students");
      setRows(json.students ?? []);
      setSummary(json.summary ?? { total: 0, withMentor: 0, withoutMentor: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [mentorFilter, search]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Student Management"
        title="Student Directory"
        description="All portal students and the mentors allocated to each of them."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                window.location.href = "/admin/students/mentor-allocation";
              }}
            >
              Assign mentors
            </Button>
          </div>
        }
      />

      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Students shown</p>
          <p className="text-2xl font-semibold tabular-nums">{summary.total}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">With mentor</p>
          <p className="text-2xl font-semibold tabular-nums text-emerald-800">{summary.withMentor}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Without mentor</p>
          <p className="text-2xl font-semibold tabular-nums text-amber-800">{summary.withoutMentor}</p>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            className="min-w-[220px] flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Search student, email, reg no, mentor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["all", "All"],
                ["with", "With mentor"],
                ["without", "No mentor"],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant={mentorFilter === id ? "default" : "outline"}
                onClick={() => setMentorFilter(id)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading student list…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No students match. Import students or clear filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-3 font-medium">Student</th>
                  <th className="py-2 pr-3 font-medium">Reg No</th>
                  <th className="py-2 pr-3 font-medium">Department / Course</th>
                  <th className="py-2 pr-3 font-medium">Primary mentor</th>
                  <th className="py-2 pr-3 font-medium">All mentors</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <Fragment key={s.id}>
                    <tr className="border-b border-border/60">
                      <td className="py-2.5 pr-3">
                        <div className="font-medium">{s.full_name || "Unnamed"}</div>
                        <div className="text-xs text-muted-foreground">{s.email}</div>
                      </td>
                      <td className="py-2.5 pr-3">{s.registration_number || "—"}</td>
                      <td className="py-2.5 pr-3">
                        {s.department || "—"}
                        <span className="text-muted-foreground"> / </span>
                        {s.course || "—"}
                      </td>
                      <td className="py-2.5 pr-3">
                        {s.primary_mentor ? (
                          <div>
                            <div className="font-medium">{s.primary_mentor.name || "Mentor"}</div>
                            <div className="text-xs text-muted-foreground">
                              {ROLE_LABEL[s.primary_mentor.role] || s.primary_mentor.role}
                              {s.primary_mentor.email ? ` · ${s.primary_mentor.email}` : ""}
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
                            Not allocated
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums">{s.mentor_count}</td>
                      <td className="py-2.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                        >
                          {expanded === s.id ? "Hide" : "Details"}
                        </Button>
                      </td>
                    </tr>
                    {expanded === s.id ? (
                      <tr className="border-b border-border/60 bg-muted/20">
                        <td colSpan={6} className="p-3">
                          {s.mentors.length === 0 && !s.primary_mentor ? (
                            <p className="text-sm text-muted-foreground">
                              No active mentor allotments.{" "}
                              <a className="underline" href="/admin/students/mentor-allocation">
                                Allocate now
                              </a>
                            </p>
                          ) : (
                            <ul className="space-y-2 text-sm">
                              {s.mentors.map((m) => (
                                <li
                                  key={m.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2"
                                >
                                  <div>
                                    <span className="font-medium">{m.mentor_name || m.mentor_email}</span>
                                    <span className="text-muted-foreground">
                                      {" "}
                                      · {ROLE_LABEL[m.mentor_role] || m.mentor_role}
                                      {m.is_primary ? " · Primary" : ""}
                                    </span>
                                    <div className="text-xs text-muted-foreground">
                                      From {m.start_date}
                                      {m.end_date ? ` to ${m.end_date}` : " (open-ended)"}
                                    </div>
                                  </div>
                                  <span className="text-xs text-muted-foreground">{m.mentor_email}</span>
                                </li>
                              ))}
                              {s.mentors.length === 0 && s.primary_mentor ? (
                                <li className="text-sm text-muted-foreground">
                                  Legacy primary only: {s.primary_mentor.name} ({s.primary_mentor.email})
                                </li>
                              ) : null}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
