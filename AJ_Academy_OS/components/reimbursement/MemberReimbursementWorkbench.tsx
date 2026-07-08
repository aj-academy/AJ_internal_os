"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LeadSummaryCard } from "@/components/client-lead/LeadSummaryCard";
import { TablePagination } from "@/components/ui/TablePagination";
import { PAYMENT_METHODS } from "@/components/finance/financeConfig";
import {
  MEMBER_REIMBURSEMENT_TAB_LABELS,
  MEMBER_REIMBURSEMENT_TAB_ORDER,
} from "@/components/reimbursement/memberReimbursementConfig";
import { ReimbursementBillUpload } from "@/components/reimbursement/ReimbursementBillUpload";
import { parseBillUrls, uploadReimbursementBills } from "@/lib/reimbursementBills";
import {
  BUDGET_TYPES,
  formatInr,
  formatSubmittedAt,
  isMissingReimbursementSchema,
  makeReimbursementCode,
  parseCategories,
  REIMBURSEMENT_CLAIM_SELECT,
  resolveInitialClaimStatus,
  STATUS_BADGE_CLASS,
  todayISO,
} from "@/lib/reimbursementHelpers";
import { usePagination } from "@/lib/usePagination";
import type { MemberReimbursementTabId } from "@/components/reimbursement/memberReimbursementConfig";
import type { ReimbursementClaimRow, ReimbursementPolicySettings } from "@/types/reimbursement";

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

const initialForm = {
  budget_type: "Standard",
  category: "",
  amount: "",
  expense_date: todayISO(),
  payment_method: PAYMENT_METHODS[2] as string,
  reason: "",
};

