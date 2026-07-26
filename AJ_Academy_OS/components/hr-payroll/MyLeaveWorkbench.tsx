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
  allows_half_day: boolean;
  requires_document: boolean;
  min_notice_days: number;
  counts_as_presence: boolean;
};

type Balance = {
  leaveTypeId: string;
  code: string;
  name: string;
  isPaid: boolean;
  countsAsPresence: boolean;
  available: number;
  used: number;
  entitlementConfigured: boolean;
};

type Application = {
  id: string;
  start_date: string;
  end_date: string;
  is_half_day: boolean;
  total_days: number;
  reason: string;
  status: string;
  applied_at: string;
  review_remarks: string | null;
  leave_types: { code: string; name: string } | null;
};

const inputClass = "h-9 rounded-lg border border-[#e8dcc8] bg-white px-2 text-sm text-[#3d3428]";

export function MyLeaveWorkbench() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [migrationRequired, setMigrationRequired] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [typeId, setTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [halfSession, setHalfSession] = useState<"first_half" | "second_half">("first_half");
  const [reason, setReason] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [appsRes, typesRes] = await Promise.all([
        fetch(`/api/hr/leave/applications?year=${year}`, { cache: "no-store" }),
        fetch("/api/hr/leave/types", { cache: "no-store" }),
      ]);
      const appsJson = await appsRes.json();
      const typesJson = await typesRes.json();
      if (!appsRes.ok) throw new Error(appsJson.error || "Failed to load leave data");
      if (!typesRes.ok) throw new Error(typesJson.error || "Failed to load leave types");
      setApplications(appsJson.applications ?? []);
      setBalances(appsJson.balances ?? []);
      setTypes(typesJson.types ?? []);
      setMigrationRequired(appsJson.migrationRequired ?? typesJson.migrationRequired ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedType = types.find((t) => t.id === typeId) ?? null;

  const apply = async () => {
    setSubmitting(true);
    setError(null);
    setOkMsg(null);
    try {
      if (!typeId) throw new Error("Select a leave type.");
      if (!startDate) throw new Error("Select a start date.");
      if (!reason.trim()) throw new Error("A reason is required.");
      const res = await fetch("/api/hr/leave/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveTypeId: typeId,
          startDate,
          endDate: isHalfDay ? startDate : endDate || startDate,
          isHalfDay,
          halfDaySession: halfSession,
          reason: reason.trim(),
          contactInfo: contactInfo.trim() || undefined,
          attachmentUrl: attachmentUrl.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to submit application");
      setOkMsg(
        `Leave applied for ${json.totalDays} day(s) — pending HR approval.` +
          (json.skipped?.weeklyOffs?.length || json.skipped?.holidays?.length
            ? ` Weekly offs/holidays in the range were not charged.`
            : ""),
      );
      setStartDate("");
      setEndDate("");
      setReason("");
      setAttachmentUrl("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async (id: string) => {
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/hr/leave/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "cancel" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to cancel");
      setOkMsg("Request cancelled.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        kicker="My HR & Payroll"
        title="My Leave"
        description="View your leave balances, apply for leave, and track request status. Only approved leave affects attendance and payroll."
        actions={
          <div className="flex items-center gap-2">
            <input
              type="number"
              className={`${inputClass} w-24`}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </div>
        }
      />

      {migrationRequired ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The leave module database migration has not been applied yet. Ask your administrator to run{" "}
          <code className="font-mono">{migrationRequired}</code>.
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {balances
          .filter((b) => !b.countsAsPresence)
          .map((b) => (
            <Card key={b.leaveTypeId} size="sm">
              <CardContent className="pt-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {b.name} {b.isPaid ? "" : "(unpaid)"}
                </p>
                <p className="text-2xl font-semibold text-[#3d3428]">
                  {b.isPaid ? b.available : "—"}
                  {b.isPaid ? <span className="text-sm font-normal text-muted-foreground"> available</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  Used: {b.used}
                  {!b.entitlementConfigured && b.isPaid ? " · entitlement not configured yet" : ""}
                </p>
              </CardContent>
            </Card>
          ))}
        {!loading && balances.length === 0 ? (
          <p className="text-sm text-muted-foreground">No balances to show yet.</p>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Apply for leave</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Leave type
            <select className={inputClass} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">Select…</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.is_paid ? "" : "(unpaid)"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Start date
            <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            End date
            <input
              type="date"
              className={inputClass}
              value={isHalfDay ? startDate : endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={isHalfDay}
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-[#3d3428]">
            <input
              type="checkbox"
              checked={isHalfDay}
              onChange={(e) => setIsHalfDay(e.target.checked)}
              disabled={selectedType ? !selectedType.allows_half_day : false}
            />
            Half day {selectedType && !selectedType.allows_half_day ? "(not allowed for this type)" : ""}
          </label>
          {isHalfDay ? (
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Session
              <select
                className={inputClass}
                value={halfSession}
                onChange={(e) => setHalfSession(e.target.value as "first_half" | "second_half")}
              >
                <option value="first_half">First half</option>
                <option value="second_half">Second half</option>
              </select>
            </label>
          ) : (
            <div />
          )}
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Contact during leave (optional)
            <input className={inputClass} value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground sm:col-span-2">
            Reason (required)
            <textarea
              rows={2}
              className="rounded-lg border border-[#e8dcc8] bg-white px-2 py-1.5 text-sm text-[#3d3428]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Document link {selectedType?.requires_document ? "(required for this type)" : "(optional)"}
            <input
              className={inputClass}
              value={attachmentUrl}
              onChange={(e) => setAttachmentUrl(e.target.value)}
              placeholder="https://…"
            />
          </label>

          <div className="flex items-end sm:col-span-2 lg:col-span-3">
            {selectedType && selectedType.min_notice_days > 0 ? (
              <p className="mr-auto text-xs text-muted-foreground">
                {selectedType.name} requires at least {selectedType.min_notice_days} day(s) notice.
              </p>
            ) : (
              <span className="mr-auto" />
            )}
            <Button size="sm" onClick={() => void apply()} disabled={submitting || !!migrationRequired}>
              {submitting ? "Submitting…" : "Submit leave request"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My leave history ({applications.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[#e8dcc8] text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Dates</th>
                <th className="py-2 pr-3">Days</th>
                <th className="py-2 pr-3">Reason</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Remarks</th>
                <th className="py-2 pr-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((a) => (
                <tr key={a.id} className="border-b border-[#f0e9db]">
                  <td className="py-2 pr-3">{a.leave_types?.name ?? "—"}</td>
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
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{a.review_remarks ?? "—"}</td>
                  <td className="py-2 pr-3">
                    {a.status === "pending" ? (
                      <Button size="xs" variant="destructive" onClick={() => void cancel(a.id)}>
                        Cancel
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!loading && applications.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                    No leave applications in {year}.
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
