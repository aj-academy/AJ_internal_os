"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { downloadUrlInSameWindow } from "@/lib/browser/sameWindowDownload";

type Payslip = {
  id: string;
  payslip_number: string;
  year: number;
  month: number;
  status: string;
  released_at: string | null;
  snapshot?: {
    net?: number;
    monthLabel?: string;
  } | null;
};

const MONTHS = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function MyPayslipsWorkbench() {
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [migrationRequired, setMigrationRequired] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/payslips", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load payslips");
      setPayslips(json.payslips ?? []);
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

  const download = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/hr/payslips?downloadId=${id}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Download failed");
      if (json.signedUrl) {
        await downloadUrlInSameWindow(json.signedUrl, `${json.payslipNumber || id}.pdf`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        kicker="My HR & Payroll"
        title="My Payslips"
        description="Download released payslips. Links expire quickly for security."
      />

      {migrationRequired ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Payslips are not available yet. Ask HR to finish payroll setup.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Released payslips</CardTitle>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#e8dcc8] text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Period</th>
                <th className="py-2 pr-3 font-medium">Payslip #</th>
                <th className="py-2 pr-3 font-medium">Net</th>
                <th className="py-2 pr-3 font-medium">Released</th>
                <th className="py-2 font-medium">Download</th>
              </tr>
            </thead>
            <tbody>
              {payslips.map((p) => (
                <tr key={p.id} className="border-b border-[#f0e6d6]">
                  <td className="py-2 pr-3">
                    {MONTHS[p.month] || p.month} {p.year}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{p.payslip_number}</td>
                  <td className="py-2 pr-3">
                    {p.snapshot?.net != null
                      ? `₹${Number(p.snapshot.net).toLocaleString("en-IN")}`
                      : "—"}
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {p.released_at ? new Date(p.released_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-2">
                    <Button size="xs" onClick={() => void download(p.id)}>
                      PDF
                    </Button>
                  </td>
                </tr>
              ))}
              {!payslips.length && !loading ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                    No released payslips yet.
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