export function MemberReimbursementWorkbench() {
  const supabase = useMemo(() => createClient(), []);
  const [activeTab, setActiveTab] = useState<MemberReimbursementTabId>("overview");
  const [userId, setUserId] = useState("");
  const [claims, setClaims] = useState<ReimbursementClaimRow[]>([]);
  const [policy, setPolicy] = useState<ReimbursementPolicySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [activeClaimId, setActiveClaimId] = useState<string | null>(null);
  const [importClaimId, setImportClaimId] = useState("");

  const categories = useMemo(
    () => (policy ? parseCategories(policy.allowed_categories) : ["Travel", "Food", "Office Purchase"]),
    [policy],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again.");
      setUserId(user.id);

      const [claimsRes, policyRes] = await Promise.all([
        supabase
          .from("expense_claims")
          .select(REIMBURSEMENT_CLAIM_SELECT)
          .eq("employee_id", user.id)
          .order("created_at", { ascending: false }),
        supabase.from("reimbursement_policy_settings").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

      if (claimsRes.error) {
        if (isMissingReimbursementSchema(claimsRes.error.message)) setSchemaMissing(true);
        throw new Error(claimsRes.error.message);
      }

      const mapped = (claimsRes.data ?? []).map((r) => mapClaim(r as Record<string, unknown>));
      setClaims(mapped);
      setActiveClaimId((prev) => {
        if (prev && mapped.some((c) => c.id === prev)) return prev;
        return mapped.find((c) => c.approval_status === "Draft")?.id ?? null;
      });

      if (policyRes.data) {
        setPolicy(policyRes.data as ReimbursementPolicySettings);
        const cats = parseCategories(String((policyRes.data as ReimbursementPolicySettings).allowed_categories));
        if (cats.length) setForm((f) => ({ ...f, category: f.category || cats[0] }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load reimbursements.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const effectivePolicy: ReimbursementPolicySettings = policy ?? {
    id: "",
    low_budget_limit: 300,
    standard_limit: 1000,
    allow_special_approval: true,
    max_file_size_mb: 5,
    processing_days: 7,
    approval_required: true,
    allowed_categories: "Travel, Food, Office Purchase",
    updated_at: "",
  };

  const submittedClaims = useMemo(() => claims.filter((c) => c.approval_status !== "Draft"), [claims]);

  const stats = useMemo(() => {
    const pending = submittedClaims.filter(
      (c) => c.approval_status === "Pending" || c.approval_status === "Special Approval Required",
    );
    const approved = submittedClaims.filter((c) => c.approval_status === "Approved");
    const rejected = submittedClaims.filter((c) => c.approval_status === "Rejected");
    const reimbursed = submittedClaims.filter((c) => c.approval_status === "Reimbursed");
    return {
      total: submittedClaims.length,
      pending: pending.length,
      approved: approved.length,
      rejected: rejected.length,
      reimbursedAmount: reimbursed.reduce((s, c) => s + Number(c.amount), 0),
      pendingAmount: pending.reduce((s, c) => s + Number(c.amount), 0),
    };
  }, [submittedClaims]);

  const attachableClaims = useMemo(
    () => claims.filter((c) => c.approval_status === "Draft" || c.approval_status === "Pending"),
    [claims],
  );

  const { paginatedItems, page, setPage, totalPages, totalItems, pageSize } = usePagination(submittedClaims, 10);

  const buildPayload = (asDraft: boolean) => {
    const amt = Number(form.amount) || 0;
    const approval_status: ReimbursementClaimRow["approval_status"] = asDraft
      ? "Draft"
      : resolveInitialClaimStatus(amt, form.budget_type, effectivePolicy);
    return {
      claim_code: makeReimbursementCode(),
      employee_id: userId,
      expense_type: form.category || categories[0] || "Other",
      category: form.category || categories[0] || "Other",
      budget_type: form.budget_type,
      amount: asDraft ? Math.max(amt, 0) : amt,
      expense_date: form.expense_date || todayISO(),
      payment_method: form.payment_method,
      reason: form.reason || null,
      approval_status,
    };
  };

  const ensureClaimForUpload = async (): Promise<string> => {
    if (!userId) throw new Error("Please sign in again.");
    if (activeClaimId) return activeClaimId;

    const payload = buildPayload(true);
    const { data, error: err } = await supabase.from("expense_claims").insert(payload).select("id").single();
    if (err) throw err;
    const nextId = String(data.id);
    setActiveClaimId(nextId);
    setSuccess("Draft created. Uploading bills now.");
    return nextId;
  };

  const saveDraft = async () => {
    if (!userId) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = buildPayload(true);
      if (activeClaimId) {
        const { error: err } = await supabase
          .from("expense_claims")
          .update({
            category: payload.category,
            expense_type: payload.expense_type,
            budget_type: payload.budget_type,
            amount: payload.amount,
            expense_date: payload.expense_date,
            payment_method: payload.payment_method,
            reason: payload.reason,
            approval_status: "Draft",
          })
          .eq("id", activeClaimId)
          .eq("employee_id", userId);
        if (err) throw err;
      } else {
        const { data, error: err } = await supabase
          .from("expense_claims")
          .insert(payload)
          .select("id")
          .single();
        if (err) throw err;
        if (data?.id) setActiveClaimId(String(data.id));
      }
      setSuccess("Draft saved. You can now attach bills.");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save draft.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitClaim = async () => {
    if (!userId) return;
    const amt = Number(form.amount);
    if (!amt || amt <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!form.category) {
      setError("Select a category.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = buildPayload(false);
      if (activeClaimId) {
        const { error: err } = await supabase
          .from("expense_claims")
          .update({
            category: payload.category,
            expense_type: payload.expense_type,
            budget_type: payload.budget_type,
            amount: payload.amount,
            expense_date: payload.expense_date,
            payment_method: payload.payment_method,
            reason: payload.reason,
            approval_status: payload.approval_status,
          })
          .eq("id", activeClaimId)
          .eq("employee_id", userId);
        if (err) throw err;
      } else {
        const { data, error: err } = await supabase
          .from("expense_claims")
          .insert(payload)
          .select("id")
          .single();
        if (err) throw err;
        if (data?.id) setActiveClaimId(String(data.id));
      }
      setSuccess("Claim submitted for admin review.");
      setForm(initialForm);
      setActiveTab("claims");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit claim.");
    } finally {
      setSubmitting(false);
    }
  };

  const uploadBillsToClaim = async (claimId: string, files: File[]) => {
    if (!userId || !claimId) {
      setError("Save or submit a claim first, then attach bills.");
      return;
    }
    const claim = claims.find((c) => c.id === claimId);
    const uploaded = await uploadReimbursementBills(supabase, userId, claimId, files, effectivePolicy.max_file_size_mb);
    const merged = [...(claim?.bill_urls ?? []), ...uploaded];
    const primaryReceipt = merged[0]?.url ?? null;
    const { error: err } = await supabase
      .from("expense_claims")
      .update({ bill_urls: merged, receipt_url: primaryReceipt })
      .eq("id", claimId)
      .eq("employee_id", userId);
    if (err) throw err;
    setSuccess(`${uploaded.length} bill(s) attached.`);
    await loadData();
  };

  const deleteDraft = async (claimId: string) => {
    if (!confirm("Delete this draft?")) return;
    const { error: err } = await supabase.from("expense_claims").delete().eq("id", claimId).eq("employee_id", userId);
    if (err) {
      setError(err.message);
      return;
    }
    if (activeClaimId === claimId) setActiveClaimId(null);
    await loadData();
  };

  return (
    <section className="space-y-5 rounded-[24px] border border-[#d4deea] bg-white p-4 shadow-[0_20px_40px_rgba(30,64,175,0.08)] sm:p-6 lg:p-8">
      <header>
        <h2 className="text-3xl font-semibold text-slate-900">Reimbursement</h2>
        <p className="mt-1 text-sm text-slate-600">Submit bills, track reimbursement claims, and view approval status.</p>
      </header>

      {schemaMissing ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Run <strong>reimbursement_schema_patch.sql</strong> and <strong>reimbursement_member_patch.sql</strong> in Supabase.
        </div>
      ) : null}
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{success}</div> : null}

      <div className="overflow-x-auto rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-2">
        <div className="flex min-w-max gap-2">
          {MEMBER_REIMBURSEMENT_TAB_ORDER.map((tid) => (
            <button
              key={tid}
              type="button"
              onClick={() => setActiveTab(tid)}
              className={[
                "rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap",
                activeTab === tid ? "bg-[#2563eb] text-white" : "bg-white text-[#475569] hover:bg-[#eef4ff]",
              ].join(" ")}
            >
              {MEMBER_REIMBURSEMENT_TAB_LABELS[tid]}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "overview" ? (
        <div className="stat-cards-grid">
          <LeadSummaryCard title="Total claims submitted" value={stats.total} loading={loading} />
          <LeadSummaryCard title="Pending claims" value={stats.pending} loading={loading} />
          <LeadSummaryCard title="Approved claims" value={stats.approved} loading={loading} />
          <LeadSummaryCard title="Rejected claims" value={stats.rejected} loading={loading} accent="rose" />
          <LeadSummaryCard title="Amount reimbursed" value={formatInr(stats.reimbursedAmount)} loading={loading} />
          <LeadSummaryCard title="Amount pending" value={formatInr(stats.pendingAmount)} loading={loading} />
        </div>
      ) : null}

      {activeTab === "submit" ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <article className="space-y-4 rounded-2xl border border-[#dbe6f3] bg-white p-4">
            <h3 className="font-semibold text-slate-900">Submit claim</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Reimbursement type *</span>
                <select
                  className="h-9 w-full rounded-lg border border-[#cfdceb] px-2"
                  value={form.budget_type}
                  onChange={(e) => setForm({ ...form, budget_type: e.target.value })}
                >
                  {BUDGET_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Category *</span>
                <select
                  className="h-9 w-full rounded-lg border border-[#cfdceb] px-2"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  <option value="">Select</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Expense date *</span>
                <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Amount *</span>
                <Input type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="font-medium">Payment mode</span>
                <select
                  className="h-9 w-full rounded-lg border border-[#cfdceb] px-2"
                  value={form.payment_method}
                  onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="font-medium">Description / reason</span>
                <textarea
                  rows={4}
                  className="w-full rounded-xl border border-[#cfdceb] px-3 py-2 text-sm"
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={submitting} onClick={() => void submitClaim()} className="rounded-full bg-[#2563eb] text-white">
                {submitting ? "Submitting…" : "Submit claim"}
              </Button>
              <Button type="button" variant="outline" disabled={submitting} onClick={() => void saveDraft()} className="rounded-full">
                Save draft
              </Button>
            </div>
          </article>
          <ReimbursementBillUpload
            disabled={schemaMissing || submitting || !userId}
            maxMb={effectivePolicy.max_file_size_mb}
            onUpload={async (files) => {
              try {
                setError(null);
                const claimId = await ensureClaimForUpload();
                await uploadBillsToClaim(claimId, files);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not upload bills.");
              }
            }}
          />
        </div>
      ) : null}

      {activeTab === "claims" ? (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl border border-[#dbe6f3]">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-[#f1f6fc] text-xs uppercase text-[#64748b]">
                <tr>
                  {["Code", "Type", "Category", "Date", "Amount", "Status", "Submitted", "Action"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={8} className="px-3 py-3">
                          <div className="h-4 animate-pulse rounded bg-slate-100" />
                        </td>
                      </tr>
                    ))
                  : paginatedItems.map((c) => (
                      <tr key={c.id} className="border-t border-[#eef2ff]">
                        <td className="px-3 py-2 font-mono text-xs">{c.claim_code ?? "—"}</td>
                        <td className="px-3 py-2">{c.budget_type ?? "—"}</td>
                        <td className="px-3 py-2">{c.category ?? "—"}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{String(c.expense_date).slice(0, 10)}</td>
                        <td className="px-3 py-2 font-semibold">{formatInr(Number(c.amount))}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[c.approval_status] ?? ""}`}>
                            {c.approval_status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs">{formatSubmittedAt(c.created_at)}</td>
                        <td className="space-x-2 px-3 py-2 text-xs">
                          {c.bill_urls?.length || c.receipt_url ? (
                            <a href={c.receipt_url ?? c.bill_urls?.[0]?.url} target="_blank" rel="noreferrer" className="font-semibold text-blue-700">
                              Receipt
                            </a>
                          ) : (
                            <span className="text-[#94a3b8]">—</span>
                          )}
                          {c.approval_status === "Draft" ? (
                            <button type="button" className="font-semibold text-rose-600" onClick={() => void deleteDraft(c.id)}>
                              Delete
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                {!loading && !submittedClaims.length ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      No claims yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <TablePagination page={page} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} alwaysShow />
        </div>
      ) : null}

      {activeTab === "import" ? (
        <div className="max-w-2xl space-y-4">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Attach to claim</span>
            <select
              className="h-9 w-full rounded-lg border border-[#cfdceb] px-2"
              value={importClaimId}
              onChange={(e) => setImportClaimId(e.target.value)}
            >
              <option value="">Select claim…</option>
              {attachableClaims.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.claim_code ?? c.id.slice(0, 8)} — {c.approval_status} — {formatInr(Number(c.amount))}
                </option>
              ))}
            </select>
          </label>
          <ReimbursementBillUpload
            disabled={!importClaimId}
            hint="Import from device — attach to your latest draft or select a claim above."
            maxMb={effectivePolicy.max_file_size_mb}
            onUpload={async (files) => {
              if (!importClaimId) return;
              await uploadBillsToClaim(importClaimId, files);
            }}
          />
        </div>
      ) : null}

      {activeTab === "policy" ? (
        <article className="max-w-xl space-y-3 rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-5 text-sm text-slate-700">
          <h3 className="text-lg font-semibold text-slate-900">Policy & limits</h3>
          <ul className="space-y-2">
            <li>Low budget limit: {formatInr(effectivePolicy.low_budget_limit)}</li>
            <li>Standard limit: {formatInr(effectivePolicy.standard_limit)}</li>
            <li>Special approval above limit: {effectivePolicy.allow_special_approval ? "Allowed" : "Not allowed"}</li>
            <li>Max file size: {effectivePolicy.max_file_size_mb} MB per file</li>
            <li>Processing time: about {effectivePolicy.processing_days} business days after approval</li>
          </ul>
          <p className="text-xs text-[#64748b]">Claims above the configured limit require special approval.</p>
          <p className="text-xs text-[#94a3b8]">Allowed categories: {effectivePolicy.allowed_categories}</p>
        </article>
      ) : null}
    </section>
  );
}
