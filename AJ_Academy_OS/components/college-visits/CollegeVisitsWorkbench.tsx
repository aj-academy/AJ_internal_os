"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { TableHeaderCell, TableHeaderFilter } from "@/components/ui/TableHeaderFilter";
import { TableSearchBar } from "@/components/ui/TableSearchBar";
import { TablePagination } from "@/components/ui/TablePagination";
import { BulkSelectionBar } from "@/components/ui/BulkSelectionBar";
import { TableBulkCheckbox } from "@/components/ui/TableBulkCheckbox";
import { LeadSummaryCard } from "@/components/ui/LeadSummaryCard";
import { usePagination } from "@/lib/usePagination";
import { useRowSelection } from "@/lib/useRowSelection";
import { CollegeVisitFormPanel } from "@/components/college-visits/CollegeVisitFormPanel";
import {
  COLLEGE_PRIORITIES,
  FINAL_STATUSES,
  VISIT_STATUSES,
} from "@/components/college-visits/collegeVisitsConfig";
import {
  buildCollegeVisitPayload,
  collegeVisitRowToForm,
  daysSince,
  emptyCollegeVisitForm,
  friendlyCollegeVisitError,
  isFollowUpDue,
  isMissingCollegeVisitsTable,
  type CollegeVisitActivityRow,
  type CollegeVisitFormValue,
  type CollegeVisitRow,
} from "@/components/college-visits/collegeVisitsHelpers";

type AppRole = "admin" | "employee";

interface ProfileMini {
  id: string;
  full_name: string | null;
  email: string | null;
}

