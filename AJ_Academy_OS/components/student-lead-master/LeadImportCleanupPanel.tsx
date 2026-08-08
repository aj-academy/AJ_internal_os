"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteOwnedClients } from "@/lib/crmOwnedDelete";
import { todayDateIST } from "@/lib/datetime";

type PreviewRow = { id: string; lead_name: string | null; name: string | null; phone: string | null; created_at: string };

type EmployeeOption = { id: string; label: string; email?: string | null };

function istDayBoundsUtc(ymd: string): { start: string; end: string } {
  return {
    start: new Date(`${ymd}T00:00:00+05:30`).toISOString(),
    end: new Date(`${ymd}T23:59:59.999+05:30`).toISOString(),
  };
}

const DEFAULT_CLEANUP_EMAIL = "sharmilianandan3@gmail.com";

type Props = {
  supabase: SupabaseClient;
  adminUserId: string;
  employees: EmployeeOption[];
  onDone: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

export function LeadImportCleanupPanel({
  supabase,
  adminUserId,
  employees,
  onDone,
  onError,
  onSuccess,
}: Props) {
  const [email, setEmail] = useState(DEFAULT_CLEANUP_EMAIL);
  const [dateYmd, setDateYmd] = useState(() => todayDateIST());
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);

  useEffect(() => {
    if (!employees.length) return;
    const emails = new Set(employees.map((e) => (e.email || "").trim().toLowerCase()).filter(Boolean));
    if (emails.has(email.trim().toLowerCase())) return;
    const preferred = employees.find((e) => (e.email || "").trim().toLowerCase() === DEFAULT_CLEANUP_EMAIL);
    setEmail((preferred?.email || employees.find((e) => e.email)?.email || DEFAULT_CLEANUP_EMAIL).trim().toLowerCase());
  }, [employees, email]);

  const selectedLabel =
    employees.find((e) => (e.email || "").trim().toLowerCase() === email.trim().toLowerCase())?.label || email;

  const runPreview = async () => {
    setBusy(true);
    setPreview(null);
    setAssigneeId(null);
    try {
      const normalized = email.trim().toLowerCase();
      if (!normalized) throw new Error("Select an employee.");
      const fromList = employees.find((e) => (e.email || "").trim().toLowerCase() === normalized);
      let profileId = fromList?.id ?? null;
      let profileName = fromList?.label ?? normalized;

      if (!profileId) {
        const { data: profile, error: pErr } = await supabase
          .from("profiles")
          .select("id,full_name,email,role")
          .eq("email", normalized)
          .maybeSingle();
        if (pErr) throw new Error(pErr.message);
        if (!profile?.id) throw new Error(`No profile found for ${normalized}.`);
        profileId = profile.id;
        profileName = profile.full_name || profile.email || normalized;
      }

      const { start, end } = istDayBoundsUtc(dateYmd);
      const { data, error } = await supabase
        .from("clients")
        .select("id,lead_name,name,phone,created_at")
        .eq("assigned_to", profileId)
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw new Error(error.message);

      setAssigneeId(profileId);
      setPreview((data as PreviewRow[]) ?? []);
      onSuccess(`Preview: ${(data ?? []).length} lead(s) for ${profileName} on ${dateYmd} (IST).`);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setBusy(false);
    }
  };

  const runDelete = async () => {
    if (!preview?.length || !assigneeId) {
      onError("Run preview first.");
      return;
    }
    const ok = window.confirm(
      `Permanently delete ${preview.length} lead(s) assigned to ${selectedLabel} (${email}) created on ${dateYmd} (IST)? This cannot be undone.`,
    );
    if (!ok) return;

    setBusy(true);
    try {
      const ids = preview.map((r) => r.id);
      const { deleted, error } = await deleteOwnedClients(supabase, ids, adminUserId, { isAdmin: true });
      if (error) throw new Error(error);
      onSuccess(`Deleted ${deleted} lead(s) for ${selectedLabel} on ${dateYmd} (IST).`);
      setPreview(null);
      setAssigneeId(null);
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  const withEmail = employees.filter((e) => (e.email || "").trim());

  return (
    <section className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-[#0f172a]">Admin: delete leads by employee + date (IST)</h3>
        <p className="mt-1 text-xs text-[#64748b]">
          Preview first, then confirm. Uses ownership delete RPC. Prefill targets today&apos;s import cleanup.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <label className="flex flex-col gap-1 text-xs min-w-[220px] flex-1">
          <span className="font-medium text-[#475569]">Employee</span>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={email}
            disabled={busy || !withEmail.length}
            onChange={(e) => {
              setEmail(e.target.value);
              setPreview(null);
              setAssigneeId(null);
            }}
          >
            {!withEmail.length ? <option value="">No employees loaded</option> : null}
            {withEmail.map((emp) => {
              const value = (emp.email || "").trim().toLowerCase();
              return (
                <option key={emp.id} value={value}>
                  {emp.label} ({emp.email})
                </option>
              );
            })}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-[#475569]">Created date (IST)</span>
          <Input type="date" value={dateYmd} onChange={(e) => setDateYmd(e.target.value)} disabled={busy} />
        </label>
        <Button type="button" variant="outline" disabled={busy || !email} onClick={() => void runPreview()}>
          {busy && !preview ? "Loading…" : "Preview"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="border-rose-300 text-rose-900"
          disabled={busy || !preview?.length}
          onClick={() => void runDelete()}
        >
          Confirm delete ({preview?.length ?? 0})
        </Button>
      </div>
      {preview ? (
        <div className="rounded-xl border border-[#e2e8f0] bg-white max-h-48 overflow-auto">
          <p className="sticky top-0 border-b bg-[#f8fbff] px-3 py-2 text-xs font-semibold text-[#64748b]">
            {preview.length} lead(s) — showing names
          </p>
          <ul className="divide-y text-sm">
            {preview.slice(0, 40).map((r) => (
              <li key={r.id} className="flex justify-between gap-2 px-3 py-1.5">
                <span className="font-medium">{r.lead_name || r.name || "—"}</span>
                <span className="text-xs text-[#64748b]">{r.phone || new Date(r.created_at).toLocaleString()}</span>
              </li>
            ))}
            {preview.length > 40 ? (
              <li className="px-3 py-2 text-xs text-[#64748b]">…and {preview.length - 40} more</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
