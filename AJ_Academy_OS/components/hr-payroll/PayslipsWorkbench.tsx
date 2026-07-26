"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Payslip = {
  id: string;
  employee_id: string;
  employee_name?: string | null;
  payslip_number: string;
  year: number;
  month: number;
  status: string;
  generated_at: string;
  released_at: string | null;
  download_count: number;
  generation_error: string | null;
  payroll_period_id: string;
};

const inputClass = "h-9 rounded-lg border border-[#e8dcc8] bg-white px-2 text-sm text-[#3d3428]";

export function PayslipsWorkbench() {
  const now = new Date();
  const [year, setYear] = useState(() => {
    if (typeof window === "undefined") return now.getFullYear();
    const y = Number(new URLSearchParams(window.location.search).get("year"));
    return y || now.getFullYear();
  });
  const [month, setMonth] = useState(() => {
    if (typeof window === "undefined") return now.getMonth() + 1;
    const m = Number(new URLSearchParams(window.location.search).get("month"));
    return m >= 1 && m <= 12 ? m : now.getMonth() + 1;
  });
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [migrationRequired, setMigrationRequired] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/hr/payslips?year=${year}&month=${month}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load payslips");
      setPayslips(json.payslips ?? []);
      setMigrationRequired(json.migrationRequired ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async (release: boolean) => {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/hr/payslips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", year, month, release }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Generation failed");
      setOkMsg(
        `Generated ${json.generated ?? 0} · failed ${json.failed ?? 0} · skipped ${json.skipped ?? 0}${
          release ? " · released" : ""
        }.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  };

  const releaseAll = async () => {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const periodId = payslips[0]?.payroll_period_id;
      const res = await fetch("/api/hr/payslips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "release",
          periodId,
          payslipIds: payslips.filter((p) => p.status !== "failed").map((p) => p.id),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Release failed");
      setOkMsg(`Released ${json.released ?? 0} payslip(s).`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Release failed");
    } finally {
      setBusy(false);
    }
  };

  const download = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/hr/payslips?downloadId=${id}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Download failed");
      if (json.signedUrl) window.open(json.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    }
  };

  const released = payslips.filter((p) => p.status === "released" || p.status === "regenerated").length;
  const generated = payslips.filter((p) => p.status === "generated").length;
  const failed = payslips.filter((p) => p.status === "failed").length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        kicker="HR, Attendance & Payroll"
        title="Payslips"
        description="Generate PDFs after payroll is approved/locked. Files stay in a private bucket; employees only see released payslips via short-lived download links."
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
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
          <Button size="sm" onClick={() => void generate(false)} disabled={busy || !!migrationRequired}>
            Generate PDFs
          </Button>
          <Button size="sm" onClick={() => void generate(true)} disabled={busy || !!migrationRequired}>
            Generate & release
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void releaseAll()}
            disabled={busy || !payslips.length || !!migrationRequired}
          >
            Release all
          </Button>
          <p className="text-xs text-muted-foreground">
            {payslips.length} slips · {generated} generated · {released} released · {failed} failed
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payslip list</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#e8dcc8] text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Employee</th>
                <th className="py-2 pr-3 font-medium">Number</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Generated</th>
                <th className="py-2 pr-3 font-medium">Downloads</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payslips.map((p) => (
                <tr key={p.id} className="border-b border-[#f0e6d6]">
                  <td className="py-2 pr-3">{p.employee_name || p.employee_id.slice(0, 8)}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{p.payslip_number}</td>
                  <td className="py-2 pr-3 capitalize">{p.status}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {p.generated_at ? new Date(p.generated_at).toLocaleString() : "—"}
                  </td>
                  <td className="py-2 pr-3">{p.download_count}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={p.status === "failed"}
                        onClick={() => void download(p.id)}
                      >
                        Download
                      </Button>
                      {p.generation_error ? (
                        <span className="text-xs text-destructive">{p.generation_error}</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!payslips.length && !loading ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    No payslips for this month. Approve/lock payroll, then generate.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
