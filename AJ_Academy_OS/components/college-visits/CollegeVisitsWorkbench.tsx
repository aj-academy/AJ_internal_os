"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, FileText, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDisplayDate } from "@/lib/datetime";
import { saveTaskCollegeSelection } from "@/lib/taskLeadPickStorage";
import { deleteOwnedCollegeVisits } from "@/lib/crmOwnedDelete";
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
  downloadCollegeVisitImportTemplate,
  exportCollegeVisitsCsv,
  collegeVisitFileToMatrix,
  parseCollegeVisitMatrix,
} from "@/components/college-visits/collegeVisitsCsv";
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

function ownerPeopleFromProfiles(employees: ProfileMini[]) {
  return employees.map((e) => ({
    id: e.id,
    label: e.full_name || e.email || "Unnamed",
    email: e.email,
  }));
}

export function CollegeVisitsWorkbench({ role, fullAccess = false }: { role: AppRole; fullAccess?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const pickForTask = searchParams.get("pickForTask") === "1";
  const defaultReturnTo = role === "admin" ? "/admin/task-assignment" : "/employee/my-tasks";
  const returnTo = searchParams.get("returnTo") || defaultReturnTo;
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
  const [listScope] = useState<"mine">("mine");

  const [panelOpen, setPanelOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CollegeVisitFormValue>(() => emptyCollegeVisitForm());
  const [viewVisit, setViewVisit] = useState<CollegeVisitRow | null>(null);
  const [bulkAssignTo, setBulkAssignTo] = useState("");
  const [pickedCollegeIds, setPickedCollegeIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

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
    const res = await fetch("/api/college-visits");
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
  }, []);

  const togglePickCollege = (id: string) => {
    setPickedCollegeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmCollegePick = () => {
    const labels = visits.filter((v) => pickedCollegeIds.has(v.id)).map((v) => v.college_name);
    const pathParts = ["College Visits"];
    if (listScope === "mine") pathParts.push("My assigned");
    if (fltVisitStatus) pathParts.push(`Visit=${fltVisitStatus}`);
    if (fltOwner) pathParts.push(`Owner filter`);
    if (searchText.trim()) pathParts.push(`Search="${searchText.trim()}"`);
    saveTaskCollegeSelection({
      ids: [...pickedCollegeIds],
      labels,
      filterPath: pathParts.join(" → "),
    });
    router.push(decodeURIComponent(returnTo));
  };

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
  }, [currentUserId, reload]);

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

  const filtersActive = Boolean(
    searchText.trim() || fltVisitStatus || fltPriority || fltOwner || fltFinalStatus || fltFollowUpDue,
  );

  const clearTableFilters = () => {
    setSearchText("");
    setFltVisitStatus("");
    setFltPriority("");
    setFltOwner("");
    setFltFinalStatus("");
    setFltFollowUpDue("");
  };

  const {
    paginatedItems: pageRows,
    page,
    setPage,
    totalPages,
    totalItems,
    pageSize,
    setPageSize,
  } = usePagination(filteredVisits, 25);

  /** Select across the full filtered set (not only the current page). */
  const visitBulk = useRowSelection(filteredVisits, (v) => v.id);

  const rowsForExport = useMemo(() => {
    if (visitBulk.selectedCount > 0) {
      return filteredVisits.filter((v) => visitBulk.selected.has(v.id));
    }
    return filteredVisits;
  }, [filteredVisits, visitBulk.selected, visitBulk.selectedCount]);

  const overview = useMemo(() => {
    const due = visits.filter((v) => isFollowUpDue(v)).length;
    const visited = visits.filter((v) => v.visit_status === "Visited").length;
    const mouSigned = visits.filter((v) => v.mou_signed_status === "Signed").length;
    const mine = visits.filter((v) => v.assigned_to === currentUserId).length;
    return { total: visits.length, due, visited, mouSigned, mine };
  }, [visits, currentUserId]);

  const openCreate = () => {
    setEditId(null);
    setForm(emptyCollegeVisitForm(currentUserId));
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
    if (!confirm("Delete this college visit permanently?")) return;
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
    if (!isDbAdmin || !bulkAssignTo || visitBulk.selectedCount === 0 || !currentUserId) return;
    const label = ownerNameMap[bulkAssignTo] || "assignee";
    const ids = [...visitBulk.selected];
    if (
      !confirm(
        `Assign ${ids.length} college(s) to ${label} as a College Visit task?\n\nThe employee will work them under My Tasks → College Visit (not as CRM-owned College Visits ownership).`,
      )
    ) {
      return;
    }
    setSubmitting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data: inserted, error: insertError } = await supabase
        .from("tasks")
        .insert({
          title: `College visit outreach (${ids.length})`,
          description: `Assigned from College Visits · ${ids.length} linked college(s).`,
          assigned_to: bulkAssignTo,
          assigned_by: currentUserId,
          assignment_type: "college",
          client_ids: [],
          college_visit_ids: ids,
          project_id: null,
          priority: "Medium",
          status: "Pending",
          progress: 0,
          start_date: today,
          due_date: null,
        })
        .select("id")
        .single();
      if (insertError) throw new Error(insertError.message);
      try {
        await supabase.rpc("create_task_assignment_notification", { p_task_id: inserted.id });
      } catch {
        /* optional */
      }
      visitBulk.clearSelection();
      setBulkAssignTo("");
      setSuccess(`${ids.length} college(s) sent to ${label} as My Tasks → College Visit.`);
      await reload();
    } catch (e) {
      setError(friendlyCollegeVisitError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (visitBulk.selectedCount === 0 || !currentUserId) return;
    if (!confirm(`Delete ${visitBulk.selectedCount} selected college visit(s)?`)) return;
    setSubmitting(true);
    try {
      const ids = [...visitBulk.selected];
      const { deleted, error: deleteError } = await deleteOwnedCollegeVisits(supabase, ids, currentUserId);
      if (deleteError) throw new Error(deleteError);
      if (!deleted) {
        throw new Error(
          "No college visits were deleted. You can only delete your own rows. Run AJ_Academy_SB/crm_delete_fix.sql in Supabase if needed.",
        );
      }
      visitBulk.clearSelection();
      setSuccess(
        deleted === ids.length
          ? `${deleted} college visit(s) deleted.`
          : `${deleted} of ${ids.length} deleted (others were not yours).`,
      );
      await reload();
    } catch (e) {
      setError(friendlyCollegeVisitError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadTemplate = () => {
    downloadCollegeVisitImportTemplate();
    setSuccess("Import template downloaded (headers match the College Visits table).");
  };

  const handleExport = () => {
    if (!rowsForExport.length) {
      setError("No rows match the current filters to export.");
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    const filename =
      visitBulk.selectedCount > 0
        ? `college-visits-selected-${date}.csv`
        : filtersActive
          ? `college-visits-filtered-${date}.csv`
          : `college-visits-${date}.csv`;
    exportCollegeVisitsCsv(rowsForExport, ownerNameMap, filename);
    setSuccess(
      visitBulk.selectedCount > 0
        ? `Exported ${rowsForExport.length} selected row(s).`
        : filtersActive
          ? `Exported ${rowsForExport.length} filtered row(s) (of ${visits.length} total).`
          : `Exported all ${rowsForExport.length} college visit row(s).`,
    );
  };

  const handleImportFile = async (file: File) => {
    if (!currentUserId || !isAdmin) return;
    setImporting(true);
    setError(null);
    setSuccess(null);
    try {
      const matrix = await collegeVisitFileToMatrix(file);
      const { forms, errors } = parseCollegeVisitMatrix(matrix, {
        owners: ownerPeopleFromProfiles(employees),
        defaultOwnerId: currentUserId,
        isDbAdmin,
      });
      let ok = 0;
      let fail = errors.length;
      const rowErrors = [...errors];

      for (const formRow of forms) {
        const payload = buildCollegeVisitPayload(formRow, { userId: currentUserId, isDbAdmin });
        const res = await fetch("/api/college-visits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...formRow, assigned_to: payload.assigned_to ?? "" }),
        });
        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          fail += 1;
          rowErrors.push(json.error ?? "Insert failed.");
        } else {
          ok += 1;
        }
      }

      await reload();
      setSuccess(
        `Import complete: ${ok} added, ${fail} failed.${rowErrors.length ? ` ${rowErrors.slice(0, 3).join(" ")}` : ""}`,
      );
    } catch (e) {
      setError(friendlyCollegeVisitError(e));
    } finally {
      setImporting(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };

  const thClass =
    "min-w-[10.5rem] whitespace-nowrap px-6 py-3.5 text-center align-middle text-[11px] font-semibold uppercase tracking-wide text-[#64748b]";
  const tdClass = "min-w-[10.5rem] whitespace-nowrap px-6 py-3.5 text-center align-middle text-xs text-[#334155]";

  return (
    <section className="space-y-5 rounded-[24px] border border-[#e8dcc8] bg-white p-4 sm:p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold text-[#0f172a]">College Visits</h2>
          <p className="mt-1 text-sm text-[#64748b]">
            Your college outreach only. Share work with others via Assign as College Visit task (My Tasks).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!pickForTask ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-full border-[#e8dcc8]"
                onClick={handleDownloadTemplate}
              >
                <FileText className="mr-1 h-4 w-4" />
                Import template
              </Button>
              <input
                ref={importFileRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImportFile(f);
                }}
              />
              {isAdmin ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-full border-[#e8dcc8]"
                  disabled={importing || schemaMissing}
                  onClick={() => importFileRef.current?.click()}
                >
                  <Upload className="mr-1 h-4 w-4" />
                  {importing ? "Importing…" : "Import"}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-full border-[#e8dcc8]"
                disabled={!rowsForExport.length}
                onClick={handleExport}
                title={
                  visitBulk.selectedCount > 0
                    ? "Export selected rows"
                    : filtersActive
                      ? "Export rows matching current table filters"
                      : "Export all rows in the table"
                }
              >
                <Download className="mr-1 h-4 w-4" />
                {visitBulk.selectedCount > 0
                  ? `Export selected (${rowsForExport.length})`
                  : filtersActive
                    ? `Export filtered (${rowsForExport.length})`
                    : `Export${rowsForExport.length ? ` (${rowsForExport.length})` : ""}`}
              </Button>
            </>
          ) : null}
          <Button variant="outline" className="h-9 rounded-full border-[#e8dcc8]" disabled={loading} onClick={() => void reload()}>
            Refresh
          </Button>
          {isAdmin && !pickForTask ? (
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

      {pickForTask ? (
        <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#c9a227] bg-[#fef3c7] px-3 py-2">
          <div>
            <p className="text-sm font-semibold text-[#92400e]">Selecting colleges for task assignment</p>
            <p className="text-xs text-[#78350f]">{pickedCollegeIds.size} selected · use filters and check rows below</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => router.push(decodeURIComponent(returnTo))}>
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]"
              disabled={!pickedCollegeIds.size}
              onClick={confirmCollegePick}
            >
              Confirm {pickedCollegeIds.size ? `${pickedCollegeIds.size} college(s)` : "selection"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="stat-cards-grid">
        <LeadSummaryCard title="Total colleges" value={overview.total} loading={loading} />
        <LeadSummaryCard title="Follow-up due" value={overview.due} loading={loading} accent="rose" />
        <LeadSummaryCard title="Visited" value={overview.visited} loading={loading} />
        <LeadSummaryCard title="MOU signed" value={overview.mouSigned} loading={loading} />
        {isEmployeePortal ? <LeadSummaryCard title="Assigned to me" value={overview.mine} loading={loading} /> : null}
      </div>

      <TableSearchBar
        value={searchText}
        onChange={setSearchText}
        placeholder="Search college, location, contact, email…"
        showClear={filtersActive}
        onClear={clearTableFilters}
        hint={`Showing ${pageRows.length} of ${filteredVisits.length} college(s) · page ${page}/${totalPages}`}
      />

      {!pickForTask && visitBulk.selectedCount > 0 ? (
        <BulkSelectionBar selectedCount={visitBulk.selectedCount} onClear={visitBulk.clearSelection}>
          {isDbAdmin ? (
            <>
              <select
                className="h-8 rounded-lg border border-[#dbe6f3] bg-white px-2 text-xs"
                value={bulkAssignTo}
                onChange={(e) => setBulkAssignTo(e.target.value)}
              >
                <option value="">Assign as task to…</option>
                {ownerOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
              <Button size="sm" className="h-8 rounded-full bg-[#c9a227] text-white" onClick={() => void handleBulkAssign()} disabled={!bulkAssignTo || submitting}>
                Assign as College Visit task
              </Button>
            </>
          ) : null}
          <Button size="sm" variant="outline" className="h-8 rounded-full border-rose-200 text-rose-700" onClick={() => void handleBulkDelete()} disabled={submitting}>
            Delete
          </Button>
        </BulkSelectionBar>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-[#dbe6f3]">
        <table
          className="table-freeze-cols min-w-[3800px] w-full"
          style={
            {
              ["--sticky-col-2" as string]: "14rem",
              ["--sticky-check-w" as string]: "3rem",
            } as CSSProperties
          }
        >
          <thead className="cv-head bg-[#f8fbff]">
            <tr>
              {pickForTask ? (
                <TableHeaderCell label="Pick" className={`${thClass} sticky-col sticky-col-1 sticky-check-col`} />
              ) : null}
              {!pickForTask ? (
                <th className={`${thClass} sticky-col sticky-col-1 sticky-check-col`}>
                  <div className="flex justify-center">
                    <TableBulkCheckbox
                      checked={visitBulk.allSelected}
                      indeterminate={visitBulk.someSelected}
                      onChange={visitBulk.toggleAll}
                      ariaLabel="Select all colleges"
                    />
                  </div>
                </th>
              ) : null}
              <TableHeaderCell
                label="S.No"
                className={`${thClass} sticky-col sticky-col-after-check min-w-[4.5rem]`}
              />
              <TableHeaderCell label="College Name" className={`${thClass} min-w-[14rem]`} />
              <TableHeaderCell label="Location" className={thClass} />
              <TableHeaderCell label="Contact Number" className={thClass} />
              <TableHeaderCell label="Email ID" className={thClass} />
              <TableHeaderCell label="Connected Person Name" className={thClass} />
              <TableHeaderCell label="Role" className={thClass} />
              <TableHeaderFilter label="Visit Status" value={fltVisitStatus} options={VISIT_STATUSES.map((s) => ({ value: s, label: s }))} onChange={setFltVisitStatus} className={thClass} />
              <TableHeaderCell label="Visit Date" className={thClass} />
              <TableHeaderCell label="MOU Signed Status" className={thClass} />
              <TableHeaderCell label="Follow-up Stage" className={thClass} />
              <TableHeaderCell label="Last Follow-up Date" className={thClass} />
              <TableHeaderCell label="Next Follow-up Date" className={thClass} />
              <TableHeaderFilter label="Priority" value={fltPriority} options={COLLEGE_PRIORITIES.map((p) => ({ value: p, label: p }))} onChange={setFltPriority} className={thClass} />
              <TableHeaderFilter label="Owner" value={fltOwner} options={ownerOptions.map((o) => ({ value: o.id, label: o.label }))} onChange={setFltOwner} className={thClass} />
              <TableHeaderCell label="Description" className={thClass} />
              <TableHeaderCell label="Last Outcome / Remarks" className={thClass} />
              <TableHeaderCell label="Days Since Last Follow-up" className={thClass} />
              <TableHeaderFilter label="Follow-up Due?" value={fltFollowUpDue} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} onChange={setFltFollowUpDue} className={thClass} />
              <TableHeaderCell label="Lead Score" className={thClass} />
              <TableHeaderFilter label="Final Status" value={fltFinalStatus} options={FINAL_STATUSES.map((s) => ({ value: s, label: s }))} onChange={setFltFinalStatus} className={thClass} />
              <TableHeaderCell label="Source / Reference" className={thClass} />
              {!pickForTask ? <TableHeaderCell label="Actions" className={thClass} /> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={pickForTask ? (isDbAdmin ? 24 : 23) : isDbAdmin ? 24 : 23} className="px-4 py-8 text-center text-sm text-[#64748b]">Loading…</td></tr>
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={pickForTask ? (isDbAdmin ? 24 : 23) : isDbAdmin ? 24 : 23} className="px-4 py-8 text-center text-sm text-[#64748b]">No college visits found.</td></tr>
            ) : (
              pageRows.map((row, idx) => {
                const days = daysSince(row.last_follow_up_date);
                const due = isFollowUpDue(row);
                return (
                  <tr key={row.id} className="border-t border-[#eef2f7] hover:bg-[#fafcff]">
                    {pickForTask ? (
                      <td className={`${tdClass} sticky-col sticky-col-1 sticky-check-col`}>
                        <div className="flex justify-center">
                          <TableBulkCheckbox
                            checked={pickedCollegeIds.has(row.id)}
                            onChange={() => togglePickCollege(row.id)}
                            ariaLabel={`Pick ${row.college_name}`}
                          />
                        </div>
                      </td>
                    ) : null}
                    {!pickForTask ? (
                      <td className={`${tdClass} sticky-col sticky-col-1 sticky-check-col`}>
                        <div className="flex justify-center">
                          <TableBulkCheckbox
                            checked={visitBulk.isSelected(row.id)}
                            onChange={() => visitBulk.toggleOne(row.id)}
                            ariaLabel={`Select ${row.college_name}`}
                          />
                        </div>
                      </td>
                    ) : null}
                    <td className={`${tdClass} sticky-col sticky-col-after-check min-w-[4.5rem]`}>{(page - 1) * pageSize + idx + 1}</td>
                    <td className={`${tdClass} min-w-[14rem] max-w-[18rem] truncate font-medium`} title={row.college_name}>{row.college_name}</td>
                    <td className={tdClass}>{row.location || "—"}</td>
                    <td className={tdClass}>{row.contact_number || "—"}</td>
                    <td className={tdClass}>{row.email || "—"}</td>
                    <td className={`${tdClass} min-w-[12rem]`}>{row.connected_person_name || "—"}</td>
                    <td className={tdClass}>{row.connected_person_role || "—"}</td>
                    <td className={tdClass}>{row.visit_status}</td>
                    <td className={`${tdClass} min-w-[11rem]`}>{formatDisplayDate(row.visit_date)}</td>
                    <td className={`${tdClass} min-w-[11rem]`}>{row.mou_signed_status}</td>
                    <td className={`${tdClass} min-w-[11rem]`}>{row.follow_up_stage || "—"}</td>
                    <td className={`${tdClass} min-w-[11rem]`}>{formatDisplayDate(row.last_follow_up_date)}</td>
                    <td className={`${tdClass} min-w-[11rem]`}>{formatDisplayDate(row.next_follow_up_date)}</td>
                    <td className={tdClass}>{row.priority}</td>
                    <td className={`${tdClass} min-w-[11rem]`}>{row.assigned_to ? ownerNameMap[row.assigned_to] || "—" : "—"}</td>
                    <td className={`${tdClass} min-w-[14rem] max-w-[18rem] truncate`} title={row.description ?? ""}>{row.description || "—"}</td>
                    <td className={`${tdClass} min-w-[14rem] max-w-[18rem] truncate`} title={row.last_outcome_remarks ?? ""}>{row.last_outcome_remarks || "—"}</td>
                    <td className={`${tdClass} min-w-[12rem]`}>{days != null ? days : "—"}</td>
                    <td className={tdClass}>
                      <span className={due ? "inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700" : "inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600"}>
                        {due ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className={tdClass}>{row.lead_score}</td>
                    <td className={tdClass}>{row.final_status}</td>
                    <td className={`${tdClass} min-w-[11rem]`}>{row.source_reference || "—"}</td>
                    {!pickForTask ? (
                      <td className={`${tdClass} min-w-[11rem]`}>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <Button size="sm" variant="outline" className="h-7 rounded-full px-2 text-[11px]" onClick={() => setViewVisit(row)}>Activity</Button>
                          {isAdmin ? (
                            <Button size="sm" variant="outline" className="h-7 rounded-full px-2 text-[11px]" onClick={() => openEdit(row)}>Edit</Button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
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
        canAssign={false}
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
