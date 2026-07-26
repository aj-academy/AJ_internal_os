"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type QueryRow = {
  id: string;
  employee_id: string;
  year: number;
  month: number;
  category: string;
  subject: string;
  description: string;
  status: string;
  hr_response: string | null;
  created_at: string;
  resolved_at: string | null;
  employee?: { full_name: string | null; email: string | null } | null;
};

const inputClass = "h-9 rounded-lg border border-[#e8dcc8] bg-white px-2 text-sm text-[#3d3428]";
const textareaClass = "min-h-[80px] rounded-lg border border-[#e8dcc8] bg-white px-2 py-2 text-sm text-[#3d3428]";

export function SalaryQueriesWorkbench() {
  const [status, setStatus] = useState("open");
  const [queries, setQueries] = useState<QueryRow[]>([]);
  const [migrationRequired, setMigrationRequired] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = status ? `?status=${encodeURIComponent(status)}` : "";
      const res = await fetch(`/api/hr/salary/queries${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load queries");
      setQueries(json.queries ?? []);
      setMigrationRequired(json.migrationRequired ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = async (id: string, nextStatus: "under_review" | "resolved" | "rejected" | "closed") => {
    setBusyId(id);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/hr/salary/queries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status: nextStatus,
          hrResponse: responses[id]?.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update failed");
      setOkMsg(`Query marked ${nextStatus}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        kicker="HR, Attendance & Payroll"
        title="Salary Queries"
        description="Employee questions about payslips, deductions, attendance, or payment. Resolve with a written response."
      />

      {migrationRequired ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Migration required: run <code className="font-mono">{migrationRequired}</code>.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {okMsg ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {okMsg}
        </div>
      ) : null}

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Status
            <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="under_review">Under review</option>
              <option value="resolved">Resolved</option>
              <option value="rejected">Rejected</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
          <p className="text-xs text-muted-foreground">{queries.length} query(ies)</p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {queries.map((q) => (
          <Card key={q.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {q.employee?.full_name || q.employee_id.slice(0, 8)} · {q.month}/{q.year} · {q.category}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {q.subject} · <span className="capitalize">{q.status.replace(/_/g, " ")}</span> ·{" "}
                {new Date(q.created_at).toLocaleString()}
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="whitespace-pre-wrap text-sm text-[#3d3428]">{q.description}</p>
              {q.hr_response ? (
                <p className="rounded-lg border border-[#e8dcc8] bg-[#faf7f0] px-3 py-2 text-sm">
                  <span className="font-medium">HR response: </span>
                  {q.hr_response}
                </p>
              ) : null}
              <textarea
                className={textareaClass}
                placeholder="HR response"
                value={responses[q.id] ?? q.hr_response ?? ""}
                onChange={(e) => setResponses((prev) => ({ ...prev, [q.id]: e.target.value }))}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="xs"
                  variant="outline"
                  disabled={busyId === q.id}
                  onClick={() => void update(q.id, "under_review")}
                >
                  Under review
                </Button>
                <Button size="xs" disabled={busyId === q.id} onClick={() => void update(q.id, "resolved")}>
                  Resolve
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={busyId === q.id}
                  onClick={() => void update(q.id, "rejected")}
                >
                  Reject
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={busyId === q.id}
                  onClick={() => void update(q.id, "closed")}
                >
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!queries.length && !loading ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No salary queries in this filter.
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
