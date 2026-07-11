"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { TableHeaderCell, TableHeaderFilter } from "@/components/ui/TableHeaderFilter";
import { TableSearchBar } from "@/components/ui/TableSearchBar";
import {
  EMPLOYEE_LEAD_PRIORITIES,
  EMPLOYEE_LEAD_SELECT,
  EMPLOYEE_LEAD_SOURCES,
  EMPLOYEE_LEAD_STATUSES,
  EmployeeLeadRow,
  displayLeadName,
} from "@/components/employee/leads/employeeLeadConfig";

export type TaskLeadPickerSelection = {
  ids: string[];
  leads: Pick<EmployeeLeadRow, "id" | "lead_name" | "name" | "company_name" | "status" | "priority">[];
  filterPath: string;
};

type TaskLeadPickerModalProps = {
  open: boolean;
  assigneeId: string;
  assigneeName: string;
  initialSelectedIds?: string[];
  onClose: () => void;
  onConfirm: (selection: TaskLeadPickerSelection) => void;
};

export function TaskLeadPickerModal({
  open,
  assigneeId,
  assigneeName,
  initialSelectedIds = [],
  onClose,
  onConfirm,
}: TaskLeadPickerModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const [leads, setLeads] = useState<EmployeeLeadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialSelectedIds));

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set(initialSelectedIds));
  }, [open, initialSelectedIds]);

  const loadLeads = useCallback(async () => {
    if (!assigneeId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("clients")
        .select(EMPLOYEE_LEAD_SELECT)
        .eq("assigned_to", assigneeId)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (fetchError) throw new Error(fetchError.message);
      setLeads((data ?? []) as unknown as EmployeeLeadRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leads.");
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [assigneeId, supabase]);

  useEffect(() => {
    if (open && assigneeId) void loadLeads();
  }, [open, assigneeId, loadLeads]);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((row) => {
      if (statusFilter && (row.status ?? "") !== statusFilter) return false;
      if (priorityFilter && (row.priority ?? "") !== priorityFilter) return false;
      if (sourceFilter && (row.source ?? "") !== sourceFilter) return false;
      if (!q) return true;
      const hay = [
        displayLeadName(row),
        row.company_name,
        row.email,
        row.phone,
        row.requirement,
        row.source,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [leads, search, statusFilter, priorityFilter, sourceFilter]);

  const filterPath = useMemo(() => {
    const parts = ["Task Assignment", `Assignee: ${assigneeName}`, "Leads"];
    if (statusFilter) parts.push(`Status=${statusFilter}`);
    if (priorityFilter) parts.push(`Priority=${priorityFilter}`);
    if (sourceFilter) parts.push(`Source=${sourceFilter}`);
    if (search.trim()) parts.push(`Search="${search.trim()}"`);
    return parts.join(" → ");
  }, [assigneeName, statusFilter, priorityFilter, sourceFilter, search]);

  const selectedLeads = useMemo(
    () => leads.filter((l) => selectedIds.has(l.id)),
    [leads, selectedIds],
  );

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    onConfirm({
      ids: [...selectedIds],
      leads: selectedLeads.map((l) => ({
        id: l.id,
        lead_name: l.lead_name,
        name: l.name,
        company_name: l.company_name,
        status: l.status,
        priority: l.priority,
      })),
      filterPath,
    });
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-[70] bg-slate-900/50" onClick={onClose} />
      <div className="fixed inset-4 z-[71] mx-auto flex max-w-5xl flex-col overflow-hidden rounded-[24px] border border-[#dbe6f3] bg-white shadow-2xl sm:inset-8">
        <div className="shrink-0 border-b border-[#e8edf5] bg-[#f8fbff] px-4 py-3 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-[#64748b]">Lead selection preview</p>
              <p className="mt-1 truncate text-sm text-[#334155]" title={filterPath}>
                {filterPath}
              </p>
              <p className="mt-1 text-xs text-[#64748b]">
                {selectedIds.size} lead(s) selected · showing assignee&apos;s lead dashboard ({assigneeName})
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-full p-1 text-[#64748b] hover:bg-white">
              <X className="h-5 w-5" />
            </button>
          </div>
          {selectedLeads.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selectedLeads.map((l) => (
                <span
                  key={l.id}
                  className="inline-flex items-center gap-1 rounded-full bg-[#fef3c7] px-2.5 py-0.5 text-xs font-medium text-[#92400e]"
                >
                  {displayLeadName(l)}
                  <button type="button" onClick={() => toggleRow(l.id)} aria-label="Remove">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
          ) : null}

          <TableSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search leads…"
            hint={`${filteredLeads.length} of ${leads.length} lead(s)`}
          />

          <div className="overflow-x-auto rounded-xl border border-[#dbe6f3]">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-[#f1f6fc] text-xs uppercase tracking-wide text-[#64748b]">
                <tr>
                  <TableHeaderCell label="Select" className="px-3 py-2" />
                  <TableHeaderCell label="Lead Name" className="px-3 py-2" />
                  <TableHeaderCell label="Company" className="px-3 py-2" />
                  <TableHeaderCell label="Email" className="px-3 py-2" />
                  <TableHeaderFilter
                    label="Status"
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={EMPLOYEE_LEAD_STATUSES.map((s) => ({ value: s, label: s }))}
                    allLabel="All"
                    className="px-3 py-2"
                  />
                  <TableHeaderFilter
                    label="Priority"
                    value={priorityFilter}
                    onChange={setPriorityFilter}
                    options={EMPLOYEE_LEAD_PRIORITIES.map((p) => ({ value: p, label: p }))}
                    allLabel="All"
                    className="px-3 py-2"
                  />
                  <TableHeaderFilter
                    label="Source"
                    value={sourceFilter}
                    onChange={setSourceFilter}
                    options={EMPLOYEE_LEAD_SOURCES.map((s) => ({ value: s, label: s }))}
                    allLabel="All"
                    className="px-3 py-2"
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8edf5]">
                {loading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={7} className="px-3 py-3">
                          <div className="h-5 animate-pulse rounded bg-[#e8edf5]" />
                        </td>
                      </tr>
                    ))
                  : filteredLeads.map((row) => {
                      const checked = selectedIds.has(row.id);
                      return (
                        <tr
                          key={row.id}
                          className={checked ? "bg-amber-50/80" : "hover:bg-[#f8fbff]"}
                          onClick={() => toggleRow(row.id)}
                        >
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleRow(row.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="h-4 w-4 rounded border-[#cbd5e1]"
                            />
                          </td>
                          <td className="px-3 py-2.5 font-medium text-[#0f172a]">{displayLeadName(row)}</td>
                          <td className="px-3 py-2.5">{row.company_name || "—"}</td>
                          <td className="px-3 py-2.5">{row.email || "—"}</td>
                          <td className="px-3 py-2.5">{row.status || "—"}</td>
                          <td className="px-3 py-2.5">{row.priority || "—"}</td>
                          <td className="px-3 py-2.5">{row.source || "—"}</td>
                        </tr>
                      );
                    })}
                {!loading && !filteredLeads.length ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-[#64748b]">
                      No leads assigned to this user match your filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[#e8edf5] px-4 py-3 sm:px-5">
          <Button type="button" variant="outline" onClick={onClose} className="rounded-full">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedIds.size}
            className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f] disabled:opacity-50"
          >
            <Check className="mr-2 h-4 w-4" />
            Confirm {selectedIds.size ? `${selectedIds.size} lead(s)` : "selection"}
          </Button>
        </div>
      </div>
    </>
  );
}
