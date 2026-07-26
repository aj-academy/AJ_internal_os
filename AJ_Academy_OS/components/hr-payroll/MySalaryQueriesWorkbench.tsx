"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type QueryRow = {
  id: string;
  year: number;
  month: number;
  category: string;
  subject: string;
  description: string;
  status: string;
  hr_response: string | null;
  created_at: string;
  resolved_at: string | null;
};

const inputClass = "h-9 rounded-lg border border-[#e8dcc8] bg-white px-2 text-sm text-[#3d3428]";
const textareaClass = "min-h-[90px] rounded-lg border border-[#e8dcc8] bg-white px-2 py-2 text-sm text-[#3d3428]";

const CATEGORIES = [
  "payslip",
  "attendance",
  "leave",
  "deduction",
  "addition",
  "payment",
  "structure",
  "other",
];

export function MySalaryQueriesWorkbench() {
  const now = new Date();
  const [queries, setQueries] = useState<QueryRow[]>([]);
  const [migrationRequired, setMigrationRequired] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [category, setCategory] = useState("payslip");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/salary/queries", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load queries");
      setQueries(json.queries ?? []);
      setMigrationRequired(json.migrationRequired ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setOkMsg(null);
    try {
      if (!subject.trim() || !description.trim()) throw new Error("Subject and description are required.");
      const res = await fetch("/api/hr/salary/queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, category, subject, description }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not submit query");
      setOkMsg("Query submitted. HR will respond here.");
      setSubject("");
      setDescription("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        kicker="My HR & Payroll"
        title="Salary Queries"
        description="Ask HR about a payslip, deduction, attendance day, or payment. Track status and responses here."
      />

      {migrationRequired ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Salary queries are not available yet.
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
        <CardHeader>
          <CardTitle>New query</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Year
              <input
                type="number"
                className={`${inputClass} w-24`}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Month
              <select className={inputClass} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Category
              <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Subject
            <input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Description
            <textarea className={textareaClass} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <Button
            size="sm"
            className="w-fit"
            onClick={() => void submit()}
            disabled={submitting || !!migrationRequired}
          >
            {submitting ? "Submitting…" : "Submit query"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>My queries</CardTitle>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {queries.map((q) => (
            <div key={q.id} className="rounded-lg border border-[#e8dcc8] px-3 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-[#3d3428]">
                  {q.subject} · {q.month}/{q.year}
                </p>
                <span className="text-xs capitalize text-muted-foreground">{q.status.replace(/_/g, " ")}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{q.description}</p>
              {q.hr_response ? (
                <p className="mt-2 rounded-md bg-[#faf7f0] px-2 py-2 text-sm">
                  <span className="font-medium">HR: </span>
                  {q.hr_response}
                </p>
              ) : null}
            </div>
          ))}
          {!queries.length && !loading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No queries yet.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
