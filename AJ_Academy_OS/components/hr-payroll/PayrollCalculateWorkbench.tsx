"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkflowAction } from "@/lib/hr/payrollWorkflow";

type Item = {
  id: string;
  employee_id: string;
  status: string;
  payable_days: number;
  present_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  absent_days: number;
  gross_earnings: number;
  total_deductions: number;
  net_salary: number;
  error_message: string | null;
  employee: { full_name: string | null; department: string | null } | null;
};

type Period = {
  id: string;
  status: string;
  calculation_version: number;
  approved_at?: string | null;
  locked_at?: string | null;
  reopen_reason?: string | null;
  payment_reference?: string | null;
};

const inputClass = "h-9 rounded-lg border border-[#e8dcc8] bg-white px-2 text-sm text-[#3d3428]";

const STATUS_STEPS = [
  "draft",
  "attendance_review",
  "pending_adjustments",
  "calculated",
  "pending_review",
  "approved",
  "locked",
  "paid",
];

export function PayrollCalculateWorkbench() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [period, setPeriod] = useState<Period | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [bounds, setBounds] = useState<{ periodStart: string; periodEnd: string } | null>(null);
  const [migrationRequired, setMigrationRequired] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    employees: number;
    calculated: number;
    errors: number;
    excluded: number;
    totalGross: number;
    totalNet: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/hr/payroll/calculate?year=${year}&month=${month}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setPeriod(json.period);
      setItems(json.items ?? []);
      setBounds(json.bounds);
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

  const run = async () => {
    setRunning(true);
    setError(null);
    setOkMsg(null);
    setSummary(null);
    try {
      const res = await fetch("/api/hr/payroll/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Calculation failed");
      setSummary(json.summary);
      setOkMsg(
        `Payroll calculated. ${json.summary.calculated} ok · ${json.summary.errors} errors · ${json.summary.excluded} excluded.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Calculation failed");
    } finally {
      setRunning(false);
    }
  };

  const workflow = async (action: WorkflowAction) => {
    setWorkflowBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      let reason: string | undefined;
      let paymentReference: string | undefined;
      if (action === "reopen" || action === "cancel") {
        reason = window.prompt(action === "reopen" ? "Reopen reason (required):" : "Cancel reason (optional):") ?? undefined;
        if (action === "reopen" && !reason?.trim()) throw new Error("Reopen reason is required.");
      }
      if (action === "mark_paid") {
        paymentReference = window.prompt("Payment reference (optional):") ?? undefined;
      }
      const res = await fetch("/api/hr/payroll/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, action, reason, paymentReference }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Workflow action failed");
      setOkMsg(`Status: ${json.from} → ${json.to}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Workflow action failed");
    } finally {
      setWorkflowBusy(false);
    }
  };

  const status = period?.status ?? "draft";
  const canCalc = !period || ["draft", "attendance_review", "pending_adjustments", "calculated", "pending_review", "reopened"].includes(status);
  const errorCount = items.filter((i) => i.status === "error").length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        kicker="HR, Attendance & Payroll"
        title="Monthly Payroll"
        description="Calculate from live attendance/leave/salary data, then move through review → approve → lock → paid. Locked payroll cannot change until a Super Admin reopens it with a reason."
      />

      {migrationRequired ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Migration required: run payroll SQL through <code className="font-mono">hr_payroll_08_10_workflow_adjustments.sql</code>.
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
          <Button size="sm" onClick={() => void run()} disabled={running || !!migrationRequired || !canCalc}>
            {running ? "Calculating…" : period ? "Recalculate" : "Calculate payroll"}
          </Button>
          {bounds ? (
            <p className="text-xs text-muted-foreground">
              {bounds.periodStart} → {bounds.periodEnd}
              {period ? ` · ${status} · v${period.calculation_version}` : " · no period yet"}
              {errorCount ? ` · ${errorCount} employee error(s)` : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workflow</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_STEPS.map((s) => (
              <span
                key={s}
                className={[
                  "rounded-lg border px-2 py-1 text-[11px] font-medium capitalize",
                  status === s
                    ? "border-[#c9a227] bg-[#faf3e3] text-[#3d3428]"
                    : "border-[#e8dcc8] text-muted-foreground",
                ].join(" ")}
              >
                {s.replace(/_/g, " ")}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="xs"
              variant="outline"
              disabled={workflowBusy || !period}
              onClick={() => void workflow("mark_attendance_review")}
            >
              Attendance review
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={workflowBusy || !period}
              onClick={() => void workflow("mark_pending_adjustments")}
            >
              Pending adjustments
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={workflowBusy || status !== "calculated"}
              onClick={() => void workflow("submit_for_review")}
            >
              Submit for review
            </Button>
            <Button
              size="xs"
              disabled={workflowBusy || status !== "pending_review"}
              onClick={() => void workflow("approve")}
            >
              Approve
            </Button>
            <Button
              size="xs"
              disabled={workflowBusy || status !== "approved"}
              onClick={() => void workflow("lock")}
            >
              Lock
            </Button>
            <Button
              size="xs"
              disabled={workflowBusy || status !== "locked"}
              onClick={() => void workflow("mark_paid")}
            >
              Mark paid
            </Button>
            <Button
              size="xs"
              variant="destructive"
              disabled={workflowBusy || !period || !["approved", "locked", "paid", "pending_review", "cancelled"].includes(status)}
              onClick={() => void workflow("reopen")}
            >
              Reopen (super admin)
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={workflowBusy || !period || ["locked", "paid"].includes(status)}
              onClick={() => void workflow("cancel")}
            >
              Cancel
            </Button>
            {["approved", "locked", "paid"].includes(status) ? (
              <a
                href={`/admin/hr-payroll/payslips?year=${year}&month=${month}`}
                className="inline-flex h-7 items-center rounded-lg border border-[#e8dcc8] px-2 text-[11px] font-medium text-[#3d3428] hover:bg-[#faf3e3]"
              >
                Open payslips →
              </a>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Approve requires zero calculation errors. Lock freezes amounts. Reopen requires Super Admin + reason and
            returns the period to draft for recalculation.
            {period?.reopen_reason ? ` Last reopen reason: ${period.reopen_reason}` : ""}
          </p>
        </CardContent>
      </Card>

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card size="sm">
            <CardContent className="pt-3">
              <p className="text-xs text-muted-foreground">Calculated</p>
              <p className="text-2xl font-semibold">{summary.calculated}</p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="pt-3">
              <p className="text-xs text-muted-foreground">Errors</p>
              <p className="text-2xl font-semibold">{summary.errors}</p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="pt-3">
              <p className="text-xs text-muted-foreground">Total gross</p>
              <p className="text-2xl font-semibold">{summary.totalGross.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="pt-3">
              <p className="text-xs text-muted-foreground">Total net</p>
              <p className="text-2xl font-semibold">{summary.totalNet.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Payroll items ({items.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-[#e8dcc8] text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Employee</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Present</th>
                <th className="py-2 pr-3">Paid leave</th>
                <th className="py-2 pr-3">Unpaid / Absent</th>
                <th className="py-2 pr-3">Payable</th>
                <th className="py-2 pr-3">Gross</th>
                <th className="py-2 pr-3">Deductions</th>
                <th className="py-2 pr-3">Net</th>
                <th className="py-2 pr-3">Error</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b border-[#f0e9db]">
                  <td className="py-2 pr-3">{i.employee?.full_name ?? i.employee_id.slice(0, 8)}</td>
                  <td className="py-2 pr-3 capitalize">{i.status}</td>
                  <td className="py-2 pr-3">{i.present_days}</td>
                  <td className="py-2 pr-3">{i.paid_leave_days}</td>
                  <td className="py-2 pr-3">
                    {i.unpaid_leave_days} / {i.absent_days}
                  </td>
                  <td className="py-2 pr-3">{i.payable_days}</td>
                  <td className="py-2 pr-3">{Number(i.gross_earnings).toLocaleString()}</td>
                  <td className="py-2 pr-3">{Number(i.total_deductions).toLocaleString()}</td>
                  <td className="py-2 pr-3 font-semibold">{Number(i.net_salary).toLocaleString()}</td>
                  <td className="max-w-48 truncate py-2 pr-3 text-xs text-destructive" title={i.error_message ?? ""}>
                    {i.error_message ?? "—"}
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-6 text-center text-sm text-muted-foreground">
                    No payroll items yet. Run Calculate for this month.
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
