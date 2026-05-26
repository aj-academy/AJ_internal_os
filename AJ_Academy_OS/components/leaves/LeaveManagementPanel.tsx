"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
export type LeavePanelMode = "apply" | "admin" | "mentor";

export interface LeaveRow {
  id: string;
  employee_id: string;
  leave_type: string | null;
  from_date: string | null;
  to_date: string | null;
  total_days: number | null;
  reason: string | null;
  description: string | null;
  status: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  employee_name?: string;
  employee_role?: string;
}

const LEAVE_TYPES = ["Casual", "Sick", "Earned", "Unpaid", "Other"];

interface LeaveManagementPanelProps {
  mode: LeavePanelMode;
  title?: string;
}

export function LeaveManagementPanel({
  mode,
  title = "Leave requests",
}: LeaveManagementPanelProps) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState("");
  const [schemaMissing, setSchemaMissing] = useState(false);

  const [form, setForm] = useState({
    leave_type: "Casual",
    from_date: "",
    to_date: "",
    reason: "",
    description: "",
  });

  const canApply = mode === "apply";
  const canApprove = mode === "admin" || mode === "mentor";

  const loadLeaves = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: qErr } = await supabase
        .from("leave_requests")
        .select(
          "id,employee_id,leave_type,from_date,to_date,total_days,reason,description,status,approved_by,approved_at,rejection_reason,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200);

      if (qErr) {
        if (/relation|does not exist|schema cache/i.test(qErr.message)) {
          setSchemaMissing(true);
          setRows([]);
          return;
        }
        throw qErr;
      }

      setSchemaMissing(false);
      const raw = (data ?? []) as LeaveRow[];
      const empIds = [...new Set(raw.map((r) => r.employee_id).filter(Boolean))] as string[];
      let nameMap: Record<string, { full_name: string | null; role: string | null }> = {};
      if (empIds.length && canApprove) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,full_name,role")
          .in("id", empIds);
        nameMap = Object.fromEntries((profs ?? []).map((p) => [p.id, p]));
      }

      setRows(
        raw.map((r) => ({
          ...r,
          employee_name: nameMap[r.employee_id]?.full_name ?? undefined,
          employee_role: nameMap[r.employee_id]?.role ?? undefined,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load leaves.");
    } finally {
      setLoading(false);
    }
  }, [canApprove, supabase]);

  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) setUserId(user.id);
    })();
  }, [supabase]);

  useEffect(() => {
    void loadLeaves();
  }, [loadLeaves]);

  const daysBetween = (from: string, to: string) => {
    const a = new Date(from);
    const b = new Date(to);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 1;
    return Math.max(1, Math.ceil((b.getTime() - a.getTime()) / 86400000) + 1);
  };

  const onApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    if (!form.from_date || !form.to_date || !form.reason.trim()) {
      setError("From date, to date, and reason are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const total_days = daysBetween(form.from_date, form.to_date);
      const { data: inserted, error: insErr } = await supabase
        .from("leave_requests")
        .insert({
          employee_id: userId,
          leave_type: form.leave_type,
          from_date: form.from_date,
          to_date: form.to_date,
          total_days,
          reason: form.reason.trim(),
          description: form.description.trim() || null,
          status: "pending",
        })
        .select("id")
        .single();

      if (insErr) throw insErr;

      if (inserted?.id) {
        const { error: nErr } = await supabase.rpc("create_leave_request_notification", {
          p_leave_id: inserted.id,
        });
        if (nErr) console.warn("create_leave_request_notification", nErr.message);
      }

      setForm({ leave_type: "Casual", from_date: "", to_date: "", reason: "", description: "" });
      setSuccess("Leave request submitted. Admin" + (mode === "apply" ? " (and your mentor, if assigned) will be notified." : " will review."));
      await loadLeaves();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const onDecision = async (row: LeaveRow, decision: "approved" | "rejected", rejectionReason?: string) => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const { error: upErr } = await supabase
        .from("leave_requests")
        .update({
          status: decision,
          approved_by: userId,
          approved_at: new Date().toISOString(),
          rejection_reason: decision === "rejected" ? rejectionReason?.trim() || "Not approved" : null,
        })
        .eq("id", row.id);

      if (upErr) throw upErr;

      const { error: nErr } = await supabase.rpc("create_leave_status_notification", {
        p_leave_id: row.id,
      });
      if (nErr) console.warn("create_leave_status_notification", nErr.message);

      setSuccess(`Leave ${decision}.`);
      await loadLeaves();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const pendingCount = rows.filter((r) => (r.status ?? "").toLowerCase() === "pending").length;

  return (
    <section className="space-y-6 rounded-[24px] border border-[#e8dcc8] bg-white p-4 sm:p-6 lg:p-8">
      <div>
        <h2 className="text-2xl font-semibold text-[#3d3428]">{title}</h2>
        <p className="mt-1 text-sm text-[#6b5d4d]">
          {canApply
            ? "Apply for leave with a reason. Pending requests need admin approval; students also notify their assigned mentor."
            : mode === "mentor"
              ? "Review leave requests from your assigned students and students in your department."
              : "Review and approve or reject leave requests from all roles."}
        </p>
      </div>

      {schemaMissing ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Run <strong>AJ_Academy_SB/attendance_module.sql</strong> and{" "}
          <strong>aj_academy_platform_expansion.sql</strong> in Supabase SQL Editor.
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

      {canApply && !schemaMissing ? (
        <form onSubmit={onApply} className="rounded-2xl border border-[#ede4d4] bg-[#fffdf8] p-5 space-y-3">
          <h3 className="font-semibold text-[#3d3428]">Apply for leave</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Leave type</span>
              <select
                className="h-9 w-full rounded-xl border border-[#e8dcc8] px-3"
                value={form.leave_type}
                onChange={(e) => setForm((p) => ({ ...p, leave_type: e.target.value }))}
              >
                {LEAVE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">From date</span>
              <Input type="date" value={form.from_date} onChange={(e) => setForm((p) => ({ ...p, from_date: e.target.value }))} required />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">To date</span>
              <Input type="date" value={form.to_date} onChange={(e) => setForm((p) => ({ ...p, to_date: e.target.value }))} required />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="font-medium">Reason *</span>
              <Input
                value={form.reason}
                onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                placeholder="Why do you need leave?"
                required
              />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="font-medium">Additional details (optional)</span>
              <textarea
                rows={2}
                className="w-full rounded-xl border border-[#e8dcc8] px-3 py-2 text-sm"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </label>
          </div>
          <Button type="submit" disabled={submitting} className="rounded-xl bg-[#c9a227] text-white hover:bg-[#b8921f]">
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Submit leave request
          </Button>
        </form>
      ) : null}

      {canApprove ? (
        <p className="text-sm text-[#6b5d4d]">
          Pending approvals: <strong className="text-[#3d3428]">{pendingCount}</strong>
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[#ede4d4]">
        {loading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-[#6b5d4d]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-[#faf6ee] text-[#6b5d4d]">
              <tr>
                {canApprove ? <th className="px-4 py-3">Employee</th> : null}
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Dates</th>
                <th className="px-4 py-3">Days</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Status</th>
                {canApprove ? <th className="px-4 py-3">Action</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0e8da]">
              {rows.map((row) => (
                <tr key={row.id}>
                  {canApprove ? (
                    <td className="px-4 py-3">
                      <p className="font-medium">{row.employee_name ?? row.employee_id.slice(0, 8)}</p>
                      <p className="text-xs capitalize text-[#6b5d4d]">{row.employee_role?.replace("_", " ")}</p>
                    </td>
                  ) : null}
                  <td className="px-4 py-3">{row.leave_type ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {row.from_date} → {row.to_date}
                  </td>
                  <td className="px-4 py-3">{row.total_days ?? "—"}</td>
                  <td className="max-w-[200px] px-4 py-3 text-xs">{row.reason ?? "—"}</td>
                  <td className="px-4 py-3 capitalize">{row.status ?? "—"}</td>
                  {canApprove ? (
                    <td className="px-4 py-3">
                      {(row.status ?? "").toLowerCase() === "pending" ? (
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            disabled={submitting}
                            className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white"
                            onClick={() => void onDecision(row, "approved")}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={submitting}
                            className="rounded-lg bg-rose-600 px-2 py-1 text-xs font-semibold text-white"
                            onClick={() => {
                              const reason = window.prompt("Rejection reason (optional):") ?? "";
                              void onDecision(row, "rejected", reason);
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-[#6b5d4d]">—</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={canApprove ? 7 : 5} className="px-4 py-8 text-center text-[#6b5d4d]">
                    No leave requests yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
