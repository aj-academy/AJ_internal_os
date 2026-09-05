"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminEmployeeProfileView } from "@/components/admin/AdminEmployeeProfileView";

type Emp = {
  id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  role?: string | null;
};
type Structure = {
  id: string;
  employee_id: string;
  salary_type: string;
  payroll_status: string;
  effective_from: string;
  effective_to: string | null;
  monthly_gross: number;
  basic_salary: number;
  hra: number;
  special_allowance: number;
  travel_allowance: number;
  communication_allowance: number;
  incentive: number;
  other_allowances: number;
  fixed_deductions: number;
  change_reason: string | null;
};
type ProfileBank = {
  profile_id: string;
  bank_ready: boolean;
  pan_ready: boolean;
  ready_for_payout: boolean;
  has_uan: boolean;
  has_esi: boolean;
  profile_completion: number;
  missing: string[];
};

function inr(amount: number): string {
  return "₹" + amount.toLocaleString("en-IN");
}

const inputClass = "h-9 rounded-lg border border-[#e8dcc8] bg-white px-2 text-sm text-[#3d3428]";

const emptyForm = {
  salaryType: "monthly",
  payrollStatus: "active",
  effectiveFrom: new Date().toISOString().slice(0, 10),
  monthlyGross: 0,
  annualCtc: "" as number | "",
  basicSalary: 0,
  hra: 0,
  specialAllowance: 0,
  travelAllowance: 0,
  communicationAllowance: 0,
  incentive: 0,
  otherAllowances: 0,
  fixedDeductions: 0,
  changeReason: "",
  notes: "",
  uanNumber: "",
  esiNumber: "",
};