export function CollegeVisitsWorkbench({ role, fullAccess = false }: { role: AppRole; fullAccess?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const isEmployeePortal = role === "employee";
  const isAdmin = role === "admin" || (isEmployeePortal && fullAccess);
  const isDbAdmin = role === "admin";

  const [currentUserId, setCurrentUserId] = useState("");
  const [employees, setEmployees] = useState<ProfileMini[]>([]);
  const [visits, setVisits] = useState<CollegeVisitRow[]>([]);
  const [activities, setActivities] = useState<CollegeVisitActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [fltVisitStatus, setFltVisitStatus] = useState("");
  const [fltPriority, setFltPriority] = useState("");
  const [fltOwner, setFltOwner] = useState("");
  const [fltFinalStatus, setFltFinalStatus] = useState("");
  const [fltFollowUpDue, setFltFollowUpDue] = useState("");
  const [listScope, setListScope] = useState<"all" | "mine">(isEmployeePortal ? "mine" : "all");

  const [panelOpen, setPanelOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CollegeVisitFormValue>(() => emptyCollegeVisitForm());
  const [viewVisit, setViewVisit] = useState<CollegeVisitRow | null>(null);
  const [bulkAssignTo, setBulkAssignTo] = useState("");

  const ownerOptions = useMemo(
    () =>
      employees.map((e) => ({
        id: e.id,
        label: e.full_name || e.email || "Unnamed",
      })),
    [employees],
  );

  const ownerNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    employees.forEach((e) => {
      m[e.id] = e.full_name || e.email || e.id.slice(0, 8);
    });
    return m;
  }, [employees]);

  const loadVisits = useCallback(async () => {
    const res = await fetch(`/api/college-visits${listScope === "mine" && isEmployeePortal ? "?mine=1" : ""}`);
    const json = (await res.json()) as { visits?: CollegeVisitRow[]; error?: string };
    if (!res.ok) {
      const msg = json.error ?? "Could not load college visits.";
      if (isMissingCollegeVisitsTable(msg)) {
        setSchemaMissing(true);
        setVisits([]);
        return;
      }
      throw new Error(msg);
    }
    setSchemaMissing(false);
    setVisits(json.visits ?? []);
  }, [isEmployeePortal, listScope]);

  const reload = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    setError(null);
    try {
      await loadVisits();
    } catch (e) {
      setError(friendlyCollegeVisitError(e));
    } finally {
      setLoading(false);
    }
  }, [currentUserId, loadVisits]);

  useEffect(() => {
    async function bootstrap() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) setCurrentUserId(user.id);

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .in("role", ["employee", "admin", "super_admin"])
        .or("status.is.null,status.eq.active")
        .order("full_name", { ascending: true });
      setEmployees((profiles as ProfileMini[] | null) ?? []);
    }
    void bootstrap();
  }, [supabase]);

  useEffect(() => {
    if (!currentUserId) return;
    void reload();
  }, [currentUserId, reload, listScope]);

  useEffect(() => {
    if (!viewVisit?.id) {
      setActivities([]);
      return;
    }
    void (async () => {
      const res = await fetch(`/api/college-visits/${viewVisit.id}/activities`);
      const json = (await res.json()) as { activities?: CollegeVisitActivityRow[] };
      setActivities(json.activities ?? []);
    })();
  }, [viewVisit?.id]);

  const filteredVisits = useMemo(() => {
    let list = [...visits];
    const q = searchText.trim().toLowerCase();
    if (q) {
      list = list.filter((v) =>
        `${v.college_name} ${v.location ?? ""} ${v.contact_number ?? ""} ${v.email ?? ""} ${v.connected_person_name ?? ""} ${v.source_reference ?? ""}`
          .toLowerCase()
          .includes(q),
      );
    }
    if (fltVisitStatus) list = list.filter((v) => v.visit_status === fltVisitStatus);
    if (fltPriority) list = list.filter((v) => v.priority === fltPriority);
    if (fltOwner) list = list.filter((v) => (v.assigned_to ?? "") === fltOwner);
    if (fltFinalStatus) list = list.filter((v) => v.final_status === fltFinalStatus);
    if (fltFollowUpDue === "yes") list = list.filter((v) => isFollowUpDue(v));
    if (fltFollowUpDue === "no") list = list.filter((v) => !isFollowUpDue(v));
    return list;
  }, [visits, searchText, fltVisitStatus, fltPriority, fltOwner, fltFinalStatus, fltFollowUpDue]);

  const {
    paginatedItems: pageRows,
    page,
    setPage,
    totalPages,
    totalItems,
    pageSize,
    setPageSize,
  } = usePagination(filteredVisits, 25);

  const visitBulk = useRowSelection(pageRows, (v) => v.id);

  const overview = useMemo(() => {
    const due = visits.filter((v) => isFollowUpDue(v)).length;
    const visited = visits.filter((v) => v.visit_status === "Visited").length;
    const mouSigned = visits.filter((v) => v.mou_signed_status === "Signed").length;
    const mine = visits.filter((v) => v.assigned_to === currentUserId).length;
    return { total: visits.length, due, visited, mouSigned, mine };
  }, [visits, currentUserId]);

  const openCreate = () => {
    setEditId(null);
    setForm(emptyCollegeVisitForm(isDbAdmin ? "" : currentUserId));
    setPanelOpen(true);
    setError(null);
    setSuccess(null);
  };

  const openEdit = (row: CollegeVisitRow) => {
    setEditId(row.id);
    setForm(collegeVisitRowToForm(row));
    setPanelOpen(true);
    setViewVisit(null);
  };

  const handleSave = async () => {
    if (!currentUserId || !form.college_name.trim()) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = buildCollegeVisitPayload(form, { userId: currentUserId, isDbAdmin });
      if (editId) {
        const res = await fetch(`/api/college-visits/${editId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, assigned_to: payload.assigned_to ?? "" }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Update failed.");
        setSuccess("College visit updated.");
      } else {
        const res = await fetch("/api/college-visits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, assigned_to: payload.assigned_to ?? "" }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Create failed.");
        setSuccess("College visit created.");
      }
      setPanelOpen(false);
      setEditId(null);
      await reload();
    } catch (e) {
      setError(friendlyCollegeVisitError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isDbAdmin || !confirm("Delete this college visit permanently?")) return;
    const res = await fetch(`/api/college-visits/${id}`, { method: "DELETE" });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Delete failed.");
      return;
    }
    setSuccess("Deleted.");
    setViewVisit(null);
    await reload();
  };

  const handleBulkAssign = async () => {
    if (!isDbAdmin || !bulkAssignTo || visitBulk.selectedCount === 0) return;
    const label = ownerNameMap[bulkAssignTo] || "assignee";
    if (!confirm(`Assign ${visitBulk.selectedCount} college(s) to ${label}?`)) return;
    const count = visitBulk.selectedCount;
    setSubmitting(true);
    try {
      for (const id of visitBulk.selected) {
        const row = visits.find((v) => v.id === id);
        if (!row) continue;
        const f = collegeVisitRowToForm(row);
        f.assigned_to = bulkAssignTo;
        const res = await fetch(`/api/college-visits/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(f),
        });
        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          throw new Error(json.error ?? "Bulk assign failed.");
        }
      }
      visitBulk.clearSelection();
      setBulkAssignTo("");
      setSuccess(`${count} college(s) assigned to ${label}.`);
      await reload();
    } catch (e) {
      setError(friendlyCollegeVisitError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!isDbAdmin || visitBulk.selectedCount === 0) return;
    if (!confirm(`Delete ${visitBulk.selectedCount} selected college visit(s)?`)) return;
    setSubmitting(true);
    try {
      for (const id of visitBulk.selected) {
        const res = await fetch(`/api/college-visits/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          throw new Error(json.error ?? "Bulk delete failed.");
        }
      }
      visitBulk.clearSelection();
      setSuccess("Selected college visits deleted.");
      await reload();
    } catch (e) {
      setError(friendlyCollegeVisitError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const thClass = "whitespace-nowrap px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[#64748b]";
  const tdClass = "whitespace-nowrap px-2 py-2 text-xs text-[#334155]";

  return (
    <section className="space-y-5 rounded-[24px] border border-[#e8dcc8] bg-white p-4 sm:p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold text-[#0f172a]">College Visits</h2>
          <p className="mt-1 text-sm text-[#64748b]">
            Track college outreach, MOU status, follow-ups, and field visit activity. Admin can assign owners; employees update visits on-site.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isEmployeePortal ? (
            <select
              className="h-9 rounded-full border border-[#e8dcc8] bg-white px-3 text-sm"
              value={listScope}
              onChange={(e) => setListScope(e.target.value as "all" | "mine")}
            >
              <option value="mine">My assigned colleges</option>
              <option value="all">All colleges</option>
            </select>
          ) : null}
          <Button variant="outline" className="h-9 rounded-full border-[#e8dcc8]" disabled={loading} onClick={() => void reload()}>
            Refresh
          </Button>
          {isAdmin ? (
            <Button className="h-9 rounded-full bg-[#c9a227] px-5 text-white hover:bg-[#b8921f]" onClick={openCreate}>
              + Add College
            </Button>
          ) : null}
        </div>
      </header>

      {schemaMissing ? (
        <div className="rounded-xl border border-blue-200 bg-[#faf3e3] px-4 py-3 text-sm text-blue-900">
          Run <strong>AJ_Academy_SB/college_visits_schema.sql</strong> in Supabase SQL Editor, then refresh.
        </div>
      ) : null}

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{success}</div> : null}

      <div className="stat-cards-grid">
        <LeadSummaryCard title="Total colleges" value={overview.total} loading={loading} />
        <LeadSummaryCard title="Follow-up due" value={overview.due} loading={loading} accent="rose" />
        <LeadSummaryCard title="Visited" value={overview.visited} loading={loading} />
        <LeadSummaryCard title="MOU signed" value={overview.mouSigned} loading={loading} />
        {isEmployeePortal ? <LeadSummaryCard title="Assigned to me" value={overview.mine} loading={loading} /> : null}
      </div>

      <TableSearchBar value={searchText} onChange={setSearchText} placeholder="Search college, location, contact, email…" />

      {isDbAdmin && visitBulk.selectedCount > 0 ? (
        <BulkSelectionBar selectedCount={visitBulk.selectedCount} onClear={visitBulk.clearSelection}>
          <select
            className="h-8 rounded-lg border border-[#dbe6f3] bg-white px-2 text-xs"
            value={bulkAssignTo}
            onChange={(e) => setBulkAssignTo(e.target.value)}
          >
            <option value="">Assign owner…</option>
            {ownerOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
          <Button size="sm" className="h-8 rounded-full bg-[#c9a227] text-white" onClick={() => void handleBulkAssign()} disabled={!bulkAssignTo || submitting}>
            Assign
          </Button>
          <Button size="sm" variant="outline" className="h-8 rounded-full border-rose-200 text-rose-700" onClick={() => void handleBulkDelete()} disabled={submitting}>
            Delete
          </Button>
        </BulkSelectionBar>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-[#dbe6f3]">
        <table className="min-w-[2200px] w-full border-collapse">
          <thead className="bg-[#f8fbff]">
            <tr>
              {isDbAdmin ? (
                <th className={thClass}>
                  <TableBulkCheckbox
                    checked={visitBulk.allSelected}
                    indeterminate={visitBulk.someSelected}
                    onChange={visitBulk.toggleAll}
                    ariaLabel="Select all colleges"
                  />
                </th>
              ) : null}
              <TableHeaderCell label="S.No" className={thClass} />
              <TableHeaderCell label="College Name" className={thClass} />
              <TableHeaderCell label="Location" className={thClass} />
              <TableHeaderCell label="Contact Number" className={thClass} />
              <TableHeaderCell label="Email ID" className={thClass} />
              <TableHeaderCell label="Connected Person" className={thClass} />
              <TableHeaderCell label="Role" className={thClass} />
              <TableHeaderFilter label="Visit Status" value={fltVisitStatus} options={VISIT_STATUSES.map((s) => ({ value: s, label: s }))} onChange={setFltVisitStatus} className={thClass} />
              <TableHeaderCell label="Visit Date" className={thClass} />
              <TableHeaderCell label="MOU Status" className={thClass} />
              <TableHeaderCell label="Follow-up Stage" className={thClass} />
              <TableHeaderCell label="Last Follow-up" className={thClass} />
              <TableHeaderCell label="Next Follow-up" className={thClass} />
              <TableHeaderFilter label="Priority" value={fltPriority} options={COLLEGE_PRIORITIES.map((p) => ({ value: p, label: p }))} onChange={setFltPriority} className={thClass} />
              <TableHeaderFilter label="Owner" value={fltOwner} options={ownerOptions.map((o) => ({ value: o.id, label: o.label }))} onChange={setFltOwner} className={thClass} />
              <TableHeaderCell label="Description" className={thClass} />
              <TableHeaderCell label="Last Outcome" className={thClass} />
              <TableHeaderCell label="Days Since F/U" className={thClass} />
              <TableHeaderFilter label="Follow-up Due?" value={fltFollowUpDue} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} onChange={setFltFollowUpDue} className={thClass} />
              <TableHeaderCell label="Lead Score" className={thClass} />
              <TableHeaderFilter label="Final Status" value={fltFinalStatus} options={FINAL_STATUSES.map((s) => ({ value: s, label: s }))} onChange={setFltFinalStatus} className={thClass} />
              <TableHeaderCell label="Source" className={thClass} />
              <TableHeaderCell label="Actions" className={thClass} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={isDbAdmin ? 24 : 23} className="px-4 py-8 text-center text-sm text-[#64748b]">Loading…</td></tr>
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={isDbAdmin ? 24 : 23} className="px-4 py-8 text-center text-sm text-[#64748b]">No college visits found.</td></tr>
            ) : (
              pageRows.map((row, idx) => {
                const days = daysSince(row.last_follow_up_date);
                const due = isFollowUpDue(row);
                return (
                  <tr key={row.id} className="border-t border-[#eef2f7] hover:bg-[#fafcff]">
                    {isDbAdmin ? (
                      <td className={tdClass}>
                        <TableBulkCheckbox
                          checked={visitBulk.isSelected(row.id)}
                          onChange={() => visitBulk.toggleOne(row.id)}
                          ariaLabel={`Select ${row.college_name}`}
                        />
                      </td>
                    ) : null}
                    <td className={tdClass}>{(page - 1) * pageSize + idx + 1}</td>
                    <td className={`${tdClass} max-w-[160px] truncate font-medium`} title={row.college_name}>{row.college_name}</td>
                    <td className={tdClass}>{row.location || "—"}</td>
                    <td className={tdClass}>{row.contact_number || "—"}</td>
                    <td className={tdClass}>{row.email || "—"}</td>
                    <td className={tdClass}>{row.connected_person_name || "—"}</td>
                    <td className={tdClass}>{row.connected_person_role || "—"}</td>
                    <td className={tdClass}>{row.visit_status}</td>
                    <td className={tdClass}>{row.visit_date?.slice(0, 10) || "—"}</td>
                    <td className={tdClass}>{row.mou_signed_status}</td>
                    <td className={tdClass}>{row.follow_up_stage || "—"}</td>
                    <td className={tdClass}>{row.last_follow_up_date?.slice(0, 10) || "—"}</td>
                    <td className={tdClass}>{row.next_follow_up_date?.slice(0, 10) || "—"}</td>
                    <td className={tdClass}>{row.priority}</td>
                    <td className={tdClass}>{row.assigned_to ? ownerNameMap[row.assigned_to] || "—" : "—"}</td>
                    <td className={`${tdClass} max-w-[140px] truncate`} title={row.description ?? ""}>{row.description || "—"}</td>
                    <td className={`${tdClass} max-w-[140px] truncate`} title={row.last_outcome_remarks ?? ""}>{row.last_outcome_remarks || "—"}</td>
                    <td className={tdClass}>{days != null ? days : "—"}</td>
                    <td className={tdClass}>
                      <span className={due ? "rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700" : "rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600"}>
                        {due ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className={tdClass}>{row.lead_score}</td>
                    <td className={tdClass}>{row.final_status}</td>
                    <td className={tdClass}>{row.source_reference || "—"}</td>
                    <td className={tdClass}>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-7 rounded-full px-2 text-[11px]" onClick={() => setViewVisit(row)}>Activity</Button>
                        {isAdmin ? (
                          <Button size="sm" variant="outline" className="h-7 rounded-full px-2 text-[11px]" onClick={() => openEdit(row)}>Edit</Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
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
      />

      <CollegeVisitFormPanel
        open={panelOpen}
        title={editId ? "Edit college visit" : "Add college visit"}
        value={form}
        owners={ownerOptions}
        submitting={submitting}
        canAssign={isDbAdmin}
        onChange={setForm}
        onClose={() => setPanelOpen(false)}
        onSubmit={() => void handleSave()}
      />

      {viewVisit ? (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-40 bg-slate-900/40" onClick={() => setViewVisit(null)} />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-[#e8dcc8] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h3 className="font-semibold text-[#0f172a]">{viewVisit.college_name}</h3>
                <p className="text-xs text-[#64748b]">{viewVisit.location || "No location"} · Owner: {viewVisit.assigned_to ? ownerNameMap[viewVisit.assigned_to] : "Unassigned"}</p>
              </div>
              <button type="button" className="rounded-full border px-2 py-1 text-sm" onClick={() => setViewVisit(null)}>×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-3 flex gap-2">
                {isAdmin ? (
                  <Button size="sm" className="rounded-full bg-[#c9a227] text-white" onClick={() => openEdit(viewVisit)}>Update visit</Button>
                ) : null}
                {isDbAdmin ? (
                  <Button size="sm" variant="outline" className="rounded-full border-rose-200 text-rose-700" onClick={() => void handleDelete(viewVisit.id)}>Delete</Button>
                ) : null}
              </div>
              <p className="mb-2 text-xs font-semibold uppercase text-[#94a3b8]">Activity timeline</p>
              <div className="space-y-2">
                {activities.length === 0 ? (
                  <p className="text-sm text-[#64748b]">No activity yet.</p>
                ) : (
                  activities.map((a) => (
                    <div key={a.id} className="rounded-lg border border-[#eef2f7] bg-[#f8fbff] p-3 text-xs">
                      <p className="font-semibold text-[#0f172a]">{a.activity_type}</p>
                      {a.notes ? <p className="mt-1 text-[#475569]">{a.notes}</p> : null}
                      {(a.old_value || a.new_value) ? (
                        <p className="mt-1 text-[#64748b]">{a.old_value ?? "—"} → {a.new_value ?? "—"}</p>
                      ) : null}
                      <p className="mt-1 text-[10px] text-[#94a3b8]">{new Date(a.created_at).toLocaleString()}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </>
      ) : null}
    </section>
  );
}
