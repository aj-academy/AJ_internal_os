"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ADDITION_TYPES, DEDUCTION_TYPES } from "@/lib/hr/salaryAdjustments";

type Emp = { id: string; full_name: string | null; email: string | null };
type Adj = {
  id: string;
  employee_id: string;
  year: number;
  month: number;
  adjustment_type: string;
  direction: string;
  amount: number;
  reason: string;
  status: string;
  review_remarks: string | null;
  created_at: string;
};

const inputClass = "h-9 rounded-lg border border-[#e8dcc8] bg-white px-2 text-sm text-[#3d3428]";

function labelType(t: string) {
  return t.replace(/_/g, " ");
}

export function SalaryAdjustmentsWorkbench() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [adjustments, setAdjustments] = useState<Adj[]>([]);
  const [migrationRequired, setMigrationRequired] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [employeeId, setEmployeeId] = useState("");
  const [adjustmentType, setAdjustmentType] = useState<string>(ADDITION_TYPES[0]);
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ year: String(year), month: String(month) });
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/hr/payroll/adjustments?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setAdjustments(json.adjustments ?? []);
      setEmployees(json.employees ?? []);
      setMigrationRequired(json.migrationRequired ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [year, month, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/hr/payroll/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, year, month, adjustmentType, amount, reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create");
      setOkMsg("Adjustment created as pending. It will not affect payroll until approved, then recalculated.");
      setReason("");
      setAmount(0);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  const review = async (id: string, action: "approve" | "reject" | "cancel") => {
    setError(null);
    setOkMsg(null);
    try {
      const remarks =
        action === "reject" ? (window.prompt("Rejection remarks (optional):") ?? undefined) : undefined;
      const res = await fetch("/api/hr/payroll/adjustments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, remarks }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update");
      setOkMsg(json.note || `Adjustment ${action}d.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    }
  };

  const empName = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e?.full_name ?? e?.email ?? id.slice(0, 8);
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        kicker="HR, Attendance & Payroll"
        title="Salary Adjustments"
        description="One-time additions and deductions for a payroll month. Pending adjustments never affect net salary. Approve, then recalculate Monthly Payroll to include them."
      />

      {migrationRequired ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Migration required: <code className="font-mono">{migrationRequired}</code>
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
          <CardTitle>Add adjustment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Year
            <input
              type="number"
              className={inputClass}
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
            Employee
            <select className={inputClass} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Select…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name ?? e.email}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Type
            <select className={inputClass} value={adjustmentType} onChange={(e) => setAdjustmentType(e.target.value)}>
              <optgroup label="Additions">
                {ADDITION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {labelType(t)}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Deductions">
                {DEDUCTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {labelType(t)}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Amount
            <input
              type="number"
              min={0.01}
              step={0.01}
              className={inputClass}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground sm:col-span-2">
            Reason (required)
            <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="flex items-end justify-end sm:col-span-2 lg:col-span-3">
            <Button size="sm" onClick={() => void create()} disabled={saving || !!migrationRequired}>
              {saving ? "Saving…" : "Create pending adjustment"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Status filter
            <select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adjustments ({adjustments.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-[#e8dcc8] text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Employee</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Dir</th>
                <th className="py-2 pr-3">Amount</th>
                <th className="py-2 pr-3">Reason</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map((a) => (
                <tr key={a.id} className="border-b border-[#f0e9db]">
                  <td className="py-2 pr-3">{empName(a.employee_id)}</td>
                  <td className="py-2 pr-3 capitalize">{labelType(a.adjustment_type)}</td>
                  <td className="py-2 pr-3 capitalize">{a.direction}</td>
                  <td className="py-2 pr-3">{Number(a.amount).toLocaleString()}</td>
                  <td className="max-w-48 truncate py-2 pr-3" title={a.reason}>
                    {a.reason}
                  </td>
                  <td className="py-2 pr-3 capitalize">{a.status}</td>
                  <td className="py-2 pr-3">
                    {a.status === "pending" ? (
                      <div className="flex gap-2">
                        <Button size="xs" onClick={() => void review(a.id, "approve")}>
                          Approve
                        </Button>
                        <Button size="xs" variant="destructive" onClick={() => void review(a.id, "reject")}>
                          Reject
                        </Button>
                        <Button size="xs" variant="outline" onClick={() => void review(a.id, "cancel")}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{a.review_remarks ?? "—"}</span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && adjustments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                    No adjustments for this filter.
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
