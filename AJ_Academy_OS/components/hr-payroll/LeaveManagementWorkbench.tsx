"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type LeaveType = {
  id: string;
  code: string;
  name: string;
  is_paid: boolean;
  annual_entitlement: number;
  monthly_accrual: number;
  carry_forward_allowed: boolean;
  max_carry_forward: number;
  min_notice_days: number;
  requires_document: boolean;
  allows_half_day: boolean;
  allow_negative_balance: boolean;
  counts_as_presence: boolean;
  is_active: boolean;
  sort_order: number;
};

type Application = {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  is_half_day: boolean;
  total_days: number;
  reason: string;
  status: string;
  applied_at: string;
  review_remarks: string | null;
  leave_types: { code: string; name: string; is_paid: boolean } | null;
};

type EmployeeLite = { id: string; full_name: string | null; email: string | null };

const inputClass = "h-9 rounded-lg border border-[#e8dcc8] bg-white px-2 text-sm text-[#3d3428]";

export function LeaveManagementWorkbench() {
  const [tab, setTab] = useState<"requests" | "types">("requests");
  const [year, setYear] = useState(new Date().getFullYear());
  const [statusFilter, setStatusFilter] = useState("pending");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [applications, setApplications] = useState<Application[]>([]);
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [migrationRequired, setMigrationRequired] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [savingTypeId, setSavingTypeId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ year: String(year) });
      if (statusFilter) params.set("status", statusFilter);
      if (employeeFilter) params.set("employeeId", employeeFilter);
      const [appsRes, typesRes] = await Promise.all([
        fetch(`/api/hr/leave/applications?${params}`, { cache: "no-store" }),
        fetch("/api/hr/leave/types", { cache: "no-store" }),
      ]);
      const appsJson = await appsRes.json();
      const typesJson = await typesRes.json();
      if (!appsRes.ok) throw new Error(appsJson.error || "Failed to load applications");
      if (!typesRes.ok) throw new Error(typesJson.error || "Failed to load types");
      setApplications(appsJson.applications ?? []);
      setEmployees(appsJson.employees ?? []);
      setTypes(typesJson.types ?? []);
      setMigrationRequired(appsJson.migrationRequired ?? typesJson.migrationRequired ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [year, statusFilter, employeeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (id: string, action: "approve" | "reject") => {
    setError(null);
    setOkMsg(null);
    const remarks = action === "reject" ? (window.prompt("Rejection remarks (optional):") ?? undefined) : undefined;
    try {
      const res = await fetch("/api/hr/leave/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, remarks }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update");
      setOkMsg(`Application ${action === "approve" ? "approved (balance updated)" : "rejected"}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    }
  };

  const setType = (id: string, patch: Partial<LeaveType>) => {
    setTypes((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const saveType = async (t: LeaveType) => {
    setSavingTypeId(t.id);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/hr/leave/types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: t.id,
          name: t.name,
          annualEntitlement: t.annual_entitlement,
          monthlyAccrual: t.monthly_accrual,
          maxCarryForward: t.max_carry_forward,
          minNoticeDays: t.min_notice_days,
          isPaid: t.is_paid,
          carryForwardAllowed: t.carry_forward_allowed,
          requiresDocument: t.requires_document,
          allowsHalfDay: t.allows_half_day,
          allowNegativeBalance: t.allow_negative_balance,
          countsAsPresence: t.counts_as_presence,
          isActive: t.is_active,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save type");
      setOkMsg(`${t.name} saved.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save type");
    } finally {
      setSavingTypeId(null);
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
        title="Leave Management"
        description="Review and approve leave requests, and configure leave types. Only approved leave affects attendance and payroll. Entitlements default to 0 until configured here — no policy numbers are invented."
      />

      {migrationRequired ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Migration required: run <code className="font-mono">{migrationRequired}</code> in Supabase.
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

      <div className="flex gap-2">
        <Button size="sm" variant={tab === "requests" ? "default" : "outline"} onClick={() => setTab("requests")}>
          Requests
        </Button>
        <Button size="sm" variant={tab === "types" ? "default" : "outline"} onClick={() => setTab("types")}>
          Leave Types
        </Button>
      </div>

      {tab === "requests" ? (
        <>
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
                Status
                <select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">All</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Employee
                <select
                  className={`${inputClass} min-w-48`}
                  value={employeeFilter}
                  onChange={(e) => setEmployeeFilter(e.target.value)}
                >
                  <option value="">All employees</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.full_name ?? e.email ?? e.id}
                    </option>
                  ))}
                </select>
              </label>
              <Button size="sm" onClick={() => void load()} disabled={loading}>
                {loading ? "Loading…" : "Refresh"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Leave requests ({applications.length})</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-[#e8dcc8] text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-3">Employee</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Dates</th>
                    <th className="py-2 pr-3">Days</th>
                    <th className="py-2 pr-3">Reason</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((a) => (
                    <tr key={a.id} className="border-b border-[#f0e9db]">
                      <td className="py-2 pr-3">{empName(a.employee_id)}</td>
                      <td className="py-2 pr-3">
                        {a.leave_types?.name ?? "—"}{" "}
                        <span className="text-xs text-muted-foreground">
                          ({a.leave_types?.is_paid ? "paid" : "unpaid"})
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        {a.start_date}
                        {a.end_date !== a.start_date ? ` → ${a.end_date}` : ""}
                        {a.is_half_day ? " (half day)" : ""}
                      </td>
                      <td className="py-2 pr-3">{a.total_days}</td>
                      <td className="max-w-56 truncate py-2 pr-3" title={a.reason}>
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
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">{a.review_remarks ?? "—"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!loading && applications.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                        No leave requests match the filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Leave types ({types.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="border-b border-[#e8dcc8] text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Paid</th>
                  <th className="py-2 pr-3">Annual days</th>
                  <th className="py-2 pr-3">Notice (days)</th>
                  <th className="py-2 pr-3">Carry fwd</th>
                  <th className="py-2 pr-3">Half day</th>
                  <th className="py-2 pr-3">Doc reqd</th>
                  <th className="py-2 pr-3">Negative ok</th>
                  <th className="py-2 pr-3">Active</th>
                  <th className="py-2 pr-3">Save</th>
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.id} className="border-b border-[#f0e9db]">
                    <td className="py-2 pr-3 font-mono text-xs">{t.code}</td>
                    <td className="py-2 pr-3">
                      <input
                        className={`${inputClass} w-44`}
                        value={t.name}
                        onChange={(e) => setType(t.id, { name: e.target.value })}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={t.is_paid}
                        onChange={(e) => setType(t.id, { is_paid: e.target.checked })}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        className={`${inputClass} w-20`}
                        value={t.annual_entitlement}
                        onChange={(e) => setType(t.id, { annual_entitlement: Number(e.target.value) })}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        min={0}
                        className={`${inputClass} w-16`}
                        value={t.min_notice_days}
                        onChange={(e) => setType(t.id, { min_notice_days: Number(e.target.value) })}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={t.carry_forward_allowed}
                        onChange={(e) => setType(t.id, { carry_forward_allowed: e.target.checked })}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={t.allows_half_day}
                        onChange={(e) => setType(t.id, { allows_half_day: e.target.checked })}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={t.requires_document}
                        onChange={(e) => setType(t.id, { requires_document: e.target.checked })}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={t.allow_negative_balance}
                        onChange={(e) => setType(t.id, { allow_negative_balance: e.target.checked })}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={t.is_active}
                        onChange={(e) => setType(t.id, { is_active: e.target.checked })}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Button size="xs" onClick={() => void saveType(t)} disabled={savingTypeId === t.id}>
                        {savingTypeId === t.id ? "Saving…" : "Save"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted-foreground">
              &quot;WFH&quot; (counts as presence) gives attendance credit without burning a leave balance. Unpaid types
              never require a balance. Annual entitlements start at 0 — configure them before employees apply for paid
              leave.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
