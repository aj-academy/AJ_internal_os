"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";

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
  } | null;
};

export function MentorMyStudentsWorkbench() {
  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async (role = filter) => {
    setLoading(true);
    setError(null);
    try {
      const q = role ? `?role=${encodeURIComponent(role)}` : "";
      const res = await fetch(`/api/mentor/my-students${q}`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setRows(json.assignments ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load("");
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="My Students"
        title="Assigned Students"
        description="Students linked to you via active mentor assignments (and historical read-only where retained)."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={filter === "" ? "default" : "outline"} onClick={() => { setFilter(""); void load(""); }}>
              All
            </Button>
            <Button type="button" variant={filter === "primary" ? "default" : "outline"} onClick={() => { setFilter("primary"); void load("primary"); }}>
              Primary
            </Button>
            <Button type="button" variant={filter === "secondary" ? "default" : "outline"} onClick={() => { setFilter("secondary"); void load("secondary"); }}>
              Secondary
            </Button>
            <Button type="button" variant={filter === "project" ? "default" : "outline"} onClick={() => { setFilter("project"); void load("project"); }}>
              Project
            </Button>
          </div>
        }
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No assigned students for this filter.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="p-3">Student</th>
                <th className="p-3">Reg No</th>
                <th className="p-3">Dept / Course</th>
                <th className="p-3">Role</th>
                <th className="p-3">Status</th>
                <th className="p-3">Dates</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60">
                  <td className="p-3">
                    <div className="font-medium">{r.student?.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.student?.email}</div>
                  </td>
                  <td className="p-3">{r.student?.registration_number || "—"}</td>
                  <td className="p-3">
                    {r.student?.department || "—"} / {r.student?.course || "—"}
                  </td>
                  <td className="p-3">
                    {r.mentor_role}
                    {r.is_primary ? " (primary)" : ""}
                  </td>
                  <td className="p-3">{r.status}</td>
                  <td className="p-3 text-xs">
                    {r.start_date}
                    {r.end_date ? ` → ${r.end_date}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