export function SalaryStructureWorkbench() {
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [openStructures, setOpenStructures] = useState<Structure[]>([]);
  const [profileBank, setProfileBank] = useState<ProfileBank[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [history, setHistory] = useState<Structure[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [migrationRequired, setMigrationRequired] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [viewProfileId, setViewProfileId] = useState<string | null>(null);

  const bankMap = useMemo(() => new Map(profileBank.map((b) => [b.profile_id, b])), [profileBank]);
  const selectedBank = employeeId ? bankMap.get(employeeId) : undefined;

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/salary/structures", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setEmployees(json.employees ?? []);
      setOpenStructures(json.openStructures ?? []);
      setProfileBank(json.profileBank ?? []);
      if (json.migrationRequired) setMigrationRequired(json.migrationRequired);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEmployee = useCallback(async (id: string) => {
    if (!id) return;
    setError(null);
    try {
      const res = await fetch(`/api/hr/salary/structures?employeeId=${id}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setHistory(json.history ?? []);
      setMigrationRequired(json.migrationRequired ?? null);
      const active = json.active as Structure | null;
      if (active) {
        setForm((f) => ({
          ...f,
          salaryType: active.salary_type,
          payrollStatus: active.payroll_status,
          monthlyGross: Number(active.monthly_gross) || 0,
          basicSalary: Number(active.basic_salary) || 0,
          hra: Number(active.hra) || 0,
          specialAllowance: Number(active.special_allowance) || 0,
          travelAllowance: Number(active.travel_allowance) || 0,
          communicationAllowance: Number(active.communication_allowance) || 0,
          incentive: Number(active.incentive) || 0,
          otherAllowances: Number(active.other_allowances) || 0,
          fixedDeductions: Number(active.fixed_deductions) || 0,
          changeReason: "",
        }));
      } else {
        setForm({ ...emptyForm });
      }
      if (json.statutoryIds) {
        setForm((f) => ({
          ...f,
          uanNumber: json.statutoryIds.uan_number ?? "",
          esiNumber: json.statutoryIds.esi_number ?? "",
        }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load employee");
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (employeeId) void loadEmployee(employeeId);
  }, [employeeId, loadEmployee]);

  const set = <K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      if (!employeeId) throw new Error("Select an employee.");
      if (!form.changeReason.trim()) throw new Error("Change reason is required.");
      const res = await fetch("/api/hr/salary/structures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, ...form }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save");
      setOkMsg("New salary structure version published. Previous open version was closed with an effective end date.");
      await loadList();
      await loadEmployee(employeeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const openMap = new Map(openStructures.map((s) => [s.employee_id, s]));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        kicker="HR, Attendance & Payroll"
        title="Employee Salary Structure"
        description="Effective-dated salary structures for employees and freelancers. Publishing a revision closes the previous version — historical payroll stays reproducible. Change reason is mandatory."
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
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Employee / Freelancer
            <select
              className={`${inputClass} min-w-64`}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">Select person…</option>
              {employees.map((e) => {
                const bank = bankMap.get(e.id);
                const roleTag = e.role === "freelancer" ? " · freelancer" : "";
                const bankTag = bank?.ready_for_payout ? "" : " · bank incomplete";
                return (
                  <option key={e.id} value={e.id}>
                    {e.full_name ?? e.email}
                    {roleTag}
                    {openMap.has(e.id) ? "" : " · no structure"}
                    {bankTag}
                  </option>
                );
              })}
            </select>
          </label>
          <Button size="sm" variant="outline" onClick={() => void loadList()} disabled={loading}>
            Refresh list
          </Button>
          {employeeId ? (
            <Button size="sm" variant="outline" onClick={() => setViewProfileId(employeeId)}>
              View profile
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {employees.length} people · {openStructures.length} with active structure
          </p>
        </CardContent>
      </Card>

      {employeeId && selectedBank ? (
        <div
          className={[
            "rounded-lg border px-3 py-2 text-sm",
            selectedBank.ready_for_payout
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : "border-amber-300 bg-amber-50 text-amber-900",
          ].join(" ")}
        >
          {selectedBank.ready_for_payout
            ? "Bank & PAN ready for payout."
            : `Bank/KYC incomplete for payroll payout: ${selectedBank.missing.join(", ") || "missing fields"}. Ask the person to complete My Profile → Bank & Compliance.`}
          {selectedBank.has_uan ? " · UAN on file" : " · UAN missing"}
          {selectedBank.has_esi ? " · ESI on file" : " · ESI missing"}
          {` · profile ${selectedBank.profile_completion}%`}
        </div>
      ) : null}

      {employeeId ? (
        <Card>
          <CardHeader>
            <CardTitle>Publish structure version</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Effective from
              <input
                type="date"
                className={inputClass}
                value={form.effectiveFrom}
                onChange={(e) => set("effectiveFrom", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Salary type
              <select className={inputClass} value={form.salaryType} onChange={(e) => set("salaryType", e.target.value)}>
                <option value="monthly">Monthly</option>
                <option value="daily">Daily wage</option>
                <option value="hourly">Hourly</option>
                <option value="intern_stipend">Intern stipend</option>
                <option value="consultant">Consultant</option>
                <option value="commission">Commission</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Payroll status
              <select
                className={inputClass}
                value={form.payrollStatus}
                onChange={(e) => set("payrollStatus", e.target.value)}
              >
                <option value="active">Active</option>
                <option value="on_hold">On hold</option>
                <option value="excluded">Excluded</option>
              </select>
            </label>

            {(
              [
                ["monthlyGross", "Monthly gross"],
                ["basicSalary", "Basic"],
                ["hra", "HRA"],
                ["specialAllowance", "Special allowance"],
                ["travelAllowance", "Travel allowance"],
                ["communicationAllowance", "Communication allowance"],
                ["incentive", "Incentive"],
                ["otherAllowances", "Other allowances"],
                ["fixedDeductions", "Fixed deductions"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                {label}
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={form[key] as number}
                  onChange={(e) => set(key, Number(e.target.value))}
                />
              </label>
            ))}

            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              UAN number
              <input className={inputClass} value={form.uanNumber} onChange={(e) => set("uanNumber", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              ESI number
              <input className={inputClass} value={form.esiNumber} onChange={(e) => set("esiNumber", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground sm:col-span-2">
              Change reason (required)
              <input
                className={inputClass}
                value={form.changeReason}
                onChange={(e) => set("changeReason", e.target.value)}
                placeholder="e.g. Annual revision FY26"
              />
            </label>

            <div className="flex justify-end sm:col-span-2 lg:col-span-3">
              <Button size="sm" onClick={() => void save()} disabled={saving || !!migrationRequired}>
                {saving ? "Saving…" : "Publish new version"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {employeeId ? (
        <Card>
          <CardHeader>
            <CardTitle>Structure history ({history.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-[#e8dcc8] text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">From</th>
                  <th className="py-2 pr-3">To</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Gross</th>
                  <th className="py-2 pr-3">Basic</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Reason</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-[#f0e9db]">
                    <td className="py-2 pr-3">{h.effective_from}</td>
                    <td className="py-2 pr-3">
                      {h.effective_to ?? (
                        <span className="rounded bg-[#faf3e3] px-1.5 py-0.5 text-[10px] font-semibold text-[#a68b2e]">
                          ACTIVE
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{h.salary_type}</td>
                    <td className="py-2 pr-3">{inr(Number(h.monthly_gross))}</td>
                    <td className="py-2 pr-3">{inr(Number(h.basic_salary))}</td>
                    <td className="py-2 pr-3">{h.payroll_status}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{h.change_reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      {viewProfileId ? (
        <AdminEmployeeProfileView profileId={viewProfileId} onClose={() => setViewProfileId(null)} />
      ) : null}
    </div>
  );
}
