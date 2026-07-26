"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Holiday = {
  id: string;
  holiday_date: string;
  name: string;
  holiday_type: "public" | "company" | "optional";
  is_paid: boolean;
  description: string | null;
};

const inputClass = "h-9 rounded-lg border border-[#e8dcc8] bg-white px-2 text-sm text-[#3d3428]";

export function HolidayCalendarWorkbench() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [migrationRequired, setMigrationRequired] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("public");
  const [newPaid, setNewPaid] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/hr/holidays?year=${year}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load holidays");
      setHolidays(json.holidays ?? []);
      setMigrationRequired(json.migrationRequired ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  const addHoliday = async () => {
    setSaving(true);
    setError(null);
    try {
      if (!newDate || !newName.trim()) throw new Error("Date and name are required.");
      const res = await fetch("/api/hr/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holidayDate: newDate, name: newName.trim(), holidayType: newType, isPaid: newPaid }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add holiday");
      setNewDate("");
      setNewName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add holiday");
    } finally {
      setSaving(false);
    }
  };

  const removeHoliday = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/hr/holidays?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const togglePaid = async (h: Holiday) => {
    setError(null);
    try {
      const res = await fetch("/api/hr/holidays", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: h.id, isPaid: !h.is_paid }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        kicker="HR, Attendance & Payroll"
        title="Holiday Calendar"
        description="Company holiday calendar. Holidays are excluded from chargeable leave days and feed attendance and payroll payable-day calculations."
        actions={
          <div className="flex items-center gap-2">
            <select className={inputClass} value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[year - 1, year, year + 1]
                .filter((v, i, a) => a.indexOf(v) === i)
                .map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
            </select>
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </div>
        }
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

      <Card>
        <CardHeader>
          <CardTitle>Add holiday</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Date
            <input type="date" className={inputClass} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Name
            <input
              className={`${inputClass} min-w-56`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Republic Day"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Type
            <select className={inputClass} value={newType} onChange={(e) => setNewType(e.target.value)}>
              <option value="public">Public</option>
              <option value="company">Company</option>
              <option value="optional">Optional</option>
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-[#3d3428]">
            <input type="checkbox" checked={newPaid} onChange={(e) => setNewPaid(e.target.checked)} />
            Paid
          </label>
          <Button size="sm" onClick={() => void addHoliday()} disabled={saving || !!migrationRequired}>
            {saving ? "Adding…" : "Add holiday"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Holidays in {year} ({holidays.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[#e8dcc8] text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Day</th>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Paid</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {holidays.map((h) => (
                <tr key={h.id} className="border-b border-[#f0e9db]">
                  <td className="py-2 pr-3">{h.holiday_date}</td>
                  <td className="py-2 pr-3">
                    {new Date(`${h.holiday_date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })}
                  </td>
                  <td className="py-2 pr-3">{h.name}</td>
                  <td className="py-2 pr-3 capitalize">{h.holiday_type}</td>
                  <td className="py-2 pr-3">
                    <button
                      type="button"
                      className="rounded bg-[#faf3e3] px-2 py-0.5 text-xs font-semibold text-[#a68b2e]"
                      onClick={() => void togglePaid(h)}
                      title="Toggle paid/unpaid"
                    >
                      {h.is_paid ? "Paid" : "Unpaid"}
                    </button>
                  </td>
                  <td className="py-2 pr-3">
                    <Button size="xs" variant="destructive" onClick={() => void removeHoliday(h.id)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
              {!loading && holidays.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    No holidays configured for {year}.
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
