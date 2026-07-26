"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Settings = {
  id: string;
  name: string;
  effective_from: string;
  effective_to: string | null;
  company_name: string;
  company_address: string | null;
  company_logo_url: string | null;
  currency: string;
  salary_day_method: string;
  configured_payroll_days: number | null;
  rounding_method: string;
  require_attendance_review_clearance: boolean;
  auto_release_payslips_on_lock: boolean;
  notify_employees_on_release: boolean;
  statutory_enabled: boolean;
  statutory_label: string;
  payslip_number_prefix: string;
  salary_payment_day: number;
};

const inputClass = "h-9 rounded-lg border border-[#e8dcc8] bg-white px-2 text-sm text-[#3d3428]";

export function PayrollSettingsWorkbench() {
  const [rows, setRows] = useState<Settings[]>([]);
  const [active, setActive] = useState<Settings | null>(null);
  const [migrationRequired, setMigrationRequired] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "Payroll settings",
    effectiveFrom: new Date().toISOString().slice(0, 10),
    companyName: "AJ Academy",
    companyAddress: "",
    companyLogoUrl: "",
    currency: "INR",
    salaryDayMethod: "fixed_30",
    configuredPayrollDays: "" as number | "",
    roundingMethod: "nearest_rupee",
    salaryPaymentDay: 1,
    requireAttendanceReviewClearance: true,
    autoReleasePayslipsOnLock: false,
    notifyEmployeesOnRelease: true,
    statutoryEnabled: false,
    statutoryLabel: "not_verified",
    payslipNumberPrefix: "PSL",
    notes: "",
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/hr/payroll/settings", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setRows(json.settings ?? []);
      setActive(json.active ?? null);
      setMigrationRequired(json.migrationRequired ?? null);
      if (json.active) {
        const a = json.active as Settings;
        setForm((f) => ({
          ...f,
          companyName: a.company_name || "AJ Academy",
          companyAddress: a.company_address || "",
          companyLogoUrl: a.company_logo_url || "",
          currency: a.currency || "INR",
          salaryDayMethod: a.salary_day_method || "fixed_30",
          configuredPayrollDays: a.configured_payroll_days ?? "",
          roundingMethod: a.rounding_method || "nearest_rupee",
          salaryPaymentDay: a.salary_payment_day || 1,
          requireAttendanceReviewClearance: a.require_attendance_review_clearance !== false,
          autoReleasePayslipsOnLock: !!a.auto_release_payslips_on_lock,
          notifyEmployeesOnRelease: a.notify_employees_on_release !== false,
          statutoryEnabled: !!a.statutory_enabled,
          statutoryLabel: a.statutory_label || "not_verified",
          payslipNumberPrefix: a.payslip_number_prefix || "PSL",
        }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/hr/payroll/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save");
      setOkMsg("New payroll settings version published.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        kicker="HR, Attendance & Payroll"
        title="Payroll Settings"
        description="Company branding for payslips, salary-day method, cut-offs and statutory configuration. Statutory deductions default OFF and labelled not_verified — do not enable without accountant/HR verification."
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

      {active ? (
        <Card>
          <CardHeader>
            <CardTitle>Active settings</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <span className="text-muted-foreground">Company:</span> {active.company_name}
            </div>
            <div>
              <span className="text-muted-foreground">Currency:</span> {active.currency}
            </div>
            <div>
              <span className="text-muted-foreground">Salary days:</span>{" "}
              {active.salary_day_method.replace(/_/g, " ")}
            </div>
            <div>
              <span className="text-muted-foreground">Statutory:</span>{" "}
              {active.statutory_enabled ? `ON (${active.statutory_label})` : "OFF / not verified"}
            </div>
            <div>
              <span className="text-muted-foreground">Review clearance:</span>{" "}
              {active.require_attendance_review_clearance ? "Required" : "Not required"}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Publish new settings version</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Effective from
            <input
              type="date"
              className={inputClass}
              value={form.effectiveFrom}
              onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Company name (payslips)
            <input
              className={inputClass}
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Currency
            <input
              className={inputClass}
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground sm:col-span-2">
            Company address
            <input
              className={inputClass}
              value={form.companyAddress}
              onChange={(e) => setForm({ ...form, companyAddress: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Logo URL
            <input
              className={inputClass}
              value={form.companyLogoUrl}
              onChange={(e) => setForm({ ...form, companyLogoUrl: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Salary-day method
            <select
              className={inputClass}
              value={form.salaryDayMethod}
              onChange={(e) => setForm({ ...form, salaryDayMethod: e.target.value })}
            >
              <option value="fixed_30">Fixed 30 days</option>
              <option value="calendar_days">Calendar days</option>
              <option value="working_days">Working days</option>
              <option value="configured_days">Configured days</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Configured payroll days
            <input
              type="number"
              min={1}
              className={inputClass}
              value={form.configuredPayrollDays}
              disabled={form.salaryDayMethod !== "configured_days"}
              onChange={(e) =>
                setForm({ ...form, configuredPayrollDays: e.target.value ? Number(e.target.value) : "" })
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Rounding
            <select
              className={inputClass}
              value={form.roundingMethod}
              onChange={(e) => setForm({ ...form, roundingMethod: e.target.value })}
            >
              <option value="nearest_rupee">Nearest rupee</option>
              <option value="floor_rupee">Floor rupee</option>
              <option value="ceil_rupee">Ceil rupee</option>
              <option value="none">None (paise)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Salary payment day
            <input
              type="number"
              min={1}
              max={28}
              className={inputClass}
              value={form.salaryPaymentDay}
              onChange={(e) => setForm({ ...form, salaryPaymentDay: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Payslip prefix
            <input
              className={inputClass}
              value={form.payslipNumberPrefix}
              onChange={(e) => setForm({ ...form, payslipNumberPrefix: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-[#3d3428]">
            <input
              type="checkbox"
              checked={form.requireAttendanceReviewClearance}
              onChange={(e) => setForm({ ...form, requireAttendanceReviewClearance: e.target.checked })}
            />
            Require attendance review clearance before calculate
          </label>
          <label className="flex items-center gap-2 text-sm text-[#3d3428]">
            <input
              type="checkbox"
              checked={form.autoReleasePayslipsOnLock}
              onChange={(e) => setForm({ ...form, autoReleasePayslipsOnLock: e.target.checked })}
            />
            Auto-generate &amp; release payslips on lock
          </label>
          <label className="flex items-center gap-2 text-sm text-[#3d3428]">
            <input
              type="checkbox"
              checked={form.notifyEmployeesOnRelease}
              onChange={(e) => setForm({ ...form, notifyEmployeesOnRelease: e.target.checked })}
            />
            Notify employees when payslips are released
          </label>
          <label className="flex items-center gap-2 text-sm text-[#3d3428]">
            <input
              type="checkbox"
              checked={form.statutoryEnabled}
              onChange={(e) => setForm({ ...form, statutoryEnabled: e.target.checked })}
            />
            Enable statutory deductions
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Statutory verification label
            <select
              className={inputClass}
              value={form.statutoryLabel}
              onChange={(e) => setForm({ ...form, statutoryLabel: e.target.value })}
            >
              <option value="not_verified">not_verified (default)</option>
              <option value="verified">verified (accountant confirmed)</option>
            </select>
          </label>
          <p className="sm:col-span-2 lg:col-span-3 text-xs text-muted-foreground">
            Even when enabled, the engine will not invent PF/ESI/PT/TDS amounts until verified rates are configured.
            Statutory compliance is not claimed by this system.
          </p>
          <div className="flex justify-end sm:col-span-2 lg:col-span-3">
            <Button size="sm" onClick={() => void save()} disabled={saving || !!migrationRequired}>
              {saving ? "Saving…" : "Publish new version"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Settings history ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[#e8dcc8] text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">From</th>
                <th className="py-2 pr-3">To</th>
                <th className="py-2 pr-3">Company</th>
                <th className="py-2 pr-3">Salary days</th>
                <th className="py-2 pr-3">Statutory</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[#f0e9db]">
                  <td className="py-2 pr-3">{r.effective_from}</td>
                  <td className="py-2 pr-3">{r.effective_to ?? "ACTIVE"}</td>
                  <td className="py-2 pr-3">{r.company_name}</td>
                  <td className="py-2 pr-3">{r.salary_day_method}</td>
                  <td className="py-2 pr-3">
                    {r.statutory_enabled ? r.statutory_label : "off"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
