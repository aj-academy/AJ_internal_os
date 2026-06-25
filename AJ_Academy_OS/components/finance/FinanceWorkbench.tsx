"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { TablePagination } from "@/components/ui/TablePagination";
import { usePagination } from "@/lib/usePagination";
import { TableHeaderCell, TableHeaderFilter } from "@/components/ui/TableHeaderFilter";
import { TableSearchBar } from "@/components/ui/TableSearchBar";
import { Input } from "@/components/ui/input";
import { LeadSummaryCard } from "@/components/client-lead/LeadSummaryCard";
import {
  EXPENSE_CATEGORIES,
  FINANCE_TAB_LABELS,
  FINANCE_TAB_ORDER,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from "@/components/finance/financeConfig";
import {
  CLAIM_SELECT,
  PAYMENT_SELECT,
  TX_SELECT,
  displayClientName,
  formatInr,
  friendlyFinanceError,
  isMissingFinanceTable,
  monthKey,
} from "@/components/finance/financeHelpers";
import type { ClientOption, ProjectRow } from "@/types/project";
import type {
  ExpenseClaimRow,
  FinanceActivityRow,
  FinanceCategoryRow,
  FinanceTabId,
  FinanceTransactionRow,
  FinanceVariant,
  ProjectPaymentRow,
} from "@/types/finance";

type ProfileMini = { id: string; full_name: string | null; email: string | null };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function randSuffix() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function visibleTabsForVariant(v: FinanceVariant): FinanceTabId[] {
  if (v === "employee") return ["overview", "claims", "settings"];
  if (v === "manager") return ["overview", "payments", "dues", "pnl", "reports", "transactions", "settings"];
  return [...FINANCE_TAB_ORDER];
}

export function FinanceWorkbench({ variant, title = "Finance & Expense Management" }: { variant: FinanceVariant; title?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const isPrivileged = variant === "admin" || variant === "accounts";
  const isManager = variant === "manager";
  const isMemberPortal = variant === "employee";
  const visibleTabs = useMemo(() => visibleTabsForVariant(variant), [variant]);

  const [activeTab, setActiveTab] = useState<FinanceTabId>(() => visibleTabs[0] ?? "overview");
  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) setActiveTab(visibleTabs[0] ?? "overview");
  }, [activeTab, visibleTabs]);

  const [userId, setUserId] = useState("");
  const [transactions, setTransactions] = useState<FinanceTransactionRow[]>([]);
  const [claims, setClaims] = useState<ExpenseClaimRow[]>([]);
  const [payments, setPayments] = useState<ProjectPaymentRow[]>([]);
  const [categories, setCategories] = useState<FinanceCategoryRow[]>([]);
  const [activities, setActivities] = useState<FinanceActivityRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [employees, setEmployees] = useState<ProfileMini[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [fltTxType, setFltTxType] = useState("");
  const [fltTxCat, setFltTxCat] = useState("");
  const [fltTxFrom, setFltTxFrom] = useState("");
  const [fltTxTo, setFltTxTo] = useState("");
  const [fltTxMethod, setFltTxMethod] = useState("");
  const [fltTxStatus, setFltTxStatus] = useState("");
  const [txSearch, setTxSearch] = useState("");

  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);
  const projectMap = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);
  const employeeMap = useMemo(() => {
    const m: Record<string, string> = {};
    employees.forEach((e) => {
      m[e.id] = e.full_name || e.email || e.id.slice(0, 8);
    });
    return m;
  }, [employees]);

  const showToast = (type: "ok" | "err", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4200);
  };

  const loadCore = useCallback(async () => {
    let missingFinance = false;
    const run = async <T,>(fn: () => Promise<{ data: T | null; error: { message: string } | null }>): Promise<T | null> => {
      const { data, error: err } = await fn();
      if (err) {
        if (isMissingFinanceTable(err.message)) {
          missingFinance = true;
          return null;
        }
        throw new Error(err.message);
      }
      return data as T | null;
    };

    const tx = await run(async () =>
      await supabase.from("finance_transactions").select(TX_SELECT).order("transaction_date", { ascending: false }).limit(800).returns<FinanceTransactionRow[]>(),
    );
    if (missingFinance) {
      setSchemaMissing(true);
      setTransactions([]);
      setClaims([]);
      setPayments([]);
      return;
    }
    setSchemaMissing(false);
    setTransactions((tx as FinanceTransactionRow[] | null) ?? []);

    const cl = await run(async () =>
      await supabase.from("expense_claims").select(CLAIM_SELECT).order("created_at", { ascending: false }).limit(500).returns<ExpenseClaimRow[]>(),
    );
    setClaims((cl as ExpenseClaimRow[] | null) ?? []);

    const pay = await run(async () =>
      await supabase.from("project_payments").select(PAYMENT_SELECT).order("payment_date", { ascending: false }).limit(500).returns<ProjectPaymentRow[]>(),
    );
    setPayments((pay as ProjectPaymentRow[] | null) ?? []);

    const cat = await supabase.from("finance_categories").select("*").order("category_type").order("category_name").returns<FinanceCategoryRow[]>();
    if (!cat.error) setCategories((cat.data as FinanceCategoryRow[] | null) ?? []);

    if (isPrivileged || isManager) {
      const act = await supabase.from("finance_activities").select("*").order("created_at", { ascending: false }).limit(200).returns<FinanceActivityRow[]>();
      if (!act.error) setActivities((act.data as FinanceActivityRow[] | null) ?? []);
    } else {
      setActivities([]);
    }

    const pr = await supabase.from("projects").select("id,project_name,project_code,client_id,budget,pending_amount,advance_paid,deadline,project_manager").limit(400).returns<ProjectRow[]>();
    if (!pr.error) setProjects((pr.data as ProjectRow[] | null) ?? []);

    const clt = await supabase.from("clients").select("id,lead_name,name,company_name").limit(600).returns<ClientOption[]>();
    if (!clt.error) setClients((clt.data as ClientOption[] | null) ?? []);

    const em = await supabase
      .from("profiles")
      .select("id,full_name,email")
      .in("role", ["employee", "manager", "admin", "super_admin"])
      .eq("status", "active")
      .order("full_name")
      .returns<ProfileMini[]>();
    if (!em.error) setEmployees((em.data as ProfileMini[] | null) ?? []);
  }, [isManager, isPrivileged, supabase]);

  const reload = useCallback(async () => {
    if (!userId) return;
    setError(null);
    setLoading(true);
    try {
      await loadCore();
    } catch (e) {
      setError(friendlyFinanceError(e));
    } finally {
      setLoading(false);
    }
  }, [loadCore, userId]);

  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) setUserId(user.id);
    })();
  }, [supabase]);

  useEffect(() => {
    if (!userId) return;
    void reload();
  }, [reload, userId]);

  useEffect(() => {
    if (!userId || schemaMissing) return;
    const ch = supabase
      .channel("finance-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "finance_transactions" }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_claims" }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "project_payments" }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "finance_activities" }, () => void reload())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [reload, schemaMissing, supabase, userId]);

  const incomeRows = useMemo(() => transactions.filter((t) => t.transaction_type === "Income"), [transactions]);
  const expenseRows = useMemo(() => transactions.filter((t) => t.transaction_type === "Expense"), [transactions]);

  const totals = useMemo(() => {
    const revenue = incomeRows.reduce((a, t) => a + Number(t.amount ?? 0), 0);
    const officeExp = expenseRows.reduce((a, t) => a + Number(t.amount ?? 0), 0);
    const pendingPay = projects.reduce((a, p) => a + Number(p.pending_amount ?? 0), 0);
    const approvedClaims = claims.filter((c) => c.approval_status === "Approved").reduce((a, c) => a + Number(c.amount ?? 0), 0);
    const thisMonth = new Date().toISOString().slice(0, 7);
    const monthlyRev = incomeRows.filter((t) => String(t.transaction_date).slice(0, 7) === thisMonth).reduce((a, t) => a + Number(t.amount), 0);
    const monthlyExp = expenseRows.filter((t) => String(t.transaction_date).slice(0, 7) === thisMonth).reduce((a, t) => a + Number(t.amount), 0);
    const net = revenue - officeExp;
    const margin = revenue > 0 ? Math.round((net / revenue) * 1000) / 10 : 0;
    return {
      revenue,
      officeExp,
      net,
      margin,
      pendingPay,
      approvedClaims,
      monthlyRev,
      monthlyExp,
    };
  }, [claims, expenseRows, incomeRows, projects]);

  const overdueProjects = useMemo(() => {
    const t = todayISO();
    return projects.filter((p) => Number(p.pending_amount ?? 0) > 0 && p.deadline && String(p.deadline).slice(0, 10) < t);
  }, [projects]);

  const filteredTransactions = useMemo(() => {
    const q = txSearch.trim().toLowerCase();
    return transactions.filter((r) => {
      if (fltTxType && r.transaction_type !== fltTxType) return false;
      if (fltTxCat && (r.category || "") !== fltTxCat) return false;
      if (fltTxMethod && (r.payment_method || "") !== fltTxMethod) return false;
      if (fltTxStatus && (r.payment_status || "") !== fltTxStatus) return false;
      const d = String(r.transaction_date).slice(0, 10);
      if (fltTxFrom && d < fltTxFrom) return false;
      if (fltTxTo && d > fltTxTo) return false;
      if (q) {
        const hay = `${r.transaction_code ?? ""} ${r.category ?? ""} ${r.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, fltTxCat, fltTxFrom, fltTxMethod, fltTxStatus, fltTxTo, fltTxType, txSearch]);

  const txCategoryOptions = useMemo(
    () =>
      Array.from(new Set(transactions.map((t) => t.category).filter(Boolean) as string[]))
        .sort()
        .map((c) => ({ value: c, label: c })),
    [transactions],
  );

  const txFiltersActive = Boolean(
    txSearch.trim() || fltTxType || fltTxCat || fltTxFrom || fltTxTo || fltTxMethod || fltTxStatus,
  );

  const clearTxFilters = () => {
    setTxSearch("");
    setFltTxType("");
    setFltTxCat("");
    setFltTxFrom("");
    setFltTxTo("");
    setFltTxMethod("");
    setFltTxStatus("");
  };

  const [panel, setPanel] = useState<"none" | "income" | "expense" | "payment" | "claim">("none");
  const [incomeForm, setIncomeForm] = useState({
    category: INCOME_CATEGORIES[0] as string,
    amount: "",
    payment_method: PAYMENT_METHODS[0] as string,
    payment_status: "Paid",
    transaction_date: todayISO(),
    client_id: "",
    project_id: "",
    reference_number: "",
    description: "",
    attachment_url: "",
  });
  const [expenseForm, setExpenseForm] = useState({
    category: EXPENSE_CATEGORIES[0] as string,
    amount: "",
    payment_method: PAYMENT_METHODS[0] as string,
    payment_status: "Paid",
    transaction_date: todayISO(),
    description: "",
    attachment_url: "",
  });
  const [paymentForm, setPaymentForm] = useState({
    project_id: "",
    amount: "",
    payment_date: todayISO(),
    payment_method: PAYMENT_METHODS[1] as string,
    payment_status: "Paid" as string,
    invoice_number: "",
    notes: "",
  });
  const [claimForm, setClaimForm] = useState({
    expense_type: "Travel",
    amount: "",
    expense_date: todayISO(),
    payment_method: PAYMENT_METHODS[0] as string,
    reason: "",
    receipt_url: "",
  });

  const saveIncome = async () => {
    if (!isPrivileged || !userId) return;
    const amt = Number(incomeForm.amount);
    if (!amt || amt <= 0) {
      showToast("err", "Enter a valid amount.");
      return;
    }
    const code = `INC-${todayISO().replace(/-/g, "")}-${randSuffix()}`;
    const { error: err } = await supabase.from("finance_transactions").insert({
      transaction_code: code,
      transaction_type: "Income",
      category: incomeForm.category,
      amount: amt,
      payment_method: incomeForm.payment_method,
      payment_status: incomeForm.payment_status,
      transaction_date: incomeForm.transaction_date,
      project_id: incomeForm.project_id || null,
      client_id: incomeForm.client_id || null,
      reference_number: incomeForm.reference_number || null,
      description: incomeForm.description || null,
      attachment_url: incomeForm.attachment_url || null,
      created_by: userId,
    });
    if (err) {
      showToast("err", err.message);
      return;
    }
    showToast("ok", "Income recorded.");
    setPanel("none");
    await reload();
  };

  const saveExpense = async () => {
    if (!isPrivileged || !userId) return;
    const amt = Number(expenseForm.amount);
    if (!amt || amt <= 0) {
      showToast("err", "Enter a valid amount.");
      return;
    }
    const code = `EXP-${todayISO().replace(/-/g, "")}-${randSuffix()}`;
    const { error: err } = await supabase.from("finance_transactions").insert({
      transaction_code: code,
      transaction_type: "Expense",
      category: expenseForm.category,
      amount: amt,
      payment_method: expenseForm.payment_method,
      payment_status: expenseForm.payment_status,
      transaction_date: expenseForm.transaction_date,
      description: expenseForm.description || null,
      attachment_url: expenseForm.attachment_url || null,
      created_by: userId,
    });
    if (err) {
      showToast("err", err.message);
      return;
    }
    showToast("ok", "Expense recorded.");
    setPanel("none");
    await reload();
  };

  const savePayment = async () => {
    if ((!isPrivileged && !isManager) || !userId || !paymentForm.project_id) {
      showToast("err", "Choose a project.");
      return;
    }
    const amt = Number(paymentForm.amount);
    if (!amt || amt <= 0) {
      showToast("err", "Enter a valid amount.");
      return;
    }
    const proj = projectMap[paymentForm.project_id];
    const { error: err } = await supabase.from("project_payments").insert({
      project_id: paymentForm.project_id,
      client_id: proj?.client_id ?? null,
      amount: amt,
      payment_date: paymentForm.payment_date,
      payment_method: paymentForm.payment_method,
      payment_status: paymentForm.payment_status,
      invoice_number: paymentForm.invoice_number || null,
      notes: paymentForm.notes || null,
      created_by: userId,
    });
    if (err) {
      showToast("err", err.message);
      return;
    }
    showToast("ok", "Project payment saved. Project balances will refresh.");
    setPanel("none");
    await reload();
  };

  const saveClaim = async () => {
    if (!userId) return;
    const amt = Number(claimForm.amount);
    if (!amt || amt <= 0) {
      showToast("err", "Enter a valid amount.");
      return;
    }
    const code = `CLM-${todayISO().replace(/-/g, "")}-${randSuffix()}`;
    const { error: err } = await supabase.from("expense_claims").insert({
      claim_code: code,
      employee_id: userId,
      expense_type: claimForm.expense_type,
      amount: amt,
      expense_date: claimForm.expense_date,
      payment_method: claimForm.payment_method,
      reason: claimForm.reason || null,
      receipt_url: claimForm.receipt_url || null,
    });
    if (err) {
      showToast("err", err.message);
      return;
    }
    showToast("ok", "Claim submitted.");
    setPanel("none");
    await reload();
  };

  const approveClaim = async (c: ExpenseClaimRow) => {
    if (!isPrivileged || !userId) return;
    const { error: err } = await supabase
      .from("expense_claims")
      .update({ approval_status: "Approved", approved_by: userId, approved_at: new Date().toISOString(), rejection_reason: null })
      .eq("id", c.id);
    if (err) {
      showToast("err", err.message);
      return;
    }
    showToast("ok", "Claim approved. An expense transaction is created automatically.");
    await reload();
  };

  const rejectClaim = async (c: ExpenseClaimRow) => {
    if (!isPrivileged) return;
    const reason = window.prompt("Rejection reason?", "") ?? "";
    const { error: err } = await supabase
      .from("expense_claims")
      .update({ approval_status: "Rejected", rejection_reason: reason || "Rejected", approved_by: null, approved_at: null })
      .eq("id", c.id);
    if (err) {
      showToast("err", err.message);
      return;
    }
    showToast("ok", "Claim rejected.");
    await reload();
  };

  const deleteTransaction = async (id: string) => {
    if (!isPrivileged || !confirm("Delete this transaction?")) return;
    const { error: err } = await supabase.from("finance_transactions").delete().eq("id", id);
    if (err) showToast("err", err.message);
    else {
      showToast("ok", "Deleted.");
      await reload();
    }
  };

  const deletePayment = async (id: string) => {
    if ((!isPrivileged && !isManager) || !confirm("Delete this payment?")) return;
    const { error: err } = await supabase.from("project_payments").delete().eq("id", id);
    if (err) showToast("err", err.message);
    else {
      showToast("ok", "Deleted.");
      await reload();
    }
  };

  const markPaymentPaid = async (p: ProjectPaymentRow) => {
    if (!isPrivileged && !isManager) return;
    const { error: err } = await supabase.from("project_payments").update({ payment_status: "Paid" }).eq("id", p.id);
    if (err) showToast("err", err.message);
    else {
      showToast("ok", "Updated.");
      await reload();
    }
  };

  const catBreakdown = useMemo(() => {
    const m: Record<string, number> = {};
    expenseRows.forEach((t) => {
      const k = t.category || "Other";
      m[k] = (m[k] || 0) + Number(t.amount);
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [expenseRows]);

  const revenueByProject = useMemo(() => {
    const m: Record<string, number> = {};
    incomeRows.forEach((t) => {
      if (!t.project_id) return;
      m[t.project_id] = (m[t.project_id] || 0) + Number(t.amount);
    });
    return Object.entries(m)
      .map(([pid, amt]) => ({ pid, amt, name: projectMap[pid]?.project_name || pid }))
      .sort((a, b) => b.amt - a.amt);
  }, [incomeRows, projectMap]);

  const revenueByClient = useMemo(() => {
    const m: Record<string, number> = {};
    incomeRows.forEach((t) => {
      if (!t.client_id) return;
      m[t.client_id] = (m[t.client_id] || 0) + Number(t.amount);
    });
    return Object.entries(m)
      .map(([cid, amt]) => ({ cid, amt, name: displayClientName(clientMap[cid] || {}) }))
      .sort((a, b) => b.amt - a.amt);
  }, [clientMap, incomeRows]);

  const visibleClaims = useMemo(() => {
    if (isPrivileged || isManager) return claims;
    if (isMemberPortal && userId) return claims.filter((c) => c.employee_id === userId);
    return claims;
  }, [claims, isManager, isMemberPortal, isPrivileged, userId]);

  const {
    paginatedItems: paginatedClaims,
    page: claimsPage,
    setPage: setClaimsPage,
    totalPages: claimsTotalPages,
    totalItems: claimsTotalItems,
    pageSize: claimsPageSize,
  } = usePagination(visibleClaims, 10);

  return (
    <section className="space-y-5 rounded-[24px] border border-[#e8dcc8] bg-white p-4 sm:p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold text-[#0f172a]">{title}</h2>
          <p className="mt-1 text-sm text-[#64748b]">
            {isMemberPortal
              ? "Submit reimbursement claims and track approval status."
              : "Manage company revenue, expenses, project payments and financial tracking."}
          </p>
        </div>
        <Button variant="outline" className="h-9 rounded-full border-[#e8dcc8]" disabled={loading || schemaMissing} onClick={() => void reload()}>
          Refresh
        </Button>
      </header>

      {toast ? (
        <div
          className={[
            "fixed bottom-6 right-6 z-[100] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-lg",
            toast.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900",
          ].join(" ")}
        >
          {toast.text}
        </div>
      ) : null}

      {schemaMissing ? (
        <div className="rounded-xl border border-blue-200 bg-[#faf3e3] px-4 py-3 text-sm text-blue-900">
          <p className="font-semibold">Database setup</p>
          <p className="mt-1">Run <strong>AJ_Academy_SB/finance_schema.sql</strong> in Supabase after Project Master, then refresh.</p>
        </div>
      ) : null}
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</div> : null}

      <div className="overflow-x-auto rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-2">
        <div className="flex min-w-max gap-2">
          {visibleTabs.map((tid) => (
            <button
              key={tid}
              type="button"
              onClick={() => setActiveTab(tid)}
              className={
                activeTab === tid
                  ? "rounded-xl bg-[#c9a227] px-3 py-2 text-sm font-semibold text-white shadow-md"
                  : "rounded-xl bg-white px-3 py-2 text-sm font-semibold text-[#475569] hover:bg-[#eaf1ff]"
              }
            >
              {FINANCE_TAB_LABELS[tid]}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "overview" ? (
        <>
          <div className="stat-cards-grid">
            <LeadSummaryCard title="Total Revenue" value={formatInr(totals.revenue)} loading={loading} />
            <LeadSummaryCard title="Total Expenses" value={formatInr(totals.officeExp)} loading={loading} />
            <LeadSummaryCard title="Net Profit" value={formatInr(totals.net)} loading={loading} />
            <LeadSummaryCard title="Pending Payments (projects)" value={formatInr(totals.pendingPay)} loading={loading} />
            <LeadSummaryCard title="Approved claims (lifetime)" value={formatInr(totals.approvedClaims)} loading={loading} />
            <LeadSummaryCard title="Monthly revenue" value={formatInr(totals.monthlyRev)} loading={loading} />
            <LeadSummaryCard title="Monthly expenses" value={formatInr(totals.monthlyExp)} loading={loading} />
            <LeadSummaryCard title="Outstanding dues (overdue count)" value={overdueProjects.length} loading={loading} accent="rose" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-[#64748b]">Revenue vs expense</p>
              <div className="mt-3 flex gap-4 text-sm">
                <div className="flex-1">
                  <p className="text-[#64748b]">Revenue</p>
                  <div className="mt-1 h-3 rounded-full bg-slate-100">
                    <div
                      className="h-3 rounded-full bg-[#c9a227]"
                      style={{ width: `${Math.min(100, totals.revenue + totals.officeExp > 0 ? (totals.revenue / (totals.revenue + totals.officeExp)) * 100 : 0)}%` }}
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-[#64748b]">Expense</p>
                  <div className="mt-1 h-3 rounded-full bg-slate-100">
                    <div
                      className="h-3 rounded-full bg-slate-500"
                      style={{ width: `${Math.min(100, totals.revenue + totals.officeExp > 0 ? (totals.officeExp / (totals.revenue + totals.officeExp)) * 100 : 0)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-[#64748b]">Expense category breakdown</p>
              <ul className="mt-2 space-y-2 text-sm">
                {catBreakdown.slice(0, 8).map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span>{k}</span>
                    <span className="font-medium">{formatInr(v)}</span>
                  </li>
                ))}
                {!catBreakdown.length ? <li className="text-[#64748b]">No expense data yet.</li> : null}
              </ul>
            </div>
          </div>
          {(isPrivileged || isManager) && activities.length ? (
            <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-[#64748b]">Recent finance activity</p>
              <ul className="mt-2 max-h-52 space-y-2 overflow-y-auto text-sm text-[#475569]">
                {activities.slice(0, 25).map((a) => (
                  <li key={a.id} className="border-b border-[#f1f5f9] pb-2">
                    <span className="font-medium text-[#0f172a]">{a.activity_type}</span>
                    <span className="text-xs text-[#94a3b8]"> · {new Date(a.created_at).toLocaleString()}</span>
                    {a.notes ? <p className="text-xs">{a.notes}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}

      {activeTab === "income" && isPrivileged ? (
        <FinanceTableSection
          title="Income"
          actionLabel="+ Add income"
          onAction={() => setPanel("income")}
          loading={loading}
          rows={incomeRows}
          columns={["Code", "Client", "Project", "Amount", "Category", "Method", "Date", "Status", "Actions"]}
          renderRow={(t) => (
            <tr key={t.id} className="border-t border-[#eef2ff]">
              <td className="px-3 py-2 font-mono text-xs">{t.transaction_code}</td>
              <td className="px-3 py-2">{t.client_id ? displayClientName(clientMap[t.client_id] || {}) : "—"}</td>
              <td className="px-3 py-2">{t.project_id ? projectMap[t.project_id]?.project_name ?? "—" : "—"}</td>
              <td className="px-3 py-2 font-semibold">{formatInr(Number(t.amount))}</td>
              <td className="px-3 py-2">{t.category}</td>
              <td className="px-3 py-2">{t.payment_method}</td>
              <td className="px-3 py-2 whitespace-nowrap">{String(t.transaction_date).slice(0, 10)}</td>
              <td className="px-3 py-2">{t.payment_status}</td>
              <td className="px-3 py-2">
                <button type="button" className="text-rose-600 text-xs font-semibold hover:underline" onClick={() => void deleteTransaction(t.id)}>
                  Delete
                </button>
              </td>
            </tr>
          )}
        />
      ) : null}

      {activeTab === "expenses" && isPrivileged ? (
        <FinanceTableSection
          title="Office & company expenses"
          actionLabel="+ Add expense"
          onAction={() => setPanel("expense")}
          loading={loading}
          rows={expenseRows}
          columns={["Code", "Category", "Amount", "Date", "Method", "By", "Actions"]}
          renderRow={(t) => (
            <tr key={t.id} className="border-t border-[#eef2ff]">
              <td className="px-3 py-2 font-mono text-xs">{t.transaction_code}</td>
              <td className="px-3 py-2">{t.category}</td>
              <td className="px-3 py-2 font-semibold">{formatInr(Number(t.amount))}</td>
              <td className="px-3 py-2 whitespace-nowrap">{String(t.transaction_date).slice(0, 10)}</td>
              <td className="px-3 py-2">{t.payment_method}</td>
              <td className="px-3 py-2">{t.created_by ? employeeMap[t.created_by] || "—" : "—"}</td>
              <td className="px-3 py-2">
                <button type="button" className="text-rose-600 text-xs font-semibold hover:underline" onClick={() => void deleteTransaction(t.id)}>
                  Delete
                </button>
              </td>
            </tr>
          )}
        />
      ) : null}

      {activeTab === "claims" ? (
        <div className="space-y-3">
          {(isPrivileged || isMemberPortal) ? (
            <div className="flex justify-end">
              <Button className="h-9 rounded-full bg-[#c9a227] px-4 text-white" onClick={() => setPanel("claim")} disabled={schemaMissing}>
                + New claim
              </Button>
            </div>
          ) : null}
          <div className="overflow-x-auto rounded-[20px] border border-[#dbe6f3] bg-white shadow-sm">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-[#f1f6fc] text-xs uppercase text-[#64748b]">
                <tr>
                  {(isMemberPortal
                    ? ["Code", "Type", "Amount", "Date", "Status", "Actions"]
                    : ["Code", "Employee", "Type", "Amount", "Date", "Status", "Actions"]
                  ).map((h) => (
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
                        <td colSpan={isMemberPortal ? 6 : 7} className="px-3 py-3">
                          <div className="h-4 animate-pulse rounded bg-slate-100" />
                        </td>
                      </tr>
                    ))
                  : paginatedClaims.map((c) => (
                      <tr key={c.id} className="border-t border-[#eef2ff]">
                        <td className="px-3 py-2 font-mono text-xs">{c.claim_code}</td>
                        {!isMemberPortal ? (
                          <td className="px-3 py-2">{employeeMap[c.employee_id] || c.employee_id.slice(0, 8)}</td>
                        ) : null}
                        <td className="px-3 py-2">{c.expense_type}</td>
                        <td className="px-3 py-2 font-semibold">{formatInr(Number(c.amount))}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{String(c.expense_date).slice(0, 10)}</td>
                        <td className="px-3 py-2">{c.approval_status}</td>
                        <td className="space-x-2 px-3 py-2">
                          {c.receipt_url ? (
                            <a href={c.receipt_url} target="_blank" rel="noreferrer" className="text-blue-700 text-xs font-semibold">
                              Receipt
                            </a>
                          ) : (
                            <span className="text-xs text-[#94a3b8]">—</span>
                          )}
                          {isPrivileged && c.approval_status === "Pending" ? (
                            <>
                              <button type="button" data-requires-online className="text-emerald-700 text-xs font-semibold" onClick={() => void approveClaim(c)}>
                                Approve
                              </button>
                              <button type="button" data-requires-online className="text-rose-700 text-xs font-semibold" onClick={() => void rejectClaim(c)}>
                                Reject
                              </button>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                {!loading && !visibleClaims.length ? (
                  <tr>
                    <td colSpan={isMemberPortal ? 6 : 7} className="px-6 py-8 text-center text-[#64748b]">
                      No claims yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={claimsPage}
            totalPages={claimsTotalPages}
            totalItems={claimsTotalItems}
            pageSize={claimsPageSize}
            onPageChange={setClaimsPage}
          />
        </div>
      ) : null}

      {activeTab === "payments" && (isPrivileged || isManager) ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button className="h-9 rounded-full bg-[#c9a227] px-4 text-white" onClick={() => setPanel("payment")} disabled={schemaMissing}>
              + Add payment
            </Button>
          </div>
          <div className="overflow-x-auto rounded-[20px] border border-[#dbe6f3] bg-white shadow-sm">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-[#f1f6fc] text-xs uppercase text-[#64748b]">
                <tr>
                  {["Client", "Project", "Invoice", "Amount", "Date", "Method", "Status", "Actions"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const proj = projectMap[p.project_id];
                  const pendingProj = Number(proj?.pending_amount ?? 0);
                  return (
                    <tr key={p.id} className="border-t border-[#eef2ff]">
                      <td className="px-3 py-2">{p.client_id ? displayClientName(clientMap[p.client_id] || {}) : proj?.client_id ? displayClientName(clientMap[proj.client_id!] || {}) : "—"}</td>
                      <td className="px-3 py-2 font-medium">{proj?.project_name ?? "—"}</td>
                      <td className="px-3 py-2">{p.invoice_number || "—"}</td>
                      <td className="px-3 py-2 font-semibold">{formatInr(Number(p.amount))}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{String(p.payment_date).slice(0, 10)}</td>
                      <td className="px-3 py-2">{p.payment_method}</td>
                      <td className="px-3 py-2">{p.payment_status}</td>
                      <td className="space-x-2 px-3 py-2 text-xs">
                        <span className="text-[#64748b]">Pending on project: {formatInr(pendingProj)}</span>
                        {p.payment_status !== "Paid" ? (
                          <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={() => void markPaymentPaid(p)}>
                            Mark paid
                          </button>
                        ) : null}
                        {isPrivileged || isManager ? (
                          <button type="button" className="font-semibold text-rose-600 hover:underline" onClick={() => void deletePayment(p.id)}>
                            Delete
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
                {!loading && !payments.length ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-[#64748b]">
                      No project payments yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {activeTab === "dues" && (isPrivileged || isManager) ? (
        <div className="space-y-4">
          <div className="stat-cards-grid-3">
            <LeadSummaryCard title="Total pending (projects)" value={formatInr(totals.pendingPay)} loading={loading} />
            <LeadSummaryCard title="Overdue rows" value={overdueProjects.length} loading={loading} accent="rose" />
            <LeadSummaryCard title="Projects with balance" value={projects.filter((p) => Number(p.pending_amount) > 0).length} loading={loading} />
          </div>
          <div className="overflow-x-auto rounded-[20px] border border-[#dbe6f3] bg-white shadow-sm">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-[#f1f6fc] text-xs uppercase text-[#64748b]">
                <tr>
                  {["Client", "Project", "Due amount", "Deadline", "Manager", "Status"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects
                  .filter((p) => Number(p.pending_amount) > 0)
                  .map((p) => {
                    const overdue = p.deadline && String(p.deadline).slice(0, 10) < todayISO();
                    return (
                      <tr key={p.id} className={overdue ? "border-t border-rose-100 bg-rose-50/80" : "border-t border-[#eef2ff]"}>
                        <td className="px-3 py-2">{p.client_id ? displayClientName(clientMap[p.client_id] || {}) : "—"}</td>
                        <td className="px-3 py-2 font-medium">{p.project_name}</td>
                        <td className="px-3 py-2 font-semibold">{formatInr(Number(p.pending_amount))}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{p.deadline ? String(p.deadline).slice(0, 10) : "—"}</td>
                        <td className="px-3 py-2">{p.project_manager ? employeeMap[p.project_manager] || "—" : "—"}</td>
                        <td className="px-3 py-2">{overdue ? "Overdue" : "Pending"}</td>
                      </tr>
                    );
                  })}
                {!loading && !projects.filter((p) => Number(p.pending_amount) > 0).length ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-[#64748b]">
                      No pending balances on projects.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {activeTab === "pnl" && (isPrivileged || isManager) ? (
        <div className="space-y-4">
          <div className="stat-cards-grid">
            <LeadSummaryCard title="Total revenue" value={formatInr(totals.revenue)} loading={loading} />
            <LeadSummaryCard title="Total expenses" value={formatInr(totals.officeExp)} loading={loading} />
            <LeadSummaryCard title="Net profit" value={formatInr(totals.net)} loading={loading} />
            <LeadSummaryCard title="Profit margin %" value={`${totals.margin}%`} loading={loading} />
          </div>
          <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 text-sm text-[#475569]">
            <p className="font-semibold text-[#0f172a]">Monthly P&amp;L (transactions)</p>
            <ul className="mt-2 space-y-1">
              {(() => {
                const src = transactions;
                const buckets: Record<string, { inc: number; exp: number }> = {};
                src.forEach((t) => {
                  const k = monthKey(new Date(String(t.transaction_date)));
                  if (!buckets[k]) buckets[k] = { inc: 0, exp: 0 };
                  if (t.transaction_type === "Income") buckets[k].inc += Number(t.amount);
                  else buckets[k].exp += Number(t.amount);
                });
                return Object.keys(buckets)
                  .sort()
                  .slice(-8)
                  .map((k) => (
                    <li key={k} className="flex justify-between">
                      <span>{k}</span>
                      <span>
                        {formatInr(buckets[k].inc - buckets[k].exp)} <span className="text-xs text-[#94a3b8]">(net)</span>
                      </span>
                    </li>
                  ));
              })()}
            </ul>
          </div>
          <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4">
            <p className="text-xs font-semibold uppercase text-[#64748b]">Top revenue projects (from income rows)</p>
            <ul className="mt-2 space-y-1 text-sm">
              {revenueByProject.slice(0, 6).map((r) => (
                <li key={r.pid} className="flex justify-between">
                  <span>{r.name}</span>
                  <span className="font-medium">{formatInr(r.amt)}</span>
                </li>
              ))}
              {!revenueByProject.length ? <li className="text-[#64748b]">No project-linked income yet.</li> : null}
            </ul>
          </div>
        </div>
      ) : null}

      {activeTab === "reports" && (isPrivileged || isManager) ? (
        <div className="space-y-6">
          <div className="stat-cards-grid-3">
            <LeadSummaryCard title="Avg project revenue (income w/ project)" value={formatInr(revenueByProject.length ? totals.revenue / Math.max(1, revenueByProject.length) : 0)} loading={loading} />
            <LeadSummaryCard title="Pending dues" value={formatInr(totals.pendingPay)} loading={loading} />
            <LeadSummaryCard title="Claims pending count" value={claims.filter((c) => c.approval_status === "Pending").length} loading={loading} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="rounded-full" disabled title="Export coming soon">
              Export Excel
            </Button>
            <Button type="button" variant="outline" className="rounded-full" disabled title="Export coming soon">
              Export PDF
            </Button>
          </div>
          <ReportBlock title="Revenue by project" rows={revenueByProject.map((r) => ({ label: r.name, value: formatInr(r.amt) }))} />
          <ReportBlock title="Revenue by client" rows={revenueByClient.map((r) => ({ label: r.name, value: formatInr(r.amt) }))} />
          <ReportBlock title="Expense by category" rows={catBreakdown.map(([k, v]) => ({ label: k, value: formatInr(v) }))} />
          <div className="overflow-x-auto rounded-[20px] border border-[#dbe6f3] bg-white p-4">
            <p className="text-sm font-semibold text-[#0f172a]">Payment status (project_payments)</p>
            <table className="mt-2 w-full min-w-[400px] text-sm">
              <tbody>
                {PAYMENT_STATUSES.map((st) => (
                  <tr key={st} className="border-t border-[#eef2ff]">
                    <td className="py-2">{st}</td>
                    <td className="py-2 text-right font-medium">{payments.filter((p) => p.payment_status === st).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {activeTab === "transactions" && (isPrivileged || isManager) ? (
        <div className="space-y-3">
          <TableSearchBar
            value={txSearch}
            onChange={setTxSearch}
            placeholder="Search code, category, description…"
            showClear={txFiltersActive}
            onClear={clearTxFilters}
            hint={`Showing ${filteredTransactions.length} of ${transactions.length} transaction(s)`}
          />
          <div className="overflow-x-auto rounded-[20px] border border-[#dbe6f3] bg-white shadow-sm">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-[#f1f6fc] text-xs uppercase text-[#64748b]">
                <tr>
                  <TableHeaderCell label="Code" />
                  <TableHeaderFilter
                    label="Type"
                    value={fltTxType}
                    onChange={setFltTxType}
                    options={[
                      { value: "Income", label: "Income" },
                      { value: "Expense", label: "Expense" },
                    ]}
                    allLabel="All types"
                  />
                  <TableHeaderFilter
                    label="Category"
                    value={fltTxCat}
                    onChange={setFltTxCat}
                    options={txCategoryOptions}
                    allLabel="All categories"
                  />
                  <TableHeaderCell label="Amount" />
                  <TableHeaderFilter label="Date from" type="date" value={fltTxFrom} onChange={setFltTxFrom} />
                  <TableHeaderFilter label="Date to" type="date" value={fltTxTo} onChange={setFltTxTo} />
                  <TableHeaderFilter
                    label="Method"
                    value={fltTxMethod}
                    onChange={setFltTxMethod}
                    options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
                    allLabel="All methods"
                  />
                  <TableHeaderFilter
                    label="Status"
                    value={fltTxStatus}
                    onChange={setFltTxStatus}
                    options={[
                      { value: "Paid", label: "Paid" },
                      { value: "Pending", label: "Pending" },
                      { value: "Partial", label: "Partial" },
                      { value: "Overdue", label: "Overdue" },
                    ]}
                    allLabel="All statuses"
                  />
                  <TableHeaderCell label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((t) => (
                  <tr key={t.id} className="border-t border-[#eef2ff]">
                    <td className="px-3 py-2 font-mono text-xs">{t.transaction_code}</td>
                    <td className="px-3 py-2">{t.transaction_type}</td>
                    <td className="px-3 py-2">{t.category}</td>
                    <td className="px-3 py-2 font-semibold">{formatInr(Number(t.amount))}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{String(t.transaction_date).slice(0, 10)}</td>
                    <td className="px-3 py-2">{t.payment_method}</td>
                    <td className="px-3 py-2">{t.payment_status}</td>
                    <td className="px-3 py-2">
                      {isPrivileged ? (
                        <button type="button" className="text-rose-600 text-xs font-semibold hover:underline" onClick={() => void deleteTransaction(t.id)}>
                          Delete
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {activeTab === "settings" ? (
        <div className="rounded-[20px] border border-[#dbe6f3] bg-[#f8fbff] p-6 text-sm text-[#475569] space-y-4">
          <div>
            <p className="font-semibold text-[#0f172a]">Income categories</p>
            <p className="mt-1">{INCOME_CATEGORIES.join(", ")}.</p>
          </div>
          <div>
            <p className="font-semibold text-[#0f172a]">Expense categories</p>
            <p className="mt-1">{EXPENSE_CATEGORIES.join(", ")}.</p>
          </div>
          <div>
            <p className="font-semibold text-[#0f172a]">Payment methods</p>
            <p className="mt-1">{PAYMENT_METHODS.join(", ")}.</p>
          </div>
          <p className="text-[#64748b]">Advanced finance settings (tax, currency, approval rules) coming soon. DB categories: {categories.length} rows in finance_categories.</p>
        </div>
      ) : null}

      {panel !== "none" ? (
        <>
          <button type="button" className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px]" aria-label="Close" onClick={() => setPanel("none")} />
          <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-white shadow-2xl lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[480px] lg:max-w-[100vw] lg:border-l lg:border-[#dbe6f3]">
            <div className="flex shrink-0 items-center justify-between border-b border-[#e8edf5] px-4 py-4 sm:px-5">
              <h3 className="text-lg font-semibold text-[#0f172a]">
                {panel === "income" ? "Add income" : panel === "expense" ? "Add expense" : panel === "payment" ? "Add project payment" : "New expense claim"}
              </h3>
              <button type="button" aria-label="Close" onClick={() => setPanel("none")} className="touch-target flex items-center justify-center rounded-full border border-[#e8dcc8] bg-white p-2 text-[#3d3428] shadow-sm transition hover:bg-[#faf3e3] active:scale-95">
                <span className="flex h-5 w-5 items-center justify-center text-lg font-semibold leading-none">×</span>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            <div className="mt-0 space-y-3 text-sm">
              {panel === "income" ? (
                <>
                  <Field label="Category">
                    <select className="h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-2" value={incomeForm.category} onChange={(e) => setIncomeForm({ ...incomeForm, category: e.target.value })}>
                      {INCOME_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Amount">
                    <Input className="h-9 border-[#e8dcc8]" value={incomeForm.amount} onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })} />
                  </Field>
                  <Field label="Payment method">
                    <select className="h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-2" value={incomeForm.payment_method} onChange={(e) => setIncomeForm({ ...incomeForm, payment_method: e.target.value })}>
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Status">
                    <select className="h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-2" value={incomeForm.payment_status} onChange={(e) => setIncomeForm({ ...incomeForm, payment_status: e.target.value })}>
                      <option value="Paid">Paid</option>
                      <option value="Pending">Pending</option>
                      <option value="Partial">Partial</option>
                    </select>
                  </Field>
                  <Field label="Date">
                    <Input type="date" className="h-9 border-[#e8dcc8]" value={incomeForm.transaction_date} onChange={(e) => setIncomeForm({ ...incomeForm, transaction_date: e.target.value })} />
                  </Field>
                  <Field label="Client">
                    <select className="h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-2" value={incomeForm.client_id} onChange={(e) => setIncomeForm({ ...incomeForm, client_id: e.target.value })}>
                      <option value="">—</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {displayClientName(c)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Project">
                    <select className="h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-2" value={incomeForm.project_id} onChange={(e) => setIncomeForm({ ...incomeForm, project_id: e.target.value })}>
                      <option value="">—</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.project_name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Reference #">
                    <Input className="h-9 border-[#e8dcc8]" value={incomeForm.reference_number} onChange={(e) => setIncomeForm({ ...incomeForm, reference_number: e.target.value })} />
                  </Field>
                  <Field label="Description">
                    <Input className="h-9 border-[#e8dcc8]" value={incomeForm.description} onChange={(e) => setIncomeForm({ ...incomeForm, description: e.target.value })} />
                  </Field>
                  <Field label="Attachment URL">
                    <Input className="h-9 border-[#e8dcc8]" placeholder="https://…" value={incomeForm.attachment_url} onChange={(e) => setIncomeForm({ ...incomeForm, attachment_url: e.target.value })} />
                  </Field>
                  <Button data-requires-online className="mt-2 w-full rounded-full bg-[#c9a227] text-white" onClick={() => void saveIncome()}>
                    Save income
                  </Button>
                </>
              ) : null}
              {panel === "expense" ? (
                <>
                  <Field label="Category">
                    <select className="h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-2" value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}>
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Amount">
                    <Input className="h-9 border-[#e8dcc8]" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
                  </Field>
                  <Field label="Payment method">
                    <select className="h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-2" value={expenseForm.payment_method} onChange={(e) => setExpenseForm({ ...expenseForm, payment_method: e.target.value })}>
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Status">
                    <select className="h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-2" value={expenseForm.payment_status} onChange={(e) => setExpenseForm({ ...expenseForm, payment_status: e.target.value })}>
                      <option value="Paid">Paid</option>
                      <option value="Pending">Pending</option>
                    </select>
                  </Field>
                  <Field label="Date">
                    <Input type="date" className="h-9 border-[#e8dcc8]" value={expenseForm.transaction_date} onChange={(e) => setExpenseForm({ ...expenseForm, transaction_date: e.target.value })} />
                  </Field>
                  <Field label="Description">
                    <Input className="h-9 border-[#e8dcc8]" value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} />
                  </Field>
                  <Field label="Attachment URL">
                    <Input className="h-9 border-[#e8dcc8]" value={expenseForm.attachment_url} onChange={(e) => setExpenseForm({ ...expenseForm, attachment_url: e.target.value })} />
                  </Field>
                  <Button data-requires-online className="mt-2 w-full rounded-full bg-[#c9a227] text-white" onClick={() => void saveExpense()}>
                    Save expense
                  </Button>
                </>
              ) : null}
              {panel === "payment" ? (
                <>
                  <Field label="Project">
                    <select className="h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-2" value={paymentForm.project_id} onChange={(e) => setPaymentForm({ ...paymentForm, project_id: e.target.value })}>
                      <option value="">Select project</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.project_name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Amount">
                    <Input className="h-9 border-[#e8dcc8]" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
                  </Field>
                  <Field label="Payment date">
                    <Input type="date" className="h-9 border-[#e8dcc8]" value={paymentForm.payment_date} onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })} />
                  </Field>
                  <Field label="Method">
                    <select className="h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-2" value={paymentForm.payment_method} onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}>
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Status">
                    <select className="h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-2" value={paymentForm.payment_status} onChange={(e) => setPaymentForm({ ...paymentForm, payment_status: e.target.value })}>
                      {PAYMENT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Invoice #">
                    <Input className="h-9 border-[#e8dcc8]" value={paymentForm.invoice_number} onChange={(e) => setPaymentForm({ ...paymentForm, invoice_number: e.target.value })} />
                  </Field>
                  <Field label="Notes">
                    <Input className="h-9 border-[#e8dcc8]" value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} />
                  </Field>
                  <Button data-requires-online className="mt-2 w-full rounded-full bg-[#c9a227] text-white" onClick={() => void savePayment()}>
                    Save payment
                  </Button>
                </>
              ) : null}
              {panel === "claim" ? (
                <>
                  <Field label="Expense type">
                    <Input className="h-9 border-[#e8dcc8]" value={claimForm.expense_type} onChange={(e) => setClaimForm({ ...claimForm, expense_type: e.target.value })} />
                  </Field>
                  <Field label="Amount">
                    <Input className="h-9 border-[#e8dcc8]" value={claimForm.amount} onChange={(e) => setClaimForm({ ...claimForm, amount: e.target.value })} />
                  </Field>
                  <Field label="Date">
                    <Input type="date" className="h-9 border-[#e8dcc8]" value={claimForm.expense_date} onChange={(e) => setClaimForm({ ...claimForm, expense_date: e.target.value })} />
                  </Field>
                  <Field label="Payment method (reimbursement)">
                    <select className="h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-2" value={claimForm.payment_method} onChange={(e) => setClaimForm({ ...claimForm, payment_method: e.target.value })}>
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Reason">
                    <Input className="h-9 border-[#e8dcc8]" value={claimForm.reason} onChange={(e) => setClaimForm({ ...claimForm, reason: e.target.value })} />
                  </Field>
                  <Field label="Receipt URL">
                    <Input className="h-9 border-[#e8dcc8]" placeholder="https://…" value={claimForm.receipt_url} onChange={(e) => setClaimForm({ ...claimForm, receipt_url: e.target.value })} />
                  </Field>
                  <Button data-requires-online className="mt-2 w-full rounded-full bg-[#c9a227] text-white" onClick={() => void saveClaim()}>
                    Submit claim
                  </Button>
                </>
              ) : null}
            </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase text-[#64748b]">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function FinanceTableSection<T>({
  title,
  actionLabel,
  onAction,
  loading,
  rows,
  columns,
  renderRow,
}: {
  title: string;
  actionLabel: string;
  onAction: () => void;
  loading: boolean;
  rows: T[];
  columns: string[];
  renderRow: (row: T) => ReactNode;
}) {
  const { paginatedItems, page, setPage, totalPages, totalItems, pageSize } = usePagination(rows, 10);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-[#0f172a]">{title}</h3>
        <Button className="h-9 rounded-full bg-[#c9a227] px-4 text-white" onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-[20px] border border-[#dbe6f3] bg-white shadow-sm">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-[#f1f6fc] text-xs uppercase text-[#64748b]">
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-3 py-2 text-left">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={columns.length} className="px-3 py-3">
                      <div className="h-4 animate-pulse rounded bg-slate-100" />
                    </td>
                  </tr>
                ))
              : paginatedItems.map(renderRow)}
            {!loading && !rows.length ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-8 text-center text-[#64748b]">
                  No rows yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <TablePagination page={page} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} />
    </div>
  );
}

function ReportBlock({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  return (
    <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-[#0f172a]">{title}</p>
      <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-sm">
        {rows.map((r) => (
          <li key={r.label} className="flex justify-between border-b border-[#f1f5f9] py-1">
            <span className="text-[#475569]">{r.label}</span>
            <span className="font-medium">{r.value}</span>
          </li>
        ))}
        {!rows.length ? <li className="text-[#64748b]">No data.</li> : null}
      </ul>
    </div>
  );
}
