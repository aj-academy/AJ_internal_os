"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkflowAction } from "@/lib/hr/payrollWorkflow";
import { AdminEmployeeProfileView } from "@/components/admin/AdminEmployeeProfileView";

type Item = {
  id: string;
  employee_id: string;
  status: string;
  calendar_days: number;
  working_days: number;
  weekly_offs: number;
  holidays: number;
  present_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  half_days: number;
  absent_days: number;
  missing_attendance_days: number;
  payable_days: number;
  overtime_hours: number;
  earned_basic: number;
  earned_hra: number;
  earned_allowances: number;
  incentives: number;
  bonus: number;
  overtime_amount: number;
  reimbursements: number;
  arrears: number;
  other_earnings: number;
  gross_earnings: number;
  loss_of_pay: number;
  absence_deduction: number;
  late_deduction: number;
  fixed_deductions: number;
  advance_recovery: number;
  loan_recovery: number;
  penalty: number;
  statutory_deductions: number;
  other_deductions: number;
  total_deductions: number;
  net_salary: number;
  error_message: string | null;
  component_breakdown: Record<string, unknown> | null;
  bank_ready?: boolean;
  ready_for_payout?: boolean;
  employee: { full_name: string | null; department: string | null; designation?: string | null; role?: string | null } | null;
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

type Summary = {
  employees: number;
  calculated: number;
  errors: number;
  excluded: number;
  totalGross: number;
  totalNet: number;
};

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function inr(amount: number): string {
  return "₹" + amount.toLocaleString("en-IN");
}

function fmtStatus(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusColor(s: string): string {
  if (s === "paid") return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (s === "locked") return "bg-blue-100 text-blue-800 border-blue-300";
  if (s === "approved") return "bg-indigo-100 text-indigo-800 border-indigo-300";
  if (s === "pending_review") return "bg-amber-100 text-amber-800 border-amber-300";
  if (s === "calculated") return "bg-sky-100 text-sky-800 border-sky-300";
  if (s === "cancelled") return "bg-rose-100 text-rose-800 border-rose-300";
  return "bg-[#faf3e3] text-[#3d3428] border-[#e8dcc8]";
}

function itemStatusColor(s: string): string {
  if (s === "calculated") return "bg-emerald-100 text-emerald-800";
  if (s === "error") return "bg-rose-100 text-rose-800";
  if (s === "excluded") return "bg-slate-100 text-slate-600";
  return "bg-slate-100 text-slate-600";
}

const STATUS_STEPS = [
  "draft", "attendance_review", "pending_adjustments", "calculated",
  "pending_review", "approved", "locked", "paid",
];

const inputClass = "h-9 rounded-lg border border-[#e8dcc8] bg-white px-2 text-sm text-[#3d3428]";

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
  const [viewProfileId, setViewProfileId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [drawerItem, setDrawerItem] = useState<Item | null>(null);
  const [prevItems, setPrevItems] = useState<Item[]>([]);

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
      // Fetch previous month for comparison
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      const prevRes = await fetch(`/api/hr/payroll/calculate?year=${prevYear}&month=${prevMonth}`, { cache: "no-store" });
      if (prevRes.ok) {
        const prevJson = await prevRes.json();
        setPrevItems(prevJson.items ?? []);
      } else {
        setPrevItems([]);
      }
      // Derive summary from loaded items if not already set
      if (json.items?.length) {
        const its: Item[] = json.items;
        setSummary({
          employees: its.length,
          calculated: its.filter((i) => i.status === "calculated").length,
          errors: its.filter((i) => i.status === "error").length,
          excluded: its.filter((i) => i.status === "excluded").length,
          totalGross: its.reduce((s, i) => s + Number(i.gross_earnings || 0), 0),
          totalNet: its.reduce((s, i) => s + Number(i.net_salary || 0), 0),
        });
      } else {
        setSummary(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { void load(); }, [load]);

  const run = async () => {
    setRunning(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/hr/payroll/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Calculation failed");
      setSummary(json.summary);
      setOkMsg(`Payroll calculated. ${json.summary.calculated} ok · ${json.summary.errors} errors · ${json.summary.excluded} excluded.`);
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
      setOkMsg(`Status: ${fmtStatus(json.from)} → ${fmtStatus(json.to)}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Workflow action failed");
    } finally {
      setWorkflowBusy(false);
    }
  };

  const status = period?.status ?? "draft";
  const isLocked = ["locked", "paid"].includes(status);
  const canCalc = !period || ["draft", "attendance_review", "pending_adjustments", "calculated", "pending_review", "reopened"].includes(status);
  const errorCount = items.filter((i) => i.status === "error").length;
  const missingBank = items.filter((i) => i.ready_for_payout === false).length;
  const totalLop = items.reduce((s, i) => s + Number(i.loss_of_pay || 0), 0);

  // Departments for filter
  const departments = Array.from(new Set(items.map((i) => i.employee?.department).filter(Boolean))) as string[];

  const filtered = items.filter((i) => {
    const name = (i.employee?.full_name ?? "").toLowerCase();
    const dept = (i.employee?.department ?? "").toLowerCase();
    const q = search.toLowerCase();
    const matchSearch = !q || name.includes(q);
    const matchDept = !deptFilter || dept === deptFilter.toLowerCase();
    return matchSearch && matchDept;
  });

  const periodLabel = `${MONTH_NAMES[month]} ${year}`;

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
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      ) : null}
      {okMsg ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{okMsg}</div>
      ) : null}

      {/* ── Period selector + status banner ── */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Payroll Period</span>
              <div className="flex gap-2">
                <select
                  className={`${inputClass} w-36`}
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                >
                  {MONTH_NAMES.slice(1).map((name, i) => (
                    <option key={i + 1} value={i + 1}>{name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  className={`${inputClass} w-24`}
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                />
              </div>
            </div>

            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </Button>
            <Button size="sm" onClick={() => void run()} disabled={running || !!migrationRequired || !canCalc}>
              {running ? "Calculating…" : period ? "Recalculate" : "Calculate payroll"}
            </Button>

            {/* Status badge */}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">{periodLabel}</span>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusColor(status)}`}>
                {fmtStatus(status)}
              </span>
              {period ? (
                <span className="text-[11px] text-muted-foreground">v{period.calculation_version}</span>
              ) : null}
              {errorCount > 0 ? (
                <span className="rounded-full bg-rose-100 border border-rose-300 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
                  {errorCount} error{errorCount > 1 ? "s" : ""}
                </span>
              ) : null}
            </div>
          </div>

          {bounds ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Period: {bounds.periodStart} → {bounds.periodEnd}
              {isLocked ? " · 🔒 Locked — recalculation blocked" : ""}
              {period?.reopen_reason ? ` · Last reopen: ${period.reopen_reason}` : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* ── KPI Cards — always visible once items loaded ── */}
      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <Card size="sm">
            <CardContent className="pt-3">
              <p className="text-xs text-muted-foreground">Employees</p>
              <p className="text-2xl font-semibold">{summary.employees}</p>
              <p className="text-[11px] text-muted-foreground">{summary.calculated} calculated · {summary.excluded} excluded</p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="pt-3">
              <p className="text-xs text-muted-foreground">Gross Payroll</p>
              <p className="text-2xl font-semibold">{inr(summary.totalGross)}</p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="pt-3">
              <p className="text-xs text-muted-foreground">Total Deductions</p>
              <p className="text-2xl font-semibold">{inr(summary.totalGross - summary.totalNet)}</p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="pt-3">
              <p className="text-xs text-muted-foreground">Net Payroll</p>
              <p className="text-2xl font-semibold text-emerald-700">{inr(summary.totalNet)}</p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="pt-3">
              <p className="text-xs text-muted-foreground">LOP Deduction</p>
              <p className="text-2xl font-semibold text-rose-700">{inr(totalLop)}</p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="pt-3">
              <p className="text-xs text-muted-foreground">Needs Attention</p>
              <p className="text-2xl font-semibold text-amber-700">{errorCount + missingBank}</p>
              <p className="text-[11px] text-muted-foreground">{errorCount} errors · {missingBank} bank incomplete</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* ── Workflow ── */}
      <Card>
        <CardHeader>
          <CardTitle>Workflow</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {/* Progress stepper */}
          <div className="flex flex-wrap gap-1.5">
            {STATUS_STEPS.map((s, idx) => {
              const currentIdx = STATUS_STEPS.indexOf(status);
              const isPast = idx < currentIdx;
              const isCurrent = s === status;
              return (
                <span
                  key={s}
                  className={[
                    "rounded-lg border px-2 py-1 text-[11px] font-medium",
                    isCurrent ? "border-[#c9a227] bg-[#faf3e3] text-[#3d3428] font-semibold" :
                    isPast ? "border-emerald-300 bg-emerald-50 text-emerald-700" :
                    "border-[#e8dcc8] text-muted-foreground",
                  ].join(" ")}
                >
                  {isPast ? "✓ " : ""}{fmtStatus(s)}
                </span>
              );
            })}
          </div>

          {/* Only show valid next-action buttons */}
          <div className="flex flex-wrap gap-2">
            {["draft", "attendance_review", "pending_adjustments", "calculated", "reopened"].includes(status) ? (
              <Button size="xs" variant="outline" disabled={workflowBusy || !period}
                onClick={() => void workflow("mark_attendance_review")}>
                Mark: Attendance Review
              </Button>
            ) : null}
            {["draft", "attendance_review", "calculated", "reopened"].includes(status) ? (
              <Button size="xs" variant="outline" disabled={workflowBusy || !period}
                onClick={() => void workflow("mark_pending_adjustments")}>
                Mark: Pending Adjustments
              </Button>
            ) : null}
            {status === "calculated" ? (
              <Button size="xs" variant="outline" disabled={workflowBusy}
                onClick={() => void workflow("submit_for_review")}>
                Submit for Review
              </Button>
            ) : null}
            {status === "pending_review" ? (
              <Button size="xs" disabled={workflowBusy}
                onClick={() => void workflow("approve")}>
                Approve
              </Button>
            ) : null}
            {status === "approved" ? (
              <Button size="xs" disabled={workflowBusy}
                onClick={() => void workflow("lock")}>
                Lock Payroll
              </Button>
            ) : null}
            {status === "locked" ? (
              <Button size="xs" disabled={workflowBusy}
                onClick={() => void workflow("mark_paid")}>
                Mark as Paid
              </Button>
            ) : null}
            {["approved", "locked", "paid", "pending_review", "cancelled"].includes(status) ? (
              <Button size="xs" variant="destructive" disabled={workflowBusy || !period}
                onClick={() => void workflow("reopen")}>
                Reopen (Super Admin)
              </Button>
            ) : null}
            {!["locked", "paid"].includes(status) && period ? (
              <Button size="xs" variant="outline" disabled={workflowBusy}
                onClick={() => void workflow("cancel")}>
                Cancel
              </Button>
            ) : null}
            {["approved", "locked", "paid"].includes(status) ? (
              <a
                href={`/admin/hr-payroll/payslips?year=${year}&month=${month}`}
                className="inline-flex h-7 items-center rounded-lg border border-[#c9a227] bg-[#faf3e3] px-3 text-[11px] font-semibold text-[#3d3428] hover:bg-[#f5e9c8]"
              >
                Open Payslips →
              </a>
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground">
            Approve requires zero calculation errors. Lock freezes all amounts permanently.
            Reopen requires Super Admin + reason and returns to draft for recalculation.
          </p>
        </CardContent>
      </Card>

      {/* ── Exceptions / Needs Attention ── */}
      {(errorCount > 0 || missingBank > 0) && items.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-amber-800">⚠ Needs Attention ({errorCount + missingBank})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {items.filter((i) => i.status === "error").map((i) => (
              <div key={i.id} className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                <span className="font-semibold shrink-0">Error</span>
                <span className="font-medium">{i.employee?.full_name ?? i.employee_id.slice(0, 8)}</span>
                <span className="text-rose-700">{i.error_message}</span>
              </div>
            ))}
            {items.filter((i) => i.ready_for_payout === false && i.status !== "error").map((i) => (
              <div key={i.id} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <span className="font-semibold shrink-0">Bank Incomplete</span>
                <span className="font-medium">{i.employee?.full_name ?? i.employee_id.slice(0, 8)}</span>
                <span className="text-amber-700">Missing bank/PAN details — ask employee to complete My Profile → Bank &amp; Compliance.</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* ── Payroll Items Table ── */}
      <Card>
        <CardHeader>
          <CardTitle>Payroll Items — {periodLabel} ({filtered.length}{filtered.length !== items.length ? ` of ${items.length}` : ""})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {/* Search + filter */}
          <div className="flex flex-wrap gap-2">
            <input
              className={`${inputClass} w-52`}
              placeholder="Search employee…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className={`${inputClass} w-44`}
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            {(search || deptFilter) ? (
              <Button size="sm" variant="outline" onClick={() => { setSearch(""); setDeptFilter(""); }}>
                Clear
              </Button>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b border-[#e8dcc8] text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Employee</th>
                  <th className="py-2 pr-3">Dept</th>
                  <th className="py-2 pr-3">Bank</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Present</th>
                  <th className="py-2 pr-3">Paid Leave</th>
                  <th className="py-2 pr-3">Unpaid / Absent</th>
                  <th className="py-2 pr-3">Payable</th>
                  <th className="py-2 pr-3">Gross</th>
                  <th className="py-2 pr-3">LOP</th>
                  <th className="py-2 pr-3">Deductions</th>
                  <th className="py-2 pr-3">Net Salary</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => (
                  <tr
                    key={i.id}
                    className={[
                      "border-b border-[#f0e9db]",
                      i.status === "error" ? "bg-rose-50/60" :
                      i.ready_for_payout === false ? "bg-amber-50/40" : "",
                    ].join(" ")}
                  >
                    <td className="py-2 pr-3 font-medium">
                      {i.employee?.full_name ?? i.employee_id.slice(0, 8)}
                      {i.employee?.role === "freelancer" ? (
                        <span className="ml-1 text-[10px] uppercase text-[#64748b]">freelancer</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{i.employee?.department ?? "—"}</td>
                    <td className="py-2 pr-3">
                      {i.ready_for_payout ? (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">Ready</span>
                      ) : (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">Incomplete</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${itemStatusColor(i.status)}`}>
                        {fmtStatus(i.status)}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{i.present_days}</td>
                    <td className="py-2 pr-3">{i.paid_leave_days}</td>
                    <td className="py-2 pr-3">{i.unpaid_leave_days} / {i.absent_days}</td>
                    <td className="py-2 pr-3">{i.payable_days}</td>
                    <td className="py-2 pr-3">{inr(Number(i.gross_earnings))}</td>
                    <td className="py-2 pr-3 text-rose-700">{Number(i.loss_of_pay) > 0 ? inr(Number(i.loss_of_pay)) : "—"}</td>
                    <td className="py-2 pr-3">{inr(Number(i.total_deductions))}</td>
                    <td className="py-2 pr-3 font-semibold text-emerald-700">{inr(Number(i.net_salary))}</td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-1">
                        <Button size="xs" variant="outline" onClick={() => setDrawerItem(i)}>
                          Breakdown
                        </Button>
                        <Button size="xs" variant="outline" onClick={() => setViewProfileId(i.employee_id)}>
                          Profile
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-6 text-center text-sm text-muted-foreground">
                      {items.length === 0
                        ? `No payroll items yet for ${periodLabel}. Run Calculate to begin.`
                        : "No employees match the current filter."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {viewProfileId ? (
        <AdminEmployeeProfileView profileId={viewProfileId} onClose={() => setViewProfileId(null)} />
      ) : null}

      {/* ── Salary Breakdown Drawer ── */}
      {drawerItem ? (
        <SalaryBreakdownDrawer
          item={drawerItem}
          periodLabel={periodLabel}
          prevItem={prevItems.find((p) => p.employee_id === drawerItem.employee_id) ?? null}
          onClose={() => setDrawerItem(null)}
        />
      ) : null}
    </div>
  );
}

