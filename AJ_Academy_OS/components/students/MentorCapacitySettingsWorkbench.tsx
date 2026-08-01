"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";

type CapRow = {
  mentor: { id: string; full_name: string | null; email: string | null; department: string | null; status: string | null };
  capacity: {
    max_total_students: number;
    max_primary_students: number;
    max_secondary_students: number;
    max_projects: number;
    max_active_tests: number;
    max_batches: number;
    availability: string;
    is_active: boolean;
    notes: string | null;
  } | null;
};

const DEFAULTS = {
  max_total_students: 50,
  max_primary_students: 40,
  max_secondary_students: 20,
  max_projects: 20,
  max_active_tests: 20,
  max_batches: 10,
  availability: "available",
  is_active: true,
  notes: "",
};

export function MentorCapacitySettingsWorkbench() {
  const [rows, setRows] = useState<CapRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(DEFAULTS);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/students/mentor-capacity", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Load failed");
      setRows(json.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (row: CapRow) => {
    setEditing(row.mentor.id);
    setForm({
      max_total_students: row.capacity?.max_total_students ?? 50,
      max_primary_students: row.capacity?.max_primary_students ?? 40,
      max_secondary_students: row.capacity?.max_secondary_students ?? 20,
      max_projects: row.capacity?.max_projects ?? 20,
      max_active_tests: row.capacity?.max_active_tests ?? 20,
      max_batches: row.capacity?.max_batches ?? 10,
      availability: row.capacity?.availability ?? "available",
      is_active: row.capacity?.is_active ?? true,
      notes: row.capacity?.notes ?? "",
    });
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/students/mentor-capacity", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mentor_id: editing, ...form }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setSuccess("Capacity saved.");
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Student Management"
        title="Mentor Capacity"
        description="Set max primary/secondary/total loads and availability per mentor."
        actions={
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        }
      />
      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {success ? <CrmFlash tone="success" message={success} onDismiss={() => setSuccess(null)} /> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="p-3">Mentor</th>
                <th className="p-3">Total max</th>
                <th className="p-3">Primary max</th>
                <th className="p-3">Secondary max</th>
                <th className="p-3">Availability</th>
                <th className="p-3">Active</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.mentor.id} className="border-b border-border/60">
                  <td className="p-3">
                    <div className="font-medium">{r.mentor.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.mentor.email}</div>
                  </td>
                  <td className="p-3">{r.capacity?.max_total_students ?? 50}</td>
                  <td className="p-3">{r.capacity?.max_primary_students ?? 40}</td>
                  <td className="p-3">{r.capacity?.max_secondary_students ?? 20}</td>
                  <td className="p-3">{r.capacity?.availability ?? "available"}</td>
                  <td className="p-3">{(r.capacity?.is_active ?? true) ? "yes" : "no"}</td>
                  <td className="p-3">
                    <Button type="button" size="sm" variant="outline" onClick={() => startEdit(r)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">Edit capacity</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {(
              [
                ["max_total_students", "Max total"],
                ["max_primary_students", "Max primary"],
                ["max_secondary_students", "Max secondary"],
                ["max_projects", "Max projects"],
                ["max_active_tests", "Max active tests"],
                ["max_batches", "Max batches"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-xs space-y-1">
                <span>{label}</span>
                <input
                  type="number"
                  className="w-full rounded-md border px-2 py-1.5 text-sm"
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }))}
                />
              </label>
            ))}
            <label className="text-xs space-y-1">
              <span>Availability</span>
              <select
                className="w-full rounded-md border px-2 py-1.5 text-sm"
                value={form.availability}
                onChange={(e) => setForm((f) => ({ ...f, availability: e.target.value }))}
              >
                <option value="available">available</option>
                <option value="limited">limited</option>
                <option value="unavailable">unavailable</option>
                <option value="on_leave">on_leave</option>
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            Active for new allocations
          </label>
          <textarea
            className="w-full rounded-md border px-2 py-2 text-sm"
            rows={2}
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
          <div className="flex gap-2">
            <Button type="button" disabled={busy} onClick={() => void save()}>
              Save
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
