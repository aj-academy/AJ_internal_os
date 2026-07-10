"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  MessageCircle,
  Phone,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buildCsv, downloadCsv, parseCsv } from "@/lib/csv";
import { formatDateTimeIST, todayDateIST } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableHeaderCell, TableHeaderFilter } from "@/components/ui/TableHeaderFilter";
import { TableSearchBar } from "@/components/ui/TableSearchBar";
import {
  CommFilter,
  CustomColumnDef,
  EMPLOYEE_LEAD_PRIORITIES,
  EMPLOYEE_LEAD_SELECT,
  EMPLOYEE_LEAD_SOURCES,
  EMPLOYEE_LEAD_STATUSES,
  EmployeeLeadRow,
  LeadActivityRow,
  displayLeadName,
  digitsOnly,
  slugColumnKey,
  whatsAppHref,
} from "@/components/employee/leads/employeeLeadConfig";
import {
  EmployeeLeadFormPanel,
  type EmployeeLeadFormValue,
} from "@/components/employee/leads/EmployeeLeadFormPanel";
import { WhatsAppComposeModal } from "@/components/shared/WhatsAppComposeModal";
import { LeadActivityModal } from "@/components/shared/LeadActivityModal";
import {
  fetchWhatsAppTemplates,
  formatWhatsAppActivityNotes,
  MAX_WHATSAPP_MESSAGE_LENGTH,
} from "@/lib/whatsappOutreach";

const emptyLeadForm = (): EmployeeLeadFormValue => ({
  lead_name: "",
  company_name: "",
  phone: "",
  whatsapp: "",
  email: "",
  requirement: "",
  source: "",
  status: "New",
  priority: "Warm",
  notes: "",
  custom_fields: {},
});

function exportFilterSlug(parts: string[]) {
  const slug = parts
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return slug || "all";
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="rounded-[20px] border border-[#dbe6f3] bg-gradient-to-br from-[#f8fbff] to-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-[#64748b]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#0f172a]">{value}</p>
    </article>
  );
}

