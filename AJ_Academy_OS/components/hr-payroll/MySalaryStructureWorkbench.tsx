"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Structure = {
  id: string;
  salary_type: string;
  payroll_status: string;
  effective_from: string;
  effective_to: string | null;
  monthly_gross: number;
  basic_salary: number;
  hra?: number;
  special_allowance?: number;
  other_allowances?: number;
  fixed_deductions?: number;
  change_reason?: string | null;
};

function money(n: number | null | undefined) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

export function MySalaryStructureWorkbench() {
  const [active, setActive] = useState<Structure | null>(null);
  const [history, setHistory] = useState<Structure[]>([]);
  const [migrationRequired, setMigrationRequired] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/salary/structures", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load salary structure");
      setActive(json.active);
      setHistory(json.history ?? []);
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

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        kicker="My HR & Payroll"
        title="My Salary Structure"
        description="Your current effective salary components. Contact HR if something looks wrong."
      />

      {migrationRequired ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Salary structure data is not available yet.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Current structure</CardTitle>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent>
          {!active ? (
            <p className="text-sm text-muted-foreground">No active salary structure on file.</p>
          ) : (
            <dl className="grid gap-2 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Type</dt>
                <dd className="capitalize">{active.salary_type.replace(/_/g, " ")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Payroll status</dt>
                <dd className="capitalize">{active.payroll_status.replace(/_/g, " ")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Effective from</dt>
                <dd>{active.effective_from}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Monthly gross</dt>
                <dd className="font-medium">{money(active.monthly_gross)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Basic</dt>
                <dd>{money(active.basic_salary)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">HRA</dt>
                <dd>{money(active.hra)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Special allowance</dt>
                <dd>{money(active.special_allowance)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Other allowances</dt>
                <dd>{money(active.other_allowances)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Fixed deductions</dt>
                <dd>{money(active.fixed_deductions)}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#e8dcc8] text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">From</th>
                <th className="py-2 pr-3 font-medium">To</th>
                <th className="py-2 pr-3 font-medium">Gross</th>
                <th className="py-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-[#f0e6d6]">
                  <td className="py-2 pr-3">{h.effective_from}</td>
                  <td className="py-2 pr-3">{h.effective_to || "Current"}</td>
                  <td className="py-2 pr-3">{money(h.monthly_gross)}</td>
                  <td className="py-2 text-muted-foreground">{h.change_reason || "—"}</td>
                </tr>
              ))}
              {!history.length && !loading ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                    No structure history.
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
