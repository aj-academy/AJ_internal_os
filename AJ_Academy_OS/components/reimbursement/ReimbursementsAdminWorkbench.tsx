"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LeadSummaryCard } from "@/components/ui/LeadSummaryCard";
import { TablePagination } from "@/components/ui/TablePagination";
import { TableSearchBar } from "@/components/ui/TableSearchBar";
import { REIMBURSEMENT_TAB_LABELS, REIMBURSEMENT_TAB_ORDER } from "@/components/reimbursement/reimbursementConfig";
import {
  BUDGET_TYPES,
  formatInr,
  formatSubmittedAt,
  getLimitLabel,
  isMissingReimbursementSchema,
  parseCategories,
  REIMBURSEMENT_CLAIM_SELECT,
  STATUS_BADGE_CLASS,
} from "@/lib/reimbursementHelpers";
import { parseBillUrls } from "@/lib/reimbursementBills";
import { usePagination } from "@/lib/usePagination";
import type { ReimbursementClaimRow, ReimbursementPolicySettings, ReimbursementTabId } from "@/types/reimbursement";

type ProfileMini = {
  id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  role: string | null;
};

const DEFAULT_POLICY: Omit<ReimbursementPolicySettings, "id" | "updated_at"> = {
  low_budget_limit: 300,
  standard_limit: 1000,
  allow_special_approval: true,
  max_file_size_mb: 5,
  processing_days: 7,
  approval_required: true,
  allowed_categories: "Travel, Food, Client Meeting, Office Purchase, Internet, Software, Printing",
};

