"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LeadSummaryCard } from "@/components/client-lead/LeadSummaryCard";
import { LeadStatusBadge } from "@/components/client-lead/LeadStatusBadge";
import { LeadFormPanel, type LeadFormValue } from "@/components/client-lead/LeadFormPanel";
import type { ClientLeadRecord, LeadSource, LeadStatus } from "@/types/clientLead";

type AppRole = "admin" | "employee";

interface ClientLeadMasterPageProps {
  role: AppRole;
}

interface ProfileOption {
  id: string;
  full_name: string | null;
  email: string | null;
}

const PAGE_SIZE = 20;

function toReadableError(input: unknown) {
  const raw = input instanceof Error ? input.message : "Unexpected error.";
  if (raw.includes("Could not find the table 'public.clients'")) {
    return "Supabase table `public.clients` is missing. Run `client_lead_schema.sql` in Supabase SQL Editor, then refresh.";
  }
  return raw;
}

const initialForm: LeadFormValue = {
  name: "",
  company_name: "",
  email: "",
  phone: "",
  source: "Meta Ads",
  status: "Lead",
  requirement: "",
  budget: "",
  assigned_to: "",
  follow_up_date: "",
  notes: "",
};

export function ClientLeadMasterPage({ role }: ClientLeadMasterPageProps) {
  const supabase = useMemo(() => createClient(), []);
  const isAdmin = role === "admin";
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [rows, setRows] = useState<ClientLeadRecord[]>([]);
  const [employees, setEmployees] = useState<ProfileOption[]>([]);
  const [summary, setSummary] = useState({ total: 0, contacted: 0, converted: 0, lost: 0 });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "">("");
  const [sourceFilter, setSourceFilter] = useState<LeadSource | "">("");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [applied, setApplied] = useState({ search: "", status: "", source: "", assigned: "" });
  const [panelOpen, setPanelOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<LeadFormValue>(initialForm);

  const loadEmployees = useCallback(async () => {
    const { data, error: profilesError } = await supabase
      .from("profiles")
      .select("id,full_name,email")
      .in("role", ["employee", "manager"])
      .eq("status", "active")
      .order("full_name", { ascending: true })
      .returns<ProfileOption[]>();

    if (profilesError) throw new Error(profilesError.message);
    setEmployees(data ?? []);
  }, [supabase]);

  const loadSummary = useCallback(
    async (userId: string) => {
      let totalQuery = supabase.from("clients").select("id", { count: "exact", head: true });
      let contactedQuery = supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("status", "Contacted");
      let convertedQuery = supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("status", "Converted");
      let lostQuery = supabase.from("clients").select("id", { count: "exact", head: true }).eq("status", "Lost");

      if (!isAdmin) {
        totalQuery = totalQuery.eq("assigned_to", userId);
        contactedQuery = contactedQuery.eq("assigned_to", userId);
        convertedQuery = convertedQuery.eq("assigned_to", userId);
        lostQuery = lostQuery.eq("assigned_to", userId);
      }

      const [totalRes, contactedRes, convertedRes, lostRes] = await Promise.all([
        totalQuery,
        contactedQuery,
        convertedQuery,
        lostQuery,
      ]);

      const summaryError =
        totalRes.error ?? contactedRes.error ?? convertedRes.error ?? lostRes.error;
      if (summaryError) throw new Error(summaryError.message);

      setSummary({
        total: totalRes.count ?? 0,
        contacted: contactedRes.count ?? 0,
        converted: convertedRes.count ?? 0,
        lost: lostRes.count ?? 0,
      });
    },
    [isAdmin, supabase],
  );

  const loadTable = useCallback(
    async (userId: string) => {
      let query = supabase
        .from("clients")
        .select(
          "id,name,company_name,email,phone,source,status,budget,assigned_to,follow_up_date,requirement,notes,created_at",
          { count: "exact" },
        );

      if (!isAdmin) {
        query = query.eq("assigned_to", userId);
      }
      if (applied.status) query = query.eq("status", applied.status);
      if (applied.source) query = query.eq("source", applied.source);
      if (applied.assigned) query = query.eq("assigned_to", applied.assigned);
      if (applied.search) {
        const text = `%${applied.search}%`;
        query = query.or(`name.ilike.${text},email.ilike.${text},phone.ilike.${text}`);
      }

      query = query
        .order("follow_up_date", { ascending: true, nullsFirst: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      const { data, error: listError, count } = await query;
      if (listError) throw new Error(listError.message);
      setRows((data as ClientLeadRecord[] | null) ?? []);
      setTotalCount(count ?? 0);
    },
    [applied.assigned, applied.search, applied.source, applied.status, isAdmin, page, supabase],
  );

  const reload = useCallback(async () => {
    if (!currentUserId) return;
    setError(null);
    setLoading(true);
    try {
      await Promise.all([loadSummary(currentUserId), loadTable(currentUserId)]);
    } catch (reloadError) {
      setError(toReadableError(reloadError));
    } finally {
      setLoading(false);
    }
  }, [currentUserId, loadSummary, loadTable]);

  useEffect(() => {
    const bootstrap = async () => {
      setLoading(true);
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError) throw new Error(userError.message);
        if (!user?.id) throw new Error("Unable to resolve current user.");
        setCurrentUserId(user.id);
        await loadEmployees();
      } catch (bootstrapError) {
        setError(toReadableError(bootstrapError));
      } finally {
        setLoading(false);
      }
    };

    void bootstrap();
  }, [loadEmployees, supabase]);

  useEffect(() => {
    if (!currentUserId) return;
    const run = async () => {
      setError(null);
      setLoading(true);
      try {
        await Promise.all([loadSummary(currentUserId), loadTable(currentUserId)]);
      } catch (reloadError) {
        setError(toReadableError(reloadError));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [currentUserId, loadSummary, loadTable]);

  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel("client-leads-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => {
        void reload();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, reload, supabase]);

  const employeesForSelect = useMemo(
    () =>
      employees.map((employee) => ({
        id: employee.id,
        label: employee.full_name || employee.email || "Unnamed Employee",
      })),
    [employees],
  );

  const employeeNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    employees.forEach((employee) => {
      map[employee.id] = employee.full_name || employee.email || "Unassigned";
    });
    return map;
  }, [employees]);

  const followUpToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return rows.filter((row) => row.follow_up_date === today).length;
  }, [rows]);

  const handleApply = () => {
    setPage(1);
    setApplied({
      search: searchText.trim(),
      status: statusFilter,
      source: sourceFilter,
      assigned: assignedFilter,
    });
  };

  const handleReset = () => {
    setSearchText("");
    setStatusFilter("");
    setSourceFilter("");
    setAssignedFilter("");
    setPage(1);
    setApplied({ search: "", status: "", source: "", assigned: "" });
  };

  const openCreate = () => {
    setSuccess(null);
    setError(null);
    setEditId(null);
    setForm({ ...initialForm, assigned_to: !isAdmin ? currentUserId : "" });
    setPanelOpen(true);
  };

  const openEdit = (lead: ClientLeadRecord) => {
    if (!isAdmin) {
      setError("Only admins can edit client details.");
      return;
    }
    setSuccess(null);
    setError(null);
    setEditId(lead.id);
    setForm({
      name: lead.name ?? "",
      company_name: lead.company_name ?? "",
      email: lead.email ?? "",
      phone: lead.phone ?? "",
      source: lead.source ?? "Meta Ads",
      status: lead.status ?? "Lead",
      requirement: lead.requirement ?? "",
      budget: lead.budget ? String(lead.budget) : "",
      assigned_to: lead.assigned_to ?? "",
      follow_up_date: lead.follow_up_date ?? "",
      notes: lead.notes ?? "",
    });
    setPanelOpen(true);
  };

  const handleSave = async () => {
    if (!currentUserId) return;
    if (!isAdmin && !editId) {
      setError("Only admins can add new client details.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const payload = {
      name: form.name.trim(),
      company_name: form.company_name || null,
      email: form.email || null,
      phone: form.phone || null,
      source: form.source,
      status: form.status,
      requirement: form.requirement || null,
      budget: form.budget ? Number(form.budget) : null,
      assigned_to: isAdmin ? form.assigned_to || null : currentUserId,
      follow_up_date: form.follow_up_date || null,
      notes: form.notes || null,
    };

    try {
      if (editId) {
        if (!isAdmin) {
          throw new Error("Only admins can edit client details.");
        }
        const { error: updateError } = await supabase.from("clients").update(payload).eq("id", editId);
        if (updateError) throw new Error(updateError.message);
        setSuccess("Lead updated successfully.");
      } else {
        const { error: insertError } = await supabase.from("clients").insert(payload);
        if (insertError) throw new Error(insertError.message);
        setSuccess("Lead created successfully.");
      }
      setPanelOpen(false);
      setForm(initialForm);
      setEditId(null);
      await reload();
    } catch (saveError) {
      setError(toReadableError(saveError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    const confirmed = window.confirm("Delete this lead?");
    if (!confirmed) return;

    setError(null);
    setSuccess(null);
    const { error: deleteError } = await supabase.from("clients").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setSuccess("Lead deleted successfully.");
    await reload();
  };

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const startItem = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endItem = totalCount === 0 ? 0 : Math.min(page * PAGE_SIZE, totalCount);

  return (
    <section className="space-y-6 rounded-[24px] border border-[#d4deea] bg-white p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold text-[#0f172a]">Client / Lead Master</h2>
          <p className="mt-1 text-sm text-[#64748b]">Manage leads, clients, follow-ups and deal pipeline</p>
        </div>
        {isAdmin ? (
          <Button
            onClick={openCreate}
            className="h-9 rounded-full bg-[#2563eb] px-4 text-white hover:bg-[#1d4ed8]"
          >
            + Add Lead
          </Button>
        ) : null}
      </div>

      {error ? <Alert tone="error" text={error} /> : null}
      {success ? <Alert tone="success" text={success} /> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <LeadSummaryCard title="Total Leads" value={summary.total} loading={loading} />
        <LeadSummaryCard title="Contacted" value={summary.contacted} loading={loading} />
        <LeadSummaryCard title="Converted Clients" value={summary.converted} loading={loading} />
        <LeadSummaryCard title="Lost Leads" value={summary.lost} loading={loading} />
      </div>

      <article className="rounded-[20px] border border-[#dbe6f3] bg-[#f8fbff] p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as LeadStatus | "")}
            className="h-9 rounded-lg border border-[#d4deea] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#2563eb]"
          >
            <option value="">Status</option>
            {["Lead", "Contacted", "Converted", "Lost"].map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <select
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value as LeadSource | "")}
            className="h-9 rounded-lg border border-[#d4deea] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#2563eb]"
          >
            <option value="">Source</option>
            {["Meta Ads", "Referral", "LinkedIn"].map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <select
            value={assignedFilter}
            onChange={(event) => setAssignedFilter(event.target.value)}
            disabled={!isAdmin}
            className="h-9 rounded-lg border border-[#d4deea] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#2563eb] disabled:bg-[#eff3f8]"
          >
            <option value="">Assigned Employee</option>
            {employeesForSelect.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.label}
              </option>
            ))}
          </select>

          <Input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search name/email/phone"
            className="h-9 border-[#d4deea] bg-white"
          />

          <div className="flex gap-2">
            <Button
              onClick={handleApply}
              variant="outline"
              className="h-9 flex-1 rounded-full border-[#c9d8eb] bg-white text-[#1e3a8a] hover:bg-[#eff6ff]"
            >
              Apply Filters
            </Button>
            <Button
              onClick={handleReset}
              variant="outline"
              className="h-9 flex-1 rounded-full border-[#c9d8eb] bg-white text-[#475569] hover:bg-[#f8fafc]"
            >
              Reset
            </Button>
          </div>
        </div>
      </article>

      {!!followUpToday ? (
        <div className="rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-4 py-2 text-sm text-[#1d4ed8]">
          Follow-up Today: {followUpToday} lead(s) need attention.
        </div>
      ) : null}

      <div className="relative">
        <article className="overflow-hidden rounded-[20px] border border-[#dbe6f3] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1220px] text-sm">
              <thead className="bg-[#f1f6fc] text-xs uppercase tracking-wide text-[#64748b]">
                <tr>
                  {["Name", "Company", "Email", "Phone", "Source", "Status", "Budget", "Assigned To", "Follow-up Date", "Actions"].map(
                    (heading) => (
                      <th key={heading} className="px-5 py-3 text-center align-middle whitespace-nowrap font-semibold">
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8edf5] text-[#334155]">
                {loading
                  ? Array.from({ length: 5 }).map((_, index) => (
                      <tr key={`skeleton-${index}`}>
                        <td colSpan={10} className="px-4 py-3">
                          <div className="h-6 animate-pulse rounded-md bg-[#e8edf5]" />
                        </td>
                      </tr>
                    ))
                  : rows.map((lead) => {
                      const followUpDate = lead.follow_up_date;
                      const isOverdue = followUpDate ? followUpDate < new Date().toISOString().slice(0, 10) : false;
                      return (
                        <tr key={lead.id} className={isOverdue ? "bg-rose-50/70" : ""}>
                          <td className="px-5 py-3.5 align-middle font-medium text-[#0f172a]">
                            <span className="block truncate">{lead.name}</span>
                          </td>
                          <td className="px-5 py-3.5 align-middle">
                            <span className="block truncate">{lead.company_name || "-"}</span>
                          </td>
                          <td className="px-5 py-3.5 align-middle">
                            <span className="block truncate">{lead.email || "-"}</span>
                          </td>
                          <td className="px-5 py-3.5 align-middle whitespace-nowrap">{lead.phone || "-"}</td>
                          <td className="px-5 py-3.5 align-middle whitespace-nowrap">{lead.source || "-"}</td>
                          <td className="px-5 py-3.5 align-middle whitespace-nowrap">
                            <LeadStatusBadge status={lead.status} />
                          </td>
                          <td className="px-5 py-3.5 align-middle whitespace-nowrap">{lead.budget ? `₹ ${lead.budget.toLocaleString()}` : "-"}</td>
                          <td className="px-5 py-3.5 align-middle">
                            <span className="block truncate">{lead.assigned_to ? employeeNameMap[lead.assigned_to] || "Unknown" : "-"}</span>
                          </td>
                          <td className={["px-5 py-3.5 align-middle whitespace-nowrap", isOverdue ? "font-semibold text-rose-700" : ""].join(" ")}>
                            {lead.follow_up_date || "-"}
                          </td>
                          <td className="px-5 py-3.5 align-middle whitespace-nowrap">
                            <div className="flex min-w-[160px] items-center justify-center gap-3">
                              <button
                                type="button"
                                onClick={() => window.alert(`Lead: ${lead.name}\nRequirement: ${lead.requirement ?? "-"}\nNotes: ${lead.notes ?? "-"}`)}
                                className="text-xs font-medium text-[#1d4ed8] hover:underline"
                              >
                                View Details
                              </button>
                              <button
                                type="button"
                                onClick={() => openEdit(lead)}
                                disabled={!isAdmin}
                                className="text-xs font-medium text-[#475569] hover:underline disabled:cursor-not-allowed disabled:text-slate-300"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                disabled={!isAdmin}
                                onClick={() => void handleDelete(lead.id)}
                                className="text-xs font-medium text-rose-600 hover:underline disabled:cursor-not-allowed disabled:text-rose-300"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                {!loading && !rows.length ? (
                  <tr>
                    <td colSpan={10} className="h-14 px-5 py-8 text-center align-middle text-[#64748b]">
                      No leads found for current filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-[#e8edf5] px-4 py-3 text-sm text-[#64748b]">
            <p>
              Showing {startItem} - {endItem} of {totalCount}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className="h-8 rounded-full border-[#d4deea] bg-white px-3"
              >
                Prev
              </Button>
              <span>
                Page {page} / {pageCount}
              </span>
              <Button
                variant="outline"
                onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
                disabled={page >= pageCount}
                className="h-8 rounded-full border-[#d4deea] bg-white px-3"
              >
                Next
              </Button>
            </div>
          </div>
        </article>
      </div>

      {panelOpen ? (
        <>
          <button
            type="button"
            aria-label="Close panel overlay"
            onClick={() => setPanelOpen(false)}
            className="fixed inset-0 z-40 bg-slate-900/20"
          />
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[420px] p-3 sm:p-4">
            <LeadFormPanel
              title={editId ? "Edit Lead" : "Add Lead"}
              open={panelOpen}
              value={form}
              employees={employeesForSelect}
              canAssign={isAdmin}
              submitting={submitting}
              onChange={setForm}
              onClose={() => setPanelOpen(false)}
              onSubmit={() => void handleSave()}
            />
          </div>
        </>
      ) : null}
    </section>
  );
}

function Alert({ tone, text }: { tone: "error" | "success"; text: string }) {
  return (
    <div
      className={[
        "rounded-xl border px-4 py-2 text-sm",
        tone === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700",
      ].join(" ")}
    >
      {text}
    </div>
  );
}