export function EmployeeLeadManagement() {
  const supabase = useMemo(() => createClient(), []);
  const fileRef = useRef<HTMLInputElement>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [leads, setLeads] = useState<EmployeeLeadRow[]>([]);
  const [customColumns, setCustomColumns] = useState<CustomColumnDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [commFilter, setCommFilter] = useState<CommFilter>("");

  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [leadForm, setLeadForm] = useState<EmployeeLeadFormValue>(emptyLeadForm);
  const [savingLead, setSavingLead] = useState(false);

  const [activityLead, setActivityLead] = useState<EmployeeLeadRow | null>(null);
  const [activities, setActivities] = useState<LeadActivityRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const [whatsAppTemplates, setWhatsAppTemplates] = useState<string[]>([]);
  const [whatsAppComposeLead, setWhatsAppComposeLead] = useState<EmployeeLeadRow | null>(null);
  const [whatsAppSubmitting, setWhatsAppSubmitting] = useState(false);

  const [columnsOpen, setColumnsOpen] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState("text");

  const loadUser = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    setUserId(data.user?.id ?? null);
    return data.user?.id ?? null;
  }, [supabase]);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const uid = userId ?? (await loadUser());
      if (!uid) {
        setLeads([]);
        return;
      }
      const { data, error: fetchError } = await supabase
        .from("clients")
        .select(EMPLOYEE_LEAD_SELECT)
        .eq("assigned_to", uid)
        .order("updated_at", { ascending: false });
      if (fetchError) {
        const m = fetchError.message.toLowerCase();
        if (m.includes("phone_called") || m.includes("custom_fields") || m.includes("schema cache")) {
          throw new Error("Run employee_lead_management_schema.sql in Supabase, then refresh.");
        }
        throw new Error(fetchError.message);
      }
      setLeads(
        ((data ?? []) as unknown as EmployeeLeadRow[]).map((row) => ({
          ...row,
          phone_called: Boolean(row.phone_called),
          whatsapp_sent: Boolean(row.whatsapp_sent),
          custom_fields: (row.custom_fields as Record<string, unknown> | null) ?? {},
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leads.");
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [loadUser, supabase, userId]);

  const loadCustomColumns = useCallback(async () => {
    const { data, error: colError } = await supabase
      .from("lead_custom_columns")
      .select("id,column_name,column_key,column_type,is_active")
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    if (!colError) setCustomColumns((data ?? []) as CustomColumnDef[]);
  }, [supabase]);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (userId) void loadLeads();
  }, [userId, loadLeads]);

  useEffect(() => {
    void loadCustomColumns();
  }, [loadCustomColumns]);

  useEffect(() => {
    void fetchWhatsAppTemplates(supabase).then(setWhatsAppTemplates);
  }, [supabase]);

  const sourceOptions = useMemo(() => {
    const fromData = new Set<string>();
    leads.forEach((row) => {
      const s = (row.source ?? "").trim();
      if (s) fromData.add(s);
    });
    EMPLOYEE_LEAD_SOURCES.forEach((s) => fromData.add(s));
    return Array.from(fromData).sort((a, b) => a.localeCompare(b));
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((row) => {
      const hay = [
        displayLeadName(row),
        row.company_name,
        row.phone,
        row.whatsapp,
        row.email,
        row.requirement,
        row.source,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (statusFilter && (row.status ?? "") !== statusFilter) return false;
      if (priorityFilter && (row.priority ?? "") !== priorityFilter) return false;
      if (sourceFilter && (row.source ?? "") !== sourceFilter) return false;
      if (commFilter === "called" && !row.phone_called) return false;
      if (commFilter === "not_called" && row.phone_called) return false;
      if (commFilter === "whatsapp_sent" && !row.whatsapp_sent) return false;
      if (commFilter === "whatsapp_pending" && row.whatsapp_sent) return false;
      return true;
    });
  }, [commFilter, leads, priorityFilter, search, sourceFilter, statusFilter]);

  const filtersActive = Boolean(search.trim() || statusFilter || priorityFilter || sourceFilter || commFilter);

  const stats = useMemo(() => {
    const total = leads.length;
    const callsDone = leads.filter((l) => l.phone_called).length;
    const waSent = leads.filter((l) => l.whatsapp_sent).length;
    const pending = leads.filter((l) => !l.phone_called && !l.whatsapp_sent).length;
    const followUp = leads.filter((l) => (l.status ?? "") === "Follow-up Required").length;
    return { total, callsDone, waSent, pending, followUp };
  }, [leads]);

  const patchLeadLocal = useCallback((id: string, patch: Partial<EmployeeLeadRow>) => {
    setLeads((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }, []);

  const logActivity = useCallback(
    async (leadId: string, activityType: string, notes: string, oldValue?: string, newValue?: string) => {
      const uid = userId;
      if (!uid) return;
      await supabase.from("lead_activities").insert({
        client_id: leadId,
        activity_type: activityType,
        notes,
        old_value: oldValue ?? null,
        new_value: newValue ?? null,
        created_by: uid,
      });
    },
    [supabase, userId],
  );

  const handlePhoneClick = async (row: EmployeeLeadRow) => {
    const phone = row.phone?.trim();
    if (!phone) {
      setError("No phone number on this lead.");
      return;
    }
    const now = new Date().toISOString();
    patchLeadLocal(row.id, { phone_called: true, phone_called_at: now, last_contacted_at: now });
    window.location.href = `tel:${phone}`;
    const { error: updateError } = await supabase
      .from("clients")
      .update({ phone_called: true, phone_called_at: now, last_contacted_at: now })
      .eq("id", row.id);
    if (updateError) {
      setError(updateError.message);
      void loadLeads();
      return;
    }
    void logActivity(row.id, "Phone Call", "Employee clicked phone call for this lead");
  };

  const openWhatsAppCompose = (row: EmployeeLeadRow) => {
    if (!whatsAppHref(row.whatsapp || row.phone)) {
      setError("No WhatsApp number on this lead.");
      return;
    }
    setWhatsAppComposeLead(row);
  };

  const handleWhatsAppSend = async (message: string) => {
    if (!whatsAppComposeLead || !userId) return;
    const trimmed = message.trim();
    if (!trimmed) {
      setError("Enter a message before opening WhatsApp.");
      return;
    }
    if (trimmed.length > MAX_WHATSAPP_MESSAGE_LENGTH) {
      setError(`Message is too long (max ${MAX_WHATSAPP_MESSAGE_LENGTH} characters).`);
      return;
    }

    const row = whatsAppComposeLead;
    const wa = whatsAppHref(row.whatsapp || row.phone, trimmed);
    if (!wa) {
      setError("No WhatsApp number on this lead.");
      return;
    }

    setWhatsAppSubmitting(true);
    setError(null);
    const now = new Date().toISOString();
    const activityNotes = formatWhatsAppActivityNotes(trimmed);

    patchLeadLocal(row.id, { whatsapp_sent: true, whatsapp_sent_at: now, last_contacted_at: now });
    window.open(wa, "_blank", "noopener,noreferrer");

    const { error: updateError } = await supabase
      .from("clients")
      .update({ whatsapp_sent: true, whatsapp_sent_at: now, last_contacted_at: now })
      .eq("id", row.id);

    if (updateError) {
      setError(updateError.message);
      setWhatsAppSubmitting(false);
      void loadLeads();
      return;
    }

    await logActivity(row.id, "WhatsApp Message", activityNotes);
    setWhatsAppComposeLead(null);
    setSuccess("WhatsApp opened and message saved to activity history.");
    setWhatsAppSubmitting(false);
  };

  const handleStatusChange = async (row: EmployeeLeadRow, status: string) => {
    const prev = row.status ?? "";
    patchLeadLocal(row.id, { status });
    const { error: updateError } = await supabase.from("clients").update({ status }).eq("id", row.id);
    if (updateError) {
      setError(updateError.message);
      patchLeadLocal(row.id, { status: prev });
      return;
    }
    void logActivity(row.id, "Status Updated", `Status changed to ${status}`, prev, status);
  };

  const handlePriorityChange = async (row: EmployeeLeadRow, priority: string) => {
    const prev = row.priority ?? "";
    patchLeadLocal(row.id, { priority });
    const { error: updateError } = await supabase.from("clients").update({ priority }).eq("id", row.id);
    if (updateError) {
      setError(updateError.message);
      patchLeadLocal(row.id, { priority: prev });
      return;
    }
    void logActivity(row.id, "Priority Updated", `Priority changed to ${priority}`, prev, priority);
  };

  const openActivity = async (row: EmployeeLeadRow) => {
    setActivityLead(row);
    setActivityLoading(true);
    setActivities([]);
    const { data, error: actError } = await supabase
      .from("lead_activities")
      .select("id,client_id,activity_type,notes,old_value,new_value,created_at,created_by")
      .eq("client_id", row.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (actError) setError(actError.message);
    else setActivities((data ?? []) as LeadActivityRow[]);
    setActivityLoading(false);
  };

  const handleExport = () => {
    if (!filteredLeads.length) {
      setError("No rows match the current filters to export.");
      return;
    }

    const headers = [
      "Lead Name",
      "Company",
      "Phone",
      "WhatsApp",
      "Email",
      "Description",
      "Source",
      "Status",
      "Priority",
      "Phone Called",
      "WhatsApp Sent",
      "Last Contacted",
      "Notes",
      ...customColumns.map((c) => c.column_name),
    ];

    const rows = filteredLeads.map((r) => [
      displayLeadName(r),
      r.company_name ?? "",
      r.phone ?? "",
      r.whatsapp ?? "",
      r.email ?? "",
      r.requirement ?? "",
      r.source ?? "",
      r.status ?? "",
      r.priority ?? "",
      r.phone_called ? "Yes" : "No",
      r.whatsapp_sent ? "Yes" : "No",
      r.last_contacted_at ? formatDateTimeIST(r.last_contacted_at) : "",
      r.notes ?? "",
      ...customColumns.map((c) => String((r.custom_fields ?? {})[c.column_key] ?? "")),
    ]);

    const slug = exportFilterSlug([
      sourceFilter,
      statusFilter,
      priorityFilter,
      commFilter,
      search.trim(),
    ]);
    downloadCsv(`employee-leads-${slug}-${todayDateIST()}.csv`, buildCsv(headers, rows));
    setSuccess(
      filtersActive
        ? `Exported ${filteredLeads.length} filtered row(s) (of ${leads.length} assigned).`
        : `Exported all ${filteredLeads.length} assigned lead(s).`,
    );
  };

  const handleSaveLead = async () => {
    if (!userId) return;
    const leadName = leadForm.lead_name.trim();
    if (!leadName) {
      setError("Lead name is required.");
      return;
    }
    const email = leadForm.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }

    setSavingLead(true);
    setError(null);
    setSuccess(null);
    try {
      const phone = leadForm.phone.trim() || null;
      const customFields: Record<string, unknown> = {};
      Object.entries(leadForm.custom_fields).forEach(([key, val]) => {
        if (val.trim()) customFields[key] = val.trim();
      });

      const payload = {
        name: leadName,
        lead_name: leadName,
        company_name: leadForm.company_name.trim() || null,
        phone,
        whatsapp: leadForm.whatsapp.trim() || phone,
        email: email || null,
        requirement: leadForm.requirement.trim() || null,
        source: leadForm.source.trim() || null,
        status: leadForm.status || "New",
        priority: leadForm.priority || "Warm",
        notes: leadForm.notes.trim() || null,
        assigned_to: userId,
        assigned_by: userId,
        phone_called: false,
        whatsapp_sent: false,
        custom_fields: customFields,
      };

      const { data: inserted, error: insertError } = await supabase
        .from("clients")
        .insert(payload)
        .select("id")
        .single();

      if (insertError) throw new Error(insertError.message);

      if (inserted?.id) {
        await logActivity(inserted.id, "Lead Created", "Employee added a new lead from Lead Management.");
      }

      setAddLeadOpen(false);
      setLeadForm(emptyLeadForm());
      setSuccess(`Lead "${leadName}" added successfully.`);
      await loadLeads();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save lead.");
    } finally {
      setSavingLead(false);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setPriorityFilter("");
    setSourceFilter("");
    setCommFilter("");
  };

  const handleImportFile = async (file: File) => {
    if (!userId) return;
    setImporting(true);
    setError(null);
    setSuccess(null);
    try {
      const text = await file.text();
      const matrix = parseCsv(text);
      if (matrix.length < 2) throw new Error("CSV must include a header row and at least one data row.");

      const headers = matrix[0].map((h) => h.trim().toLowerCase());
      const idx = (key: string) => headers.indexOf(key);

      const leadNameIdx = idx("lead_name");
      if (leadNameIdx < 0) throw new Error('CSV must include a "lead_name" column.');

      let ok = 0;
      let fail = 0;
      const errors: string[] = [];

      for (let i = 1; i < matrix.length; i += 1) {
        const cells = matrix[i];
        const leadName = (cells[leadNameIdx] ?? "").trim();
        if (!leadName) {
          fail += 1;
          errors.push(`Row ${i + 1}: lead_name is required.`);
          continue;
        }

        const phone = (cells[idx("phone")] ?? "").trim() || null;
        const email = (cells[idx("email")] ?? "").trim() || null;
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          fail += 1;
          errors.push(`Row ${i + 1}: invalid email.`);
          continue;
        }

        const payload = {
          name: leadName,
          lead_name: leadName,
          company_name: (cells[idx("company_name")] ?? "").trim() || null,
          phone,
          whatsapp: (cells[idx("whatsapp")] ?? "").trim() || phone,
          email,
          requirement: (cells[idx("description")] ?? "").trim() || null,
          source: (cells[idx("source")] ?? "").trim() || null,
          priority: (cells[idx("priority")] ?? "").trim() || "Warm",
          status: (cells[idx("status")] ?? "").trim() || "New",
          assigned_to: userId,
          assigned_by: userId,
          phone_called: false,
          whatsapp_sent: false,
          custom_fields: {} as Record<string, unknown>,
        };

        const { error: insertError } = await supabase.from("clients").insert(payload);
        if (insertError) {
          fail += 1;
          errors.push(`Row ${i + 1}: ${insertError.message}`);
        } else {
          ok += 1;
        }
      }

      await loadLeads();
      setSuccess(`Import complete: ${ok} added, ${fail} failed.${errors.length ? ` ${errors.slice(0, 3).join(" ")}` : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const saveCustomColumn = async () => {
    const name = newColName.trim();
    if (!name || !userId) return;
    const key = slugColumnKey(name);
    if (!key) {
      setError("Invalid column name.");
      return;
    }
    const { error: insertError } = await supabase.from("lead_custom_columns").insert({
      column_name: name,
      column_key: key,
      column_type: newColType,
      created_by: userId,
      is_active: true,
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setNewColName("");
    setNewColType("text");
    setSuccess("Custom column saved.");
    void loadCustomColumns();
  };

  const updateCustomField = async (row: EmployeeLeadRow, key: string, value: string) => {
    const prev = { ...(row.custom_fields ?? {}) };
    const next = { ...prev, [key]: value };
    patchLeadLocal(row.id, { custom_fields: next });
    const { error: updateError } = await supabase.from("clients").update({ custom_fields: next }).eq("id", row.id);
    if (updateError) {
      setError(updateError.message);
      patchLeadLocal(row.id, { custom_fields: prev });
    }
  };

  return (
    <section className="space-y-6 rounded-[24px] border border-[#d4deea] bg-white p-4 shadow-[0_20px_40px_rgba(30,64,175,0.08)] sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 border-b border-[#e8edf5] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#64748b]">Employee CRM</p>
          <h2 className="mt-1 text-2xl font-semibold text-[#0f172a] sm:text-3xl">Lead Management</h2>
          <p className="mt-1 max-w-2xl text-sm text-[#64748b]">
            View assigned leads, call prospects, send WhatsApp messages and track follow-up activity. Data is stored in{" "}
            <code className="rounded bg-[#f1f6fc] px-1 text-xs">public.clients</code> (same as Client Master).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="rounded-full bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
            onClick={() => {
              setLeadForm(emptyLeadForm());
              setAddLeadOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add lead
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportFile(f);
            }}
          />
          <Button type="button" variant="outline" className="rounded-full border-[#d4deea]" onClick={() => fileRef.current?.click()} disabled={importing}>
            <Upload className="mr-1 h-4 w-4" />
            {importing ? "Importing…" : "Import"}
          </Button>
          <Button type="button" variant="outline" className="rounded-full border-[#d4deea]" onClick={handleExport} disabled={!filteredLeads.length}>
            <Download className="mr-1 h-4 w-4" />
            Export{filteredLeads.length ? ` (${filteredLeads.length})` : ""}
          </Button>
          <Button type="button" variant="outline" className="rounded-full border-[#d4deea]" onClick={() => setColumnsOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Manage Columns
          </Button>
        </div>
      </header>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{success}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total Assigned Leads" value={stats.total} />
        <StatCard label="Calls Done" value={stats.callsDone} />
        <StatCard label="WhatsApp Sent" value={stats.waSent} />
        <StatCard label="Pending Leads" value={stats.pending} />
        <StatCard label="Follow-up Required" value={stats.followUp} />
      </div>

      <TableSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Name, company, phone, email…"
        showClear={filtersActive}
        onClear={clearFilters}
        hint={`Showing ${filteredLeads.length} of ${leads.length} assigned lead(s)`}
      />

      <div className="responsive-table-wrap overflow-x-auto rounded-2xl border border-[#dbe6f3]">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-[#f1f6fc] text-xs uppercase tracking-wide text-[#64748b]">
            <tr>
              <TableHeaderCell label="Lead Name" />
              <TableHeaderCell label="Company" />
              <TableHeaderCell label="Contact" />
              <TableHeaderCell label="Email" />
              <TableHeaderCell label="Description" />
              <TableHeaderFilter
                label="Source"
                value={sourceFilter}
                onChange={setSourceFilter}
                options={sourceOptions.map((s) => ({ value: s, label: s }))}
                allLabel="All sources"
              />
              <TableHeaderFilter
                label="Status"
                value={statusFilter}
                onChange={setStatusFilter}
                options={EMPLOYEE_LEAD_STATUSES.map((s) => ({ value: s, label: s }))}
                allLabel="All statuses"
              />
              <TableHeaderFilter
                label="Priority"
                value={priorityFilter}
                onChange={setPriorityFilter}
                options={EMPLOYEE_LEAD_PRIORITIES.map((p) => ({ value: p, label: p }))}
                allLabel="All priorities"
              />
              <TableHeaderFilter
                label="Communication"
                value={commFilter}
                onChange={(v) => setCommFilter(v as CommFilter)}
                options={[
                  { value: "called", label: "Called" },
                  { value: "not_called", label: "Not called" },
                  { value: "whatsapp_sent", label: "WhatsApp sent" },
                  { value: "whatsapp_pending", label: "WhatsApp pending" },
                ]}
                allLabel="All"
              />
              <TableHeaderCell label="Last Contacted" />
              {customColumns.map((col) => (
                <TableHeaderCell key={col.id} label={col.column_name} />
              ))}
              <TableHeaderCell label="Actions" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11 + customColumns.length} className="px-3 py-10 text-center text-[#64748b]">
                  Loading leads…
                </td>
              </tr>
            ) : !filteredLeads.length ? (
              <tr>
                <td colSpan={11 + customColumns.length} className="px-3 py-10 text-center text-[#64748b]">
                  {filtersActive ? "No leads match the current filters." : "No leads assigned yet."}
                </td>
              </tr>
            ) : (
              filteredLeads.map((row) => (
                <tr key={row.id} className="border-t border-[#eef2f7] align-top">
                  <td className="px-3 py-2 font-medium text-[#0f172a]">{displayLeadName(row)}</td>
                  <td className="px-3 py-2 text-[#64748b]">{row.company_name || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        title="Click to call"
                        disabled={!row.phone}
                        onClick={() => void handlePhoneClick(row)}
                        className={[
                          "inline-flex h-9 w-9 items-center justify-center rounded-full border transition",
                          row.phone_called
                            ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                            : "border-rose-200 bg-rose-50 text-rose-600",
                          !row.phone ? "cursor-not-allowed opacity-40" : "hover:scale-105",
                        ].join(" ")}
                      >
                        <Phone className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Click to WhatsApp"
                        disabled={!digitsOnly(row.whatsapp || row.phone)}
                        onClick={() => openWhatsAppCompose(row)}
                        className={[
                          "inline-flex h-9 w-9 items-center justify-center rounded-full border transition",
                          row.whatsapp_sent
                            ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                            : "border-rose-200 bg-rose-50 text-rose-600",
                          !digitsOnly(row.whatsapp || row.phone) ? "cursor-not-allowed opacity-40" : "hover:scale-105",
                        ].join(" ")}
                      >
                        <MessageCircle className="h-4 w-4" />
                      </button>
                      {row.phone ? <span className="text-xs text-[#64748b]">{row.phone}</span> : null}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[#64748b]">{row.email || "—"}</td>
                  <td className="max-w-[200px] px-3 py-2 text-[#64748b]">
                    <p className="line-clamp-2">{row.requirement || "—"}</p>
                  </td>
                  <td className="px-3 py-2 text-[#64748b]">{row.source || "—"}</td>
                  <td className="px-3 py-2">
                    <select
                      value={row.status ?? "New"}
                      onChange={(e) => void handleStatusChange(row, e.target.value)}
                      className="h-8 max-w-[160px] rounded-lg border border-[#cfdceb] bg-white px-2 text-xs"
                    >
                      {EMPLOYEE_LEAD_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={row.priority ?? "Warm"}
                      onChange={(e) => void handlePriorityChange(row, e.target.value)}
                      className="h-8 max-w-[120px] rounded-lg border border-[#cfdceb] bg-white px-2 text-xs"
                    >
                      {EMPLOYEE_LEAD_PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-xs text-[#64748b]">
                    {row.last_contacted_at ? formatDateTimeIST(row.last_contacted_at) : "—"}
                  </td>
                  {customColumns.map((col) => {
                    const val = String((row.custom_fields ?? {})[col.column_key] ?? "");
                    return (
                      <td key={col.id} className="px-3 py-2">
                        <input
                          value={val}
                          onChange={(e) => patchLeadLocal(row.id, { custom_fields: { ...(row.custom_fields ?? {}), [col.column_key]: e.target.value } })}
                          onBlur={(e) => void updateCustomField(row, col.column_key, e.target.value)}
                          className="h-8 w-full min-w-[100px] rounded-lg border border-[#cfdceb] px-2 text-xs"
                        />
                      </td>
                    );
                  })}
                  <td className="px-3 py-2">
                    <Button type="button" variant="outline" size="sm" className="rounded-full text-xs" onClick={() => void openActivity(row)}>
                      View Activity
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <LeadActivityModal
        open={Boolean(activityLead)}
        title={activityLead ? `Activity — ${displayLeadName(activityLead)}` : "Activity"}
        loading={activityLoading}
        activities={activities}
        employeeNameMap={userId ? { [userId]: "You" } : {}}
        onClose={() => setActivityLead(null)}
      />

      {whatsAppComposeLead ? (
        <WhatsAppComposeModal
          open={Boolean(whatsAppComposeLead)}
          leadName={displayLeadName(whatsAppComposeLead)}
          phone={String(whatsAppComposeLead.whatsapp || whatsAppComposeLead.phone || "")}
          templates={whatsAppTemplates}
          submitting={whatsAppSubmitting}
          onClose={() => {
            if (!whatsAppSubmitting) setWhatsAppComposeLead(null);
          }}
          onSend={(message) => void handleWhatsAppSend(message)}
        />
      ) : null}

      {columnsOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#d4deea] bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#0f172a]">Manage custom columns</h3>
              <button type="button" onClick={() => setColumnsOpen(false)} className="rounded-full p-1 hover:bg-[#f1f5f9]" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 text-xs text-[#64748b]">Values are saved per lead in custom_fields (jsonb).</p>
            <div className="space-y-3">
              <Input value={newColName} onChange={(e) => setNewColName(e.target.value)} placeholder="Column name" className="border-[#d4deea]" />
              <select value={newColType} onChange={(e) => setNewColType(e.target.value)} className="h-10 w-full rounded-xl border border-[#cfdceb] px-3 text-sm">
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
                <option value="dropdown">Dropdown</option>
              </select>
              <Button type="button" className="w-full rounded-full bg-[#2563eb]" onClick={() => void saveCustomColumn()}>
                Save column
              </Button>
            </div>
            {customColumns.length ? (
              <ul className="mt-4 space-y-1 border-t border-[#eef2f7] pt-3 text-sm text-[#64748b]">
                {customColumns.map((c) => (
                  <li key={c.id}>
                    {c.column_name} <span className="text-xs">({c.column_type})</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}

      <EmployeeLeadFormPanel
        open={addLeadOpen}
        value={leadForm}
        customColumns={customColumns}
        submitting={savingLead}
        onChange={setLeadForm}
        onClose={() => setAddLeadOpen(false)}
        onSubmit={() => void handleSaveLead()}
      />
    </section>
  );
}