function mapPolicy(row: Record<string, unknown>): ReimbursementPolicySettings {
  return {
    id: String(row.id),
    low_budget_limit: Number(row.low_budget_limit ?? 300),
    standard_limit: Number(row.standard_limit ?? 1000),
    allow_special_approval: Boolean(row.allow_special_approval ?? true),
    max_file_size_mb: Number(row.max_file_size_mb ?? 5),
    processing_days: Number(row.processing_days ?? 7),
    approval_required: Boolean(row.approval_required ?? true),
    allowed_categories: String(row.allowed_categories ?? DEFAULT_POLICY.allowed_categories),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapClaim(row: Record<string, unknown>): ReimbursementClaimRow {
  return {
    id: String(row.id),
    claim_code: typeof row.claim_code === "string" ? row.claim_code : null,
    employee_id: String(row.employee_id),
    expense_type: typeof row.expense_type === "string" ? row.expense_type : null,
    category: typeof row.category === "string" ? row.category : null,
    budget_type: typeof row.budget_type === "string" ? row.budget_type : null,
    amount: Number(row.amount ?? 0),
    expense_date: String(row.expense_date),
    payment_method: typeof row.payment_method === "string" ? row.payment_method : null,
    receipt_url: typeof row.receipt_url === "string" ? row.receipt_url : null,
    bill_urls: parseBillUrls(row.bill_urls),
    reason: typeof row.reason === "string" ? row.reason : null,
    approval_status: (row.approval_status as ReimbursementClaimRow["approval_status"]) ?? "Pending",
    approved_by: typeof row.approved_by === "string" ? row.approved_by : null,
    approved_at: typeof row.approved_at === "string" ? row.approved_at : null,
    rejection_reason: typeof row.rejection_reason === "string" ? row.rejection_reason : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function ReimbursementsAdminWorkbench() {
  const supabase = useMemo(() => createClient(), []);
  const [activeTab, setActiveTab] = useState<ReimbursementTabId>("overview");
  const [claims, setClaims] = useState<ReimbursementClaimRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileMini[]>([]);
  const [policy, setPolicy] = useState<ReimbursementPolicySettings | null>(null);
  const [policyForm, setPolicyForm] = useState(DEFAULT_POLICY);
  const [loading, setLoading] = useState(true);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState("");

  const profileMap = useMemo(() => Object.fromEntries(profiles.map((p) => [p.id, p])), [profiles]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [claimsRes, profilesRes, policyRes] = await Promise.all([
        supabase.from("expense_claims").select(REIMBURSEMENT_CLAIM_SELECT).order("created_at", { ascending: false }).limit(1000),
        supabase
          .from("profiles")
          .select("id,full_name,email,department,role")
          .in("role", ["employee", "mentor", "freelancer", "manager", "admin", "super_admin"]),
        supabase.from("reimbursement_policy_settings").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

      if (claimsRes.error) {
        if (isMissingReimbursementSchema(claimsRes.error.message)) setSchemaMissing(true);
        throw new Error(claimsRes.error.message);
      }

      setSchemaMissing(false);
      setClaims(
        (claimsRes.data ?? [])
          .map((r) => mapClaim(r as Record<string, unknown>))
          .filter((c) => c.approval_status !== "Draft"),
      );
      setProfiles((profilesRes.data ?? []) as ProfileMini[]);

      if (policyRes.data) {
        const mapped = mapPolicy(policyRes.data as Record<string, unknown>);
        setPolicy(mapped);
        setPolicyForm({
          low_budget_limit: mapped.low_budget_limit,
          standard_limit: mapped.standard_limit,
          allow_special_approval: mapped.allow_special_approval,
          max_file_size_mb: mapped.max_file_size_mb,
          processing_days: mapped.processing_days,
          approval_required: mapped.approval_required,
          allowed_categories: mapped.allowed_categories,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load reimbursements.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) setUserId(user.id);
    })();
  }, [supabase]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel("reimbursements-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_claims" }, () => void loadAll())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [loadAll, supabase, userId]);

  const effectivePolicy = policy ?? ({ ...DEFAULT_POLICY, id: "", updated_at: "" } as ReimbursementPolicySettings);

  const filteredClaims = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = claims;
    if (activeTab === "pending") rows = rows.filter((c) => c.approval_status === "Pending");
    else if (activeTab === "special") rows = rows.filter((c) => c.approval_status === "Special Approval Required");
    else if (activeTab === "reimbursed") rows = rows.filter((c) => c.approval_status === "Reimbursed");
    else if (activeTab === "all") rows = rows;
    else if (activeTab === "overview" || activeTab === "reports" || activeTab === "policy") rows = [];

    if (!q) return rows;
    return rows.filter((c) => {
      const p = profileMap[c.employee_id];
      const name = (p?.full_name || p?.email || "").toLowerCase();
      return (
        name.includes(q) ||
        (c.claim_code ?? "").toLowerCase().includes(q) ||
        (c.category ?? "").toLowerCase().includes(q) ||
        (c.expense_type ?? "").toLowerCase().includes(q)
      );
    });
  }, [activeTab, claims, profileMap, search]);

  const [pageSize, setPageSize] = useState(10);
  const { paginatedItems, page, setPage, totalPages, totalItems } = usePagination(filteredClaims, pageSize);

  const stats = useMemo(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const thisMonth = claims.filter((c) => c.created_at.slice(0, 7) === monthKey);
    const approved = claims.filter((c) => c.approval_status === "Approved");
    const reimbursed = claims.filter((c) => c.approval_status === "Reimbursed");
    const rejected = claims.filter((c) => c.approval_status === "Rejected");
    const totalAmount = claims.reduce((s, c) => s + Number(c.amount), 0);
    return {
      total: claims.length,
      pending: claims.filter((c) => c.approval_status === "Pending").length,
      special: claims.filter((c) => c.approval_status === "Special Approval Required").length,
      approvedAmount: approved.reduce((s, c) => s + Number(c.amount), 0),
      reimbursedAmount: reimbursed.reduce((s, c) => s + Number(c.amount), 0),
      rejectedAmount: rejected.reduce((s, c) => s + Number(c.amount), 0),
      thisMonth: thisMonth.length,
      average: claims.length ? Math.round(totalAmount / claims.length) : 0,
    };
  }, [claims]);

  const updateClaimStatus = async (
    claim: ReimbursementClaimRow,
    approval_status: ReimbursementClaimRow["approval_status"],
    extra?: { rejection_reason?: string },
  ) => {
    setError(null);
    const payload: Record<string, unknown> = {
      approval_status,
      ...extra,
    };
    if (approval_status === "Approved" || approval_status === "Reimbursed") {
      payload.approved_by = userId;
      payload.approved_at = new Date().toISOString();
    }
    if (approval_status !== "Rejected") {
      payload.rejection_reason = null;
    }
    const { error: err } = await supabase.from("expense_claims").update(payload).eq("id", claim.id);
    if (err) {
      setError(err.message);
      return;
    }
    setSuccess(`Claim ${claim.claim_code ?? claim.id.slice(0, 8)} updated.`);
    await loadAll();
  };

  const handleApprove = (claim: ReimbursementClaimRow) => void updateClaimStatus(claim, "Approved");
  const handleReject = (claim: ReimbursementClaimRow) => {
    const reason = window.prompt("Rejection reason?", "") ?? "";
    void updateClaimStatus(claim, "Rejected", { rejection_reason: reason || "Rejected" });
  };
  const handleReimburse = (claim: ReimbursementClaimRow) => void updateClaimStatus(claim, "Reimbursed");

  const savePolicy = async () => {
    setSavingPolicy(true);
    setError(null);
    const row = {
      ...policyForm,
      low_budget_limit: Number(policyForm.low_budget_limit),
      standard_limit: Number(policyForm.standard_limit),
      max_file_size_mb: Number(policyForm.max_file_size_mb),
      processing_days: Number(policyForm.processing_days),
      updated_at: new Date().toISOString(),
    };
    const { error: err } = policy?.id
      ? await supabase.from("reimbursement_policy_settings").update(row).eq("id", policy.id)
      : await supabase.from("reimbursement_policy_settings").insert(row);
    setSavingPolicy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSuccess("Policy settings saved.");
    await loadAll();
  };

  const showTable = ["all", "pending", "special", "reimbursed"].includes(activeTab);

  return (
    <section className="space-y-5 rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-[0_20px_40px_rgba(30,64,175,0.08)] sm:p-6 lg:p-8">
      <header>
        <h2 className="text-3xl font-semibold text-[#0f172a]">Reimbursements</h2>
        <p className="mt-1 text-sm text-[#64748b]">Review claims, approve reimbursements, and manage policy limits.</p>
      </header>

      {schemaMissing ? (
        <div className="rounded-xl border border-blue-200 bg-[#faf3e3] px-4 py-3 text-sm text-blue-900">
          Run <strong>finance_schema.sql</strong> then <strong>reimbursement_schema_patch.sql</strong> in Supabase, then refresh.
        </div>
      ) : null}
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{success}</div> : null}

      <div className="overflow-x-auto rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-2">
        <div className="flex min-w-max gap-2">
          {REIMBURSEMENT_TAB_ORDER.map((tid) => (
            <button
              key={tid}
              type="button"
              onClick={() => {
                setActiveTab(tid);
                setPage(1);
              }}
              className={[
                "rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap",
                activeTab === tid ? "bg-[#2563eb] text-white" : "bg-white text-[#475569] hover:bg-[#eef4ff]",
              ].join(" ")}
            >
              {REIMBURSEMENT_TAB_LABELS[tid]}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "overview" ? (
        <div className="stat-cards-grid">
          <LeadSummaryCard title="Total Claims" value={stats.total} loading={loading} />
          <LeadSummaryCard title="Pending Claims" value={stats.pending} loading={loading} />
          <LeadSummaryCard title="Special Approval" value={stats.special} loading={loading} />
          <LeadSummaryCard title="Approved Amount" value={formatInr(stats.approvedAmount)} loading={loading} />
          <LeadSummaryCard title="Reimbursed Amount" value={formatInr(stats.reimbursedAmount)} loading={loading} />
          <LeadSummaryCard title="Rejected Amount" value={formatInr(stats.rejectedAmount)} loading={loading} accent="rose" />
          <LeadSummaryCard title="This Month Claims" value={stats.thisMonth} loading={loading} />
          <LeadSummaryCard title="Average Claim" value={formatInr(stats.average)} loading={loading} />
        </div>
      ) : null}

      {activeTab === "reports" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-[#dbe6f3] bg-white p-4">
            <h3 className="font-semibold text-[#0f172a]">By status</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {(["Pending", "Special Approval Required", "Approved", "Reimbursed", "Rejected"] as const).map((status) => {
                const count = claims.filter((c) => c.approval_status === status).length;
                const amt = claims.filter((c) => c.approval_status === status).reduce((s, c) => s + Number(c.amount), 0);
                return (
                  <li key={status} className="flex justify-between border-b border-[#f1f5f9] py-1">
                    <span>{status}</span>
                    <span className="font-medium">
                      {count} · {formatInr(amt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </article>
          <article className="rounded-2xl border border-[#dbe6f3] bg-white p-4">
            <h3 className="font-semibold text-[#0f172a]">By budget type</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {BUDGET_TYPES.map((type) => {
                const subset = claims.filter((c) => (c.budget_type ?? "Low Budget") === type);
                return (
                  <li key={type} className="flex justify-between border-b border-[#f1f5f9] py-1">
                    <span>{type}</span>
                    <span className="font-medium">
                      {subset.length} · {formatInr(subset.reduce((s, c) => s + Number(c.amount), 0))}
                    </span>
                  </li>
                );
              })}
            </ul>
          </article>
        </div>
      ) : null}

      {activeTab === "policy" ? (
        <article className="max-w-2xl space-y-4 rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-5">
          <h3 className="text-lg font-semibold text-[#0f172a]">Policy settings</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase text-[#64748b]">Low budget limit (₹)</span>
              <Input type="number" value={policyForm.low_budget_limit} onChange={(e) => setPolicyForm({ ...policyForm, low_budget_limit: Number(e.target.value) })} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase text-[#64748b]">Standard limit (₹)</span>
              <Input type="number" value={policyForm.standard_limit} onChange={(e) => setPolicyForm({ ...policyForm, standard_limit: Number(e.target.value) })} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase text-[#64748b]">Max file size (MB)</span>
              <Input type="number" value={policyForm.max_file_size_mb} onChange={(e) => setPolicyForm({ ...policyForm, max_file_size_mb: Number(e.target.value) })} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase text-[#64748b]">Processing days</span>
              <Input type="number" value={policyForm.processing_days} onChange={(e) => setPolicyForm({ ...policyForm, processing_days: Number(e.target.value) })} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={policyForm.allow_special_approval} onChange={(e) => setPolicyForm({ ...policyForm, allow_special_approval: e.target.checked })} />
            Allow special approval above limit
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={policyForm.approval_required} onChange={(e) => setPolicyForm({ ...policyForm, approval_required: e.target.checked })} />
            Approval required
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase text-[#64748b]">Allowed categories (comma-separated)</span>
            <Input value={policyForm.allowed_categories} onChange={(e) => setPolicyForm({ ...policyForm, allowed_categories: e.target.value })} />
          </label>
          <Button disabled={savingPolicy} onClick={() => void savePolicy()} className="rounded-full bg-[#2563eb] text-white hover:bg-[#1d4ed8]">
            {savingPolicy ? "Saving…" : "Save settings"}
          </Button>
        </article>
      ) : null}

      {showTable ? (
        <div className="space-y-3">
          <TableSearchBar value={search} onChange={setSearch} placeholder="Search employee, code, category…" />
          <div className="overflow-x-auto rounded-[20px] border border-[#dbe6f3] bg-white shadow-sm">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-[#f1f6fc] text-xs uppercase text-[#64748b]">
                <tr>
                  {["Code", "Employee", "Dept", "Type", "Category", "Amount", "Limit", "Status", "Submitted", "Actions"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={10} className="px-3 py-3">
                          <div className="h-4 animate-pulse rounded bg-slate-100" />
                        </td>
                      </tr>
                    ))
                  : paginatedItems.map((c) => {
                      const p = profileMap[c.employee_id];
                      const limitLabel = getLimitLabel(c, effectivePolicy);
                      const statusClass = STATUS_BADGE_CLASS[c.approval_status] ?? "bg-slate-100 text-slate-700";
                      return (
                        <tr key={c.id} className="border-t border-[#eef2ff]">
                          <td className="px-3 py-2 font-mono text-xs">{c.claim_code ?? "—"}</td>
                          <td className="px-3 py-2">{p?.full_name || p?.email || c.employee_id.slice(0, 8)}</td>
                          <td className="px-3 py-2">{p?.department ?? "—"}</td>
                          <td className="px-3 py-2">{c.budget_type ?? "Low Budget"}</td>
                          <td className="px-3 py-2">{c.category ?? c.expense_type ?? "—"}</td>
                          <td className="px-3 py-2 font-semibold">{formatInr(Number(c.amount))}</td>
                          <td className="px-3 py-2">
                            <span className={limitLabel === "Over Limit" ? "text-rose-700 font-medium" : "text-emerald-700"}>{limitLabel}</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass}`}>
                              {c.approval_status}
                            </span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">{formatSubmittedAt(c.created_at)}</td>
                          <td className="space-x-1 px-3 py-2 whitespace-nowrap">
                            {c.receipt_url || c.bill_urls?.length ? (
                              <a
                                href={c.receipt_url ?? c.bill_urls?.[0]?.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-semibold text-blue-700"
                              >
                                Receipt
                              </a>
                            ) : null}
                            {(c.approval_status === "Pending" || c.approval_status === "Special Approval Required") && (
                              <>
                                <button type="button" className="text-xs font-semibold text-emerald-700" onClick={() => handleApprove(c)}>
                                  Approve
                                </button>
                                <button type="button" className="text-xs font-semibold text-rose-700" onClick={() => handleReject(c)}>
                                  Reject
                                </button>
                              </>
                            )}
                            {c.approval_status === "Approved" && (
                              <button type="button" className="text-xs font-semibold text-blue-700" onClick={() => handleReimburse(c)}>
                                Mark reimbursed
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                {!loading && !filteredClaims.length ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-8 text-center text-[#64748b]">
                      No claims.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={page}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            alwaysShow
          />
        </div>
      ) : null}
    </section>
  );
}
