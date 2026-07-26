"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AttendancePolicy } from "@/lib/hr/attendanceStatus";
import type { AttendancePolicyRow } from "@/lib/hr/attendancePolicy";

const WEEKDAY_LABELS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

type FormState = {
  name: string;
  effectiveFrom: string;
  officeStartTime: string;
  officeEndTime: string;
  graceMinutes: number;
  minFullDayMinutes: number;
  minHalfDayMinutes: number;
  maxBreakMinutes: number;
  lateArrivalRule: string;
  earlyExitRule: string;
  missingCheckoutTreatment: string;
  weeklyOffDays: number[];
  holidayTreatment: string;
  wfhPolicy: string;
  permissionHourPolicy: string;
  overtimeEligible: boolean;
  overtimeMinMinutes: number;
  overtimeRequiresApproval: boolean;
  attendanceRoundingRule: string;
  salaryDayMethod: string;
  configuredPayrollDays: number | null;
  notes: string;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function policyToForm(p: AttendancePolicy | null): FormState {
  return {
    name: p?.name && !p.name.includes("Built-in") ? p.name : "Attendance policy",
    effectiveFrom: todayIso(),
    officeStartTime: p?.standardCheckInTime ?? "10:00",
    officeEndTime: p?.standardCheckOutTime ?? "18:00",
    graceMinutes: p?.graceMinutes ?? 15,
    minFullDayMinutes: p?.minFullDayMinutes ?? 480,
    minHalfDayMinutes: p?.minHalfDayMinutes ?? 240,
    maxBreakMinutes: p?.maxBreakMinutes ?? 60,
    lateArrivalRule: p?.lateArrivalRule ?? "mark_late",
    earlyExitRule: p?.earlyExitRule ?? "mark_early_exit",
    missingCheckoutTreatment: p?.missingCheckoutTreatment ?? "send_to_review",
    weeklyOffDays: p?.weeklyOffDays?.length ? [...p.weeklyOffDays] : [0],
    holidayTreatment: p?.holidayTreatment ?? "paid_holiday",
    wfhPolicy: p?.wfhPolicy ?? "allowed_with_approval",
    permissionHourPolicy: p?.permissionHourPolicy ?? "track_only",
    overtimeEligible: p?.overtimeEligible ?? false,
    overtimeMinMinutes: p?.overtimeMinMinutes ?? 30,
    overtimeRequiresApproval: p?.overtimeRequiresApproval ?? true,
    attendanceRoundingRule: p?.attendanceRoundingRule ?? "none",
    salaryDayMethod: p?.salaryDayMethod ?? "fixed_30",
    configuredPayrollDays: p?.configuredPayrollDays ?? null,
    notes: "",
  };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

const inputClass =
  "h-9 rounded-lg border border-[#e8dcc8] bg-white px-2 text-sm text-[#3d3428]";
const selectClass = inputClass;

export function AttendancePolicyWorkbench() {
  const [policies, setPolicies] = useState<AttendancePolicyRow[]>([]);
  const [active, setActive] = useState<AttendancePolicy | null>(null);
  const [source, setSource] = useState<"db" | "default">("default");
  const [migrationRequired, setMigrationRequired] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => policyToForm(null));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/attendance/policies", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load policies");
      setPolicies(json.policies ?? []);
      setActive(json.active?.policy ?? null);
      setSource(json.active?.source === "db" ? "db" : "default");
      setMigrationRequired(json.migrationRequired ?? null);
      setForm(policyToForm(json.active?.policy ?? null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleWeeklyOff = (day: number) => {
    setForm((prev) => {
      const has = prev.weeklyOffDays.includes(day);
      const next = has ? prev.weeklyOffDays.filter((d) => d !== day) : [...prev.weeklyOffDays, day].sort();
      return { ...prev, weeklyOffDays: next };
    });
  };

  const saveNewVersion = async () => {
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      if (form.minHalfDayMinutes > form.minFullDayMinutes) {
        throw new Error("Half-day minutes cannot exceed full-day minutes.");
      }
      if (!form.weeklyOffDays.length) {
        throw new Error("Select at least one weekly-off day, or keep Sunday.");
      }
      const res = await fetch("/api/hr/attendance/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save");
      setOkMsg(
        "New policy version saved. Previous open policy was closed with an effective end date so locked payroll history stays reproducible.",
      );
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
        title="Attendance Policy Settings"
        description="Configure office hours, grace, weekly offs, late/early rules, overtime and salary-day method. Changes create a new effective-dated version — they do not rewrite historical attendance or locked payroll."
        actions={
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        }
      />

      {migrationRequired ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Migration required: run <code className="font-mono">{migrationRequired}</code> in Supabase before
          saving. Until then, derivation uses the built-in default policy.
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
          <CardTitle>
            Active policy{" "}
            <span className="text-xs font-normal text-muted-foreground">
              ({source === "db" ? "from database" : "built-in default"})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-[#3d3428] sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <span className="text-muted-foreground">Name:</span> {active?.name ?? "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Hours:</span> {active?.standardCheckInTime} –{" "}
            {active?.standardCheckOutTime} (grace {active?.graceMinutes}m)
          </div>
          <div>
            <span className="text-muted-foreground">Full / half day:</span> {active?.minFullDayMinutes} /{" "}
            {active?.minHalfDayMinutes} min
          </div>
          <div>
            <span className="text-muted-foreground">Weekly off:</span>{" "}
            {(active?.weeklyOffDays ?? [])
              .map((d) => WEEKDAY_LABELS.find((w) => w.value === d)?.label ?? d)
              .join(", ") || "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Salary-day method:</span>{" "}
            {active?.salaryDayMethod?.replace(/_/g, " ")}
          </div>
          <div>
            <span className="text-muted-foreground">Missing checkout:</span>{" "}
            {active?.missingCheckoutTreatment?.replace(/_/g, " ")}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Publish new policy version</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Policy name">
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="Effective from">
            <input
              type="date"
              className={inputClass}
              value={form.effectiveFrom}
              onChange={(e) => set("effectiveFrom", e.target.value)}
            />
          </Field>
          <Field label="Notes (optional)">
            <input
              className={inputClass}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>

          <Field label="Office start">
            <input
              type="time"
              className={inputClass}
              value={form.officeStartTime}
              onChange={(e) => set("officeStartTime", e.target.value)}
            />
          </Field>
          <Field label="Office end">
            <input
              type="time"
              className={inputClass}
              value={form.officeEndTime}
              onChange={(e) => set("officeEndTime", e.target.value)}
            />
          </Field>
          <Field label="Grace minutes">
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.graceMinutes}
              onChange={(e) => set("graceMinutes", Number(e.target.value))}
            />
          </Field>

          <Field label="Min full-day minutes">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={form.minFullDayMinutes}
              onChange={(e) => set("minFullDayMinutes", Number(e.target.value))}
            />
          </Field>
          <Field label="Min half-day minutes">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={form.minHalfDayMinutes}
              onChange={(e) => set("minHalfDayMinutes", Number(e.target.value))}
            />
          </Field>
          <Field label="Max break minutes">
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.maxBreakMinutes}
              onChange={(e) => set("maxBreakMinutes", Number(e.target.value))}
            />
          </Field>

          <Field label="Late-arrival rule">
            <select
              className={selectClass}
              value={form.lateArrivalRule}
              onChange={(e) => set("lateArrivalRule", e.target.value)}
            >
              <option value="mark_late">Mark late</option>
              <option value="ignore">Ignore</option>
              <option value="deduct_half_day">Deduct half day</option>
              <option value="send_to_review">Send to review</option>
            </select>
          </Field>
          <Field label="Early-exit rule">
            <select
              className={selectClass}
              value={form.earlyExitRule}
              onChange={(e) => set("earlyExitRule", e.target.value)}
            >
              <option value="mark_early_exit">Mark early exit</option>
              <option value="ignore">Ignore</option>
              <option value="deduct_half_day">Deduct half day</option>
              <option value="send_to_review">Send to review</option>
            </select>
          </Field>
          <Field label="Missing check-out treatment">
            <select
              className={selectClass}
              value={form.missingCheckoutTreatment}
              onChange={(e) => set("missingCheckoutTreatment", e.target.value)}
            >
              <option value="send_to_review">Send to review (recommended)</option>
              <option value="assume_standard_hours">Assume standard hours</option>
              <option value="mark_half_day">Mark half day</option>
              <option value="mark_absent">Mark absent</option>
            </select>
          </Field>

          <div className="sm:col-span-2 lg:col-span-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Weekly-off days</p>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_LABELS.map((d) => {
                const on = form.weeklyOffDays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleWeeklyOff(d.value)}
                    className={[
                      "rounded-lg border px-3 py-1.5 text-sm font-medium transition",
                      on
                        ? "border-[#c9a227] bg-[#faf3e3] text-[#3d3428]"
                        : "border-[#e8dcc8] bg-white text-muted-foreground",
                    ].join(" ")}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Holiday treatment">
            <select
              className={selectClass}
              value={form.holidayTreatment}
              onChange={(e) => set("holidayTreatment", e.target.value)}
            >
              <option value="paid_holiday">Paid holiday</option>
              <option value="unpaid">Unpaid</option>
              <option value="working_day">Treat as working day</option>
            </select>
          </Field>
          <Field label="Work-from-home policy">
            <select
              className={selectClass}
              value={form.wfhPolicy}
              onChange={(e) => set("wfhPolicy", e.target.value)}
            >
              <option value="allowed">Allowed</option>
              <option value="allowed_with_approval">Allowed with approval</option>
              <option value="not_allowed">Not allowed</option>
            </select>
          </Field>
          <Field label="Permission-hour policy">
            <select
              className={selectClass}
              value={form.permissionHourPolicy}
              onChange={(e) => set("permissionHourPolicy", e.target.value)}
            >
              <option value="track_only">Track only</option>
              <option value="deduct_from_hours">Deduct from hours</option>
              <option value="send_to_review">Send to review</option>
            </select>
          </Field>

          <Field label="Overtime eligible">
            <select
              className={selectClass}
              value={form.overtimeEligible ? "yes" : "no"}
              onChange={(e) => set("overtimeEligible", e.target.value === "yes")}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </Field>
          <Field label="Overtime minimum (minutes)">
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.overtimeMinMinutes}
              onChange={(e) => set("overtimeMinMinutes", Number(e.target.value))}
              disabled={!form.overtimeEligible}
            />
          </Field>
          <Field label="Overtime requires approval">
            <select
              className={selectClass}
              value={form.overtimeRequiresApproval ? "yes" : "no"}
              onChange={(e) => set("overtimeRequiresApproval", e.target.value === "yes")}
              disabled={!form.overtimeEligible}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>

          <Field label="Attendance rounding">
            <select
              className={selectClass}
              value={form.attendanceRoundingRule}
              onChange={(e) => set("attendanceRoundingRule", e.target.value)}
            >
              <option value="none">None</option>
              <option value="nearest_15">Nearest 15 min</option>
              <option value="nearest_30">Nearest 30 min</option>
              <option value="ceil_15">Ceil 15 min</option>
              <option value="floor_15">Floor 15 min</option>
            </select>
          </Field>
          <Field label="Salary-day calculation method">
            <select
              className={selectClass}
              value={form.salaryDayMethod}
              onChange={(e) => set("salaryDayMethod", e.target.value)}
            >
              <option value="fixed_30">Fixed 30 days</option>
              <option value="calendar_days">Actual calendar days</option>
              <option value="working_days">Actual working days</option>
              <option value="configured_days">Configured payroll days</option>
            </select>
          </Field>
          <Field label="Configured payroll days">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={form.configuredPayrollDays ?? ""}
              onChange={(e) =>
                set("configuredPayrollDays", e.target.value ? Number(e.target.value) : null)
              }
              disabled={form.salaryDayMethod !== "configured_days"}
              placeholder="e.g. 26"
            />
          </Field>

          <div className="sm:col-span-2 lg:col-span-3 flex justify-end gap-2 pt-2">
            <Button
              size="sm"
              onClick={() => void saveNewVersion()}
              disabled={saving || !!migrationRequired}
            >
              {saving ? "Saving…" : "Publish new version"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Policy history ({policies.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[#e8dcc8] text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Effective from</th>
                <th className="py-2 pr-3">Effective to</th>
                <th className="py-2 pr-3">Hours</th>
                <th className="py-2 pr-3">Weekly off</th>
                <th className="py-2 pr-3">Salary days</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id} className="border-b border-[#f0e9db]">
                  <td className="py-2 pr-3">
                    {p.name}
                    {p.effective_to == null ? (
                      <span className="ml-2 rounded bg-[#faf3e3] px-1.5 py-0.5 text-[10px] font-semibold text-[#a68b2e]">
                        ACTIVE
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">{p.effective_from}</td>
                  <td className="py-2 pr-3">{p.effective_to ?? "— (open)"}</td>
                  <td className="py-2 pr-3">
                    {String(p.office_start_time).slice(0, 5)} – {String(p.office_end_time).slice(0, 5)}
                  </td>
                  <td className="py-2 pr-3">
                    {(p.weekly_off_days ?? [])
                      .map((d) => WEEKDAY_LABELS.find((w) => w.value === d)?.label ?? d)
                      .join(", ")}
                  </td>
                  <td className="py-2 pr-3">{String(p.salary_day_method).replace(/_/g, " ")}</td>
                </tr>
              ))}
              {!loading && policies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    No policy versions yet.
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
