"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Clock, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CrmFlash } from "@/components/ui/CrmFlash";
import { TableSearchBar } from "@/components/ui/TableSearchBar";
import { TablePagination } from "@/components/ui/TablePagination";
import { BulkSelectionBar } from "@/components/ui/BulkSelectionBar";
import { MobileRecordCard } from "@/components/ui/MobileRecordCard";
import { ResponsiveDataView, TABLE_DATA_TD, TABLE_DATA_TH } from "@/components/ui/ResponsiveDataView";
import { usePagination } from "@/lib/usePagination";
import { useRowSelection } from "@/lib/useRowSelection";
import {
  MEETING_MODES,
  NOTIFY_OFFSET_PRESETS,
  RECURRENCE_RULES,
  RELATED_MODULES,
  REMINDER_PRIORITIES,
  REMINDER_STATUSES,
  REMINDER_TYPES,
  type ReminderFormValue,
  type ReminderRow,
  type ReminderUserSettings,
  type ReminderWorkbenchTab,
} from "@/types/reminders";
import {
  emptyReminderForm,
  isOverdueReminder,
  relatedRecordHref,
  reminderRowToForm,
  todayDateIST,
  validateReminderForm,
} from "@/lib/reminders/reminderHelpers";
import { playReminderChimeOnce, stopReminderRing, unlockReminderAudio } from "@/lib/reminders/reminderSound";

type ProfileMini = { id: string; full_name: string | null; email: string | null };

const TABS: { id: ReminderWorkbenchTab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "calendar", label: "Calendar" },
  { id: "all", label: "All Reminders" },
  { id: "assigned", label: "Assigned to Me" },
  { id: "created", label: "Created by Me" },
  { id: "completed", label: "Completed" },
  { id: "settings", label: "Settings" },
];

export function RemindersWorkbench({
  role,
  currentUserId,
}: {
  role: "admin" | "employee";
  currentUserId: string;
}) {
  const [tab, setTab] = useState<ReminderWorkbenchTab>("today");
  const [rows, setRows] = useState<ReminderRow[]>([]);
  const [employees, setEmployees] = useState<ProfileMini[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [fltType, setFltType] = useState("");
  const [fltPriority, setFltPriority] = useState("");
  const [fltStatus, setFltStatus] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ReminderFormValue>(() => emptyReminderForm());
  const [submitting, setSubmitting] = useState(false);
  const [viewRow, setViewRow] = useState<ReminderRow | null>(null);
  const [settings, setSettings] = useState<ReminderUserSettings | null>(null);
  const [calMonth, setCalMonth] = useState(() => todayDateIST().slice(0, 7));
  const [relatedQ, setRelatedQ] = useState("");
  const [relatedItems, setRelatedItems] = useState<{ id: string; label: string }[]>([]);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reminders");
      const json = (await res.json()) as {
        reminders?: ReminderRow[];
        schemaMissing?: boolean;
        error?: string;
      };
      if (json.schemaMissing) setSchemaMissing(true);
      if (!res.ok && json.error) setError(json.error);
      setRows(json.reminders ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load reminders.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/reminders/settings");
    const json = (await res.json()) as { settings?: ReminderUserSettings };
    if (json.settings) setSettings(json.settings as ReminderUserSettings);
  }, []);

  useEffect(() => {
    void load();
    void loadSettings();
  }, [load, loadSettings]);

  useEffect(() => {
    const unlock = () => unlockReminderAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/reminders/related?module=" + encodeURIComponent("Employee/User Master") + "&q=");
      if (res.ok) {
        const json = (await res.json()) as { items?: { id: string; label: string }[] };
        const list = (json.items ?? []).map((it) => ({
          id: it.id,
          full_name: it.label,
          email: null as string | null,
        }));
        if (!list.some((e) => e.id === currentUserId)) {
          list.unshift({ id: currentUserId, full_name: "Me", email: null });
        }
        setEmployees(list);
        return;
      }
      setEmployees([{ id: currentUserId, full_name: "Me", email: null }]);
    })();
  }, [currentUserId]);

  const today = todayDateIST();

  const filtered = useMemo(() => {
    let list = [...rows];
    if (tab === "today") list = list.filter((r) => r.reminder_date === today);
    else if (tab === "upcoming")
      list = list.filter((r) => r.reminder_date > today && r.status !== "Completed" && r.status !== "Cancelled");
    else if (tab === "completed") list = list.filter((r) => r.status === "Completed");
    else if (tab === "assigned")
      list = list.filter((r) => (r.assignees ?? []).some((a) => a.user_id === currentUserId));
    else if (tab === "created") list = list.filter((r) => r.created_by === currentUserId);
    else if (tab === "calendar") list = list.filter((r) => r.reminder_date.startsWith(calMonth));

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          (r.description || "").toLowerCase().includes(q) ||
          (r.related_record_label || "").toLowerCase().includes(q),
      );
    }
    if (fltType) list = list.filter((r) => r.reminder_type === fltType);
    if (fltPriority) list = list.filter((r) => r.priority === fltPriority);
    if (fltStatus) list = list.filter((r) => r.status === fltStatus);
    return list;
  }, [rows, tab, today, search, fltType, fltPriority, fltStatus, currentUserId, calMonth]);

  const todayBuckets = useMemo(() => {
    const day = rows.filter((r) => r.reminder_date === today);
    return {
      overdue: day.filter((r) => isOverdueReminder(r) && r.status !== "Completed"),
      dueNow: day.filter((r) => !isOverdueReminder(r) && r.status === "Scheduled"),
      upcoming: day.filter((r) => r.status === "In Progress"),
      completed: day.filter((r) => r.status === "Completed"),
    };
  }, [rows, today]);

  const {
    paginatedItems,
    page,
    setPage,
    totalPages,
    totalItems,
    pageSize,
    setPageSize,
  } = usePagination(filtered, 15);
  const selection = useRowSelection(paginatedItems, (r) => r.id);

  const openCreate = () => {
    setEditId(null);
    setForm({
      ...emptyReminderForm({
        notify: settings?.default_notify_offsets_minutes,
        date: today,
      }),
      assignee_ids: [currentUserId],
    });
    setPanelOpen(true);
  };

  const openEdit = (row: ReminderRow) => {
    setEditId(row.id);
    setForm(reminderRowToForm(row));
    setPanelOpen(true);
  };

  const save = async () => {
    const invalid = validateReminderForm(form);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(editId ? `/api/reminders/${editId}` : "/api/reminders", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Save failed");
      setSuccess(editId ? "Reminder updated." : "Reminder created.");
      setPanelOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const quickAction = async (
    id: string,
    action: "complete" | "snooze" | "reschedule",
    extra?: Record<string, unknown>,
  ) => {
    setError(null);
    const res = await fetch(`/api/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(json.error || "Action failed");
      return;
    }
    setSuccess(action === "complete" ? "Marked complete." : action === "snooze" ? "Snoozed." : "Rescheduled.");
    if (action === "snooze" || action === "complete") stopReminderRing();
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this reminder? Related CRM records will NOT be deleted.")) return;
    const res = await fetch(`/api/reminders/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      setError(json.error || "Delete failed");
      return;
    }
    setSuccess("Reminder deleted.");
    await load();
  };

  const searchRelated = async () => {
    if (!form.related_module || form.related_module === "General" || form.related_module === "Finance & Expenses") {
      setRelatedItems([]);
      return;
    }
    const res = await fetch(
      `/api/reminders/related?module=${encodeURIComponent(form.related_module)}&q=${encodeURIComponent(relatedQ)}`,
    );
    const json = (await res.json()) as { items?: { id: string; label: string }[] };
    setRelatedItems(json.items ?? []);
  };

  const saveSettings = async (next: ReminderUserSettings) => {
    const res = await fetch("/api/reminders/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const json = (await res.json()) as { settings?: ReminderUserSettings; error?: string };
    if (!res.ok) {
      setError(json.error || "Could not save settings");
      return;
    }
    setSettings(json.settings as ReminderUserSettings);
    setSuccess("Reminder notification settings saved.");
  };

  const enableBrowserNotifications = async () => {
    if (!("Notification" in window)) {
      setError("This browser does not support notifications.");
      return;
    }
    if (Notification.permission === "denied") {
      setError("Notifications were blocked. Enable them in browser settings.");
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      setError("Notification permission not granted.");
      return;
    }
    if (settings) {
      await saveSettings({ ...settings, browser_notification_enabled: true });
    }
    setSuccess("Browser notifications enabled.");
  };

  const enablePush = async () => {
    const pub = process.env.NEXT_PUBLIC_REMINDER_VAPID_PUBLIC_KEY;
    if (!pub || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setError("Push is not configured yet. Set NEXT_PUBLIC_REMINDER_VAPID_PUBLIC_KEY after generating VAPID keys.");
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(pub),
    });
    const json = sub.toJSON();
    const res = await fetch("/api/reminders/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
        userAgent: navigator.userAgent,
      }),
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error || "Push subscribe failed");
      return;
    }
    if (settings) await saveSettings({ ...settings, push_enabled: true });
    setSuccess("Push subscription saved. Background alerts follow OS notification rules.");
  };

  const exportCsv = () => {
    const headers = ["Title", "Type", "Date", "Time", "Priority", "Status", "Related", "Recurrence"];
    const lines = filtered.map((r) =>
      [
        r.title,
        r.reminder_type,
        r.reminder_date,
        r.is_all_day ? "All day" : r.start_time || "",
        r.priority,
        r.status,
        r.related_record_label || "",
        r.recurrence_rule,
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[headers.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `reminders-${today}.csv`;
    a.click();
  };

  return (
    <section className="space-y-5 rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-[0_20px_40px_rgba(30,64,175,0.08)] sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-3xl font-semibold text-[#0f172a]">
            <CalendarDays className="h-8 w-8 text-[#c9a227]" />
            Reminders &amp; Calendar
          </h2>
          <p className="mt-1 text-sm text-[#64748b]">
            Schedule meetings, follow-ups and deadlines with sound alerts — without changing Student Master, College Visits, or other modules.
          </p>
        </div>
        <Button className="h-9 rounded-full bg-[#c9a227] px-5 text-white hover:bg-[#b8921f]" onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> New reminder
        </Button>
      </header>

      {schemaMissing ? (
        <div className="rounded-xl border border-amber-200 bg-[#fffbeb] px-4 py-3 text-sm text-amber-950">
          Run <code className="rounded bg-white/80 px-1">AJ_Academy_SB/aj_reminders_schema.sql</code> in Supabase SQL Editor
          (additive only). Existing CRM tables are not modified.
        </div>
      ) : null}
      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {success ? <CrmFlash tone="success" message={success} onDismiss={() => setSuccess(null)} /> : null}

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? "rounded-full bg-[#c9a227] px-3 py-1.5 text-xs font-semibold text-white"
                : "rounded-full border border-[#e8dcc8] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "settings" ? (
        <SettingsPanel
          settings={settings}
          onSave={saveSettings}
          onEnableBrowser={enableBrowserNotifications}
          onEnablePush={enablePush}
          onTestSound={() =>
            playReminderChimeOnce({
              notificationId: `test-${Date.now()}`,
              volume: settings?.sound_volume ?? 80,
              durationMs: 60_000,
            })
          }
        />
      ) : null}

      {tab === "today" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Bucket title="Overdue" tone="rose" items={todayBuckets.overdue} onView={setViewRow} onComplete={(id) => void quickAction(id, "complete")} onSnooze={(id) => void quickAction(id, "snooze", { snooze_minutes: settings?.default_snooze_minutes ?? 10 })} />
          <Bucket title="Due / scheduled today" tone="amber" items={todayBuckets.dueNow} onView={setViewRow} onComplete={(id) => void quickAction(id, "complete")} onSnooze={(id) => void quickAction(id, "snooze", { snooze_minutes: 10 })} />
          <Bucket title="In progress today" tone="blue" items={todayBuckets.upcoming} onView={setViewRow} onComplete={(id) => void quickAction(id, "complete")} onSnooze={(id) => void quickAction(id, "snooze", { snooze_minutes: 10 })} />
          <Bucket title="Completed today" tone="emerald" items={todayBuckets.completed} onView={setViewRow} onComplete={() => undefined} onSnooze={() => undefined} />
        </div>
      ) : null}

      {tab === "calendar" ? (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            Month
            <input type="month" className="rounded-lg border border-[#e8dcc8] px-2 py-1" value={calMonth} onChange={(e) => setCalMonth(e.target.value)} />
          </label>
          <CalendarMonth
            month={calMonth}
            rows={filtered}
            onSelect={(r) => setViewRow(r)}
          />
        </div>
      ) : null}

      {tab !== "settings" && tab !== "today" && tab !== "calendar" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <TableSearchBar value={search} onChange={setSearch} placeholder="Search title, notes, related…" />
            <Button type="button" variant="outline" className="h-9 rounded-full border-[#e8dcc8] md:hidden" onClick={() => setMobileFiltersOpen(true)}>
              Filters
            </Button>
            <div className="hidden flex-wrap gap-2 md:flex">
              <select className="h-9 rounded-full border border-[#e8dcc8] px-3 text-xs" value={fltType} onChange={(e) => setFltType(e.target.value)}>
                <option value="">All types</option>
                {REMINDER_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <select className="h-9 rounded-full border border-[#e8dcc8] px-3 text-xs" value={fltPriority} onChange={(e) => setFltPriority(e.target.value)}>
                <option value="">All priorities</option>
                {REMINDER_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <select className="h-9 rounded-full border border-[#e8dcc8] px-3 text-xs" value={fltStatus} onChange={(e) => setFltStatus(e.target.value)}>
                <option value="">All statuses</option>
                {REMINDER_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <Button type="button" variant="outline" className="h-9 rounded-full border-[#e8dcc8]" onClick={exportCsv}>
              Export CSV
            </Button>
          </div>

          {selection.selectedCount > 0 ? (
            <BulkSelectionBar selectedCount={selection.selectedCount} totalCount={filtered.length} onClear={selection.clearSelection}>
              <Button size="sm" className="h-7 rounded-lg bg-emerald-600 text-xs text-white" onClick={() => {
                void Promise.all([...selection.selected].map((id) => quickAction(id, "complete")));
              }}>
                Complete selected
              </Button>
            </BulkSelectionBar>
          ) : null}

          <ResponsiveDataView
            desktop={
              <div className="overflow-x-auto rounded-2xl border border-[#e8dcc8]">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-[#faf3e3]">
                    <tr>
                      <th className={TABLE_DATA_TH}>
                        <input type="checkbox" checked={selection.allSelected} onChange={selection.toggleAll} />
                      </th>
                      <th className={TABLE_DATA_TH}>Title</th>
                      <th className={TABLE_DATA_TH}>Type</th>
                      <th className={TABLE_DATA_TH}>Related</th>
                      <th className={TABLE_DATA_TH}>Date</th>
                      <th className={TABLE_DATA_TH}>Time</th>
                      <th className={TABLE_DATA_TH}>Priority</th>
                      <th className={TABLE_DATA_TH}>Status</th>
                      <th className={TABLE_DATA_TH}>Recurrence</th>
                      <th className={TABLE_DATA_TH}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={10} className="px-4 py-8 text-center text-[#64748b]">Loading…</td></tr>
                    ) : paginatedItems.length === 0 ? (
                      <tr><td colSpan={10} className="px-4 py-8 text-center text-[#64748b]">No reminders found.</td></tr>
                    ) : (
                      paginatedItems.map((r) => (
                        <tr key={r.id} className={`border-t border-[#eef2f7] ${isOverdueReminder(r) ? "bg-rose-50/60" : ""}`}>
                          <td className={TABLE_DATA_TD}>
                            <input type="checkbox" checked={selection.isSelected(r.id)} onChange={() => selection.toggleOne(r.id)} />
                          </td>
                          <td className={`${TABLE_DATA_TD} font-medium`}>{r.title}</td>
                          <td className={TABLE_DATA_TD}>{r.reminder_type}</td>
                          <td className={TABLE_DATA_TD}>{r.related_record_label || "—"}</td>
                          <td className={TABLE_DATA_TD}>{r.reminder_date}</td>
                          <td className={TABLE_DATA_TD}>{r.is_all_day ? "All day" : (r.start_time || "—").slice(0, 5)}</td>
                          <td className={TABLE_DATA_TD}>{r.priority}</td>
                          <td className={TABLE_DATA_TD}>{r.status}</td>
                          <td className={TABLE_DATA_TD}>{r.recurrence_rule}</td>
                          <td className={TABLE_DATA_TD}>
                            <div className="flex flex-wrap gap-1">
                              <Button size="sm" variant="outline" className="h-7 rounded-full text-[11px]" onClick={() => setViewRow(r)}>View</Button>
                              <Button size="sm" variant="outline" className="h-7 rounded-full text-[11px]" onClick={() => openEdit(r)}>Edit</Button>
                              <Button size="sm" variant="outline" className="h-7 rounded-full text-[11px]" onClick={() => void quickAction(r.id, "complete")}>Complete</Button>
                              <Button size="sm" variant="outline" className="h-7 rounded-full text-[11px]" onClick={() => void quickAction(r.id, "snooze", { snooze_minutes: 10 })}>Snooze</Button>
                              <Button size="sm" variant="outline" className="h-7 rounded-full text-[11px] text-rose-700" onClick={() => void remove(r.id)}>Delete</Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            }
            mobile={
              loading ? (
                <p className="rounded-2xl border border-[#e8dcc8] px-4 py-8 text-center text-sm text-[#64748b]">Loading…</p>
              ) : paginatedItems.length === 0 ? (
                <p className="rounded-2xl border border-[#e8dcc8] px-4 py-8 text-center text-sm text-[#64748b]">No reminders found.</p>
              ) : (
                paginatedItems.map((r) => (
                  <MobileRecordCard
                    key={r.id}
                    title={r.title}
                    subtitle={`${r.reminder_type} · ${r.reminder_date}${r.is_all_day ? "" : ` ${ (r.start_time || "").slice(0, 5)}`}`}
                    showSelect
                    selected={selection.isSelected(r.id)}
                    onToggleSelect={() => selection.toggleOne(r.id)}
                    selectAriaLabel={`Select ${r.title}`}
                    previewFields={[
                      { label: "Priority", value: r.priority },
                      { label: "Status", value: r.status },
                      { label: "Related", value: r.related_record_label || "—" },
                    ]}
                    detailFields={[
                      { label: "Type", value: r.reminder_type },
                      { label: "Date", value: r.reminder_date },
                      { label: "Time", value: r.is_all_day ? "All day" : (r.start_time || "—").slice(0, 5) },
                      { label: "Priority", value: r.priority },
                      { label: "Status", value: r.status },
                      { label: "Related", value: r.related_record_label || "—" },
                      { label: "Notes", value: r.description || "—", clamp: true },
                    ]}
                    primaryActions={[
                      { label: "View", onClick: () => setViewRow(r) },
                      { label: "Complete", onClick: () => void quickAction(r.id, "complete") },
                      { label: "Snooze", onClick: () => void quickAction(r.id, "snooze", { snooze_minutes: 10 }) },
                    ]}
                    moreActions={[
                      { label: "Edit", onClick: () => openEdit(r) },
                      { label: "Delete", onClick: () => void remove(r.id) },
                    ]}
                  />
                ))
              )
            }
          />

          <TablePagination
            page={page}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </>
      ) : null}

      {mobileFiltersOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/40 md:hidden">
          <div className="rounded-t-3xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold text-[#0f172a]">Filters</p>
              <button type="button" onClick={() => setMobileFiltersOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-2">
              <select className="h-11 w-full rounded-xl border border-[#e8dcc8] px-3" value={fltType} onChange={(e) => setFltType(e.target.value)}>
                <option value="">All types</option>
                {REMINDER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className="h-11 w-full rounded-xl border border-[#e8dcc8] px-3" value={fltPriority} onChange={(e) => setFltPriority(e.target.value)}>
                <option value="">All priorities</option>
                {REMINDER_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select className="h-11 w-full rounded-xl border border-[#e8dcc8] px-3" value={fltStatus} onChange={(e) => setFltStatus(e.target.value)}>
                <option value="">All statuses</option>
                {REMINDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <Button className="h-11 w-full rounded-xl bg-[#c9a227] text-white" onClick={() => setMobileFiltersOpen(false)}>Apply</Button>
            </div>
          </div>
        </div>
      ) : null}

      {panelOpen ? (
        <FormDrawer
          title={editId ? "Edit reminder" : "Create reminder"}
          form={form}
          setForm={setForm}
          employees={employees}
          relatedItems={relatedItems}
          relatedQ={relatedQ}
          setRelatedQ={setRelatedQ}
          onSearchRelated={() => void searchRelated()}
          submitting={submitting}
          onClose={() => setPanelOpen(false)}
          onSubmit={() => void save()}
        />
      ) : null}

      {viewRow ? (
        <ViewDrawer
          row={viewRow}
          role={role}
          onClose={() => setViewRow(null)}
          onEdit={() => { setViewRow(null); openEdit(viewRow); }}
          onComplete={() => void quickAction(viewRow.id, "complete")}
          onSnooze={(m) => void quickAction(viewRow.id, "snooze", { snooze_minutes: m })}
          onReschedule={(date, time, reason) =>
            void quickAction(viewRow.id, "reschedule", { reschedule_date: date, reschedule_time: time, reschedule_reason: reason })
          }
        />
      ) : null}
    </section>
  );
}

function Bucket({
  title,
  tone,
  items,
  onView,
  onComplete,
  onSnooze,
}: {
  title: string;
  tone: "rose" | "amber" | "blue" | "emerald";
  items: ReminderRow[];
  onView: (r: ReminderRow) => void;
  onComplete: (id: string) => void;
  onSnooze: (id: string) => void;
}) {
  const bg =
    tone === "rose"
      ? "border-rose-200 bg-rose-50"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50"
        : tone === "blue"
          ? "border-blue-200 bg-blue-50"
          : "border-emerald-200 bg-emerald-50";
  return (
    <div className={`rounded-2xl border p-3 ${bg}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">
        {title} ({items.length})
      </p>
      <ul className="mt-2 space-y-2">
        {items.length === 0 ? <li className="text-sm text-[#94a3b8]">None</li> : null}
        {items.map((r) => (
          <li key={r.id} className="rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-sm">
            <button type="button" className="font-medium text-[#0f172a] hover:underline" onClick={() => onView(r)}>
              {r.title}
            </button>
            <p className="text-xs text-[#64748b]">
              {r.reminder_type} · {r.is_all_day ? "All day" : (r.start_time || "").slice(0, 5)} · {r.priority}
            </p>
            {r.status !== "Completed" ? (
              <div className="mt-1 flex gap-2">
                <button type="button" className="text-xs font-semibold text-emerald-700" onClick={() => onComplete(r.id)}>Complete</button>
                <button type="button" className="text-xs font-semibold text-[#a68b2e]" onClick={() => onSnooze(r.id)}>Snooze</button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CalendarMonth({
  month,
  rows,
  onSelect,
}: {
  month: string;
  rows: ReminderRow[];
  onSelect: (r: ReminderRow) => void;
}) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1, 6, 30));
  const daysInMonth = new Date(Date.UTC(y, m, 0, 6, 30)).getUTCDate();
  const startPad = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array(startPad).fill(null)];
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(`${month}-${String(d).padStart(2, "0")}`);
  }
  const byDate: Record<string, ReminderRow[]> = {};
  for (const r of rows) {
    if (!byDate[r.reminder_date]) byDate[r.reminder_date] = [];
    byDate[r.reminder_date].push(r);
  }
  return (
    <div className="grid grid-cols-7 gap-1 text-xs">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
        <div key={d} className="px-1 py-2 text-center font-semibold text-[#64748b]">{d}</div>
      ))}
      {cells.map((ymd, i) => (
        <div key={`${ymd ?? "x"}-${i}`} className="min-h-[4.5rem] rounded-lg border border-[#eef2f7] bg-[#fffdf8] p-1">
          {ymd ? <p className="text-[10px] font-semibold text-[#94a3b8]">{Number(ymd.slice(8))}</p> : null}
          {(byDate[ymd || ""] ?? []).slice(0, 3).map((r) => (
            <button
              key={r.id}
              type="button"
              className="mt-0.5 block w-full truncate rounded bg-[#faf3e3] px-1 py-0.5 text-left text-[10px] font-medium text-[#3d3428]"
              onClick={() => onSelect(r)}
            >
              {r.title}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function FormDrawer({
  title,
  form,
  setForm,
  employees,
  relatedItems,
  relatedQ,
  setRelatedQ,
  onSearchRelated,
  submitting,
  onClose,
  onSubmit,
}: {
  title: string;
  form: ReminderFormValue;
  setForm: (v: ReminderFormValue) => void;
  employees: ProfileMini[];
  relatedItems: { id: string; label: string }[];
  relatedQ: string;
  setRelatedQ: (v: string) => void;
  onSearchRelated: () => void;
  submitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const patch = (p: Partial<ReminderFormValue>) => setForm({ ...form, ...p });
  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-slate-900/40" aria-label="Close" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#e8edf5] px-4 py-4">
          <h3 className="text-lg font-semibold text-[#0f172a]">{title}</h3>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 px-4 py-4 text-sm">
          <label className="grid gap-1">
            <span className="font-medium">Title *</span>
            <Input value={form.title} onChange={(e) => patch({ title: e.target.value })} className="border-[#e8dcc8]" />
          </label>
          <label className="grid gap-1">
            <span className="font-medium">Type *</span>
            <select className="h-10 rounded-xl border border-[#e8dcc8] px-3" value={form.reminder_type} onChange={(e) => patch({ reminder_type: e.target.value as ReminderFormValue["reminder_type"] })}>
              <option value="">Select</option>
              {REMINDER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="font-medium">Notes</span>
            <textarea className="min-h-[72px] rounded-xl border border-[#e8dcc8] px-3 py-2" value={form.description} onChange={(e) => patch({ description: e.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1">
              <span className="font-medium">Date *</span>
              <Input type="date" value={form.reminder_date} onChange={(e) => patch({ reminder_date: e.target.value })} className="border-[#e8dcc8]" />
            </label>
            <label className="inline-flex items-center gap-2 pt-6 text-sm">
              <input type="checkbox" checked={form.is_all_day} onChange={(e) => patch({ is_all_day: e.target.checked })} />
              All day
            </label>
          </div>
          {!form.is_all_day ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1">
                <span className="font-medium">Start *</span>
                <Input type="time" value={form.start_time} onChange={(e) => patch({ start_time: e.target.value })} className="border-[#e8dcc8]" />
              </label>
              <label className="grid gap-1">
                <span className="font-medium">End</span>
                <Input type="time" value={form.end_time} onChange={(e) => patch({ end_time: e.target.value })} className="border-[#e8dcc8]" />
              </label>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1">
              <span className="font-medium">Priority</span>
              <select className="h-10 rounded-xl border border-[#e8dcc8] px-3" value={form.priority} onChange={(e) => patch({ priority: e.target.value as ReminderFormValue["priority"] })}>
                {REMINDER_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="font-medium">Status</span>
              <select className="h-10 rounded-xl border border-[#e8dcc8] px-3" value={form.status} onChange={(e) => patch({ status: e.target.value as ReminderFormValue["status"] })}>
                {REMINDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <label className="grid gap-1">
            <span className="font-medium">Location</span>
            <Input value={form.location} onChange={(e) => patch({ location: e.target.value })} className="border-[#e8dcc8]" />
          </label>
          <label className="grid gap-1">
            <span className="font-medium">Meeting mode</span>
            <select className="h-10 rounded-xl border border-[#e8dcc8] px-3" value={form.meeting_mode} onChange={(e) => patch({ meeting_mode: e.target.value as ReminderFormValue["meeting_mode"] })}>
              <option value="">None</option>
              {MEETING_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="font-medium">Meeting link</span>
            <Input value={form.meeting_link} onChange={(e) => patch({ meeting_link: e.target.value })} className="border-[#e8dcc8]" placeholder="https://" />
          </label>
          <label className="grid gap-1">
            <span className="font-medium">Related module</span>
            <select className="h-10 rounded-xl border border-[#e8dcc8] px-3" value={form.related_module} onChange={(e) => patch({ related_module: e.target.value as ReminderFormValue["related_module"], related_record_id: "", related_record_label: "" })}>
              <option value="">None</option>
              {RELATED_MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          {form.related_module && form.related_module !== "General" && form.related_module !== "Finance & Expenses" ? (
            <div className="space-y-2 rounded-xl border border-[#e8dcc8] bg-[#fffdf8] p-3">
              <p className="text-xs text-[#64748b]">Search existing records (read-only link — CRM rows are not updated).</p>
              <div className="flex gap-2">
                <Input value={relatedQ} onChange={(e) => setRelatedQ(e.target.value)} className="border-[#e8dcc8]" placeholder="Search…" />
                <Button type="button" variant="outline" className="border-[#e8dcc8]" onClick={onSearchRelated}>Search</Button>
              </div>
              {form.related_record_label ? (
                <p className="text-xs font-medium text-[#334155]">Selected: {form.related_record_label}</p>
              ) : null}
              <ul className="max-h-32 space-y-1 overflow-y-auto">
                {relatedItems.map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      className="w-full rounded-lg px-2 py-1 text-left text-xs hover:bg-[#faf3e3]"
                      onClick={() => patch({ related_record_id: it.id, related_record_label: it.label })}
                    >
                      {it.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <fieldset className="space-y-1">
            <legend className="font-medium">Assign to</legend>
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-[#e8dcc8] p-2">
              {employees.map((e) => {
                const checked = form.assignee_ids.includes(e.id);
                return (
                  <label key={e.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        patch({
                          assignee_ids: checked
                            ? form.assignee_ids.filter((id) => id !== e.id)
                            : [...form.assignee_ids, e.id],
                        })
                      }
                    />
                    {e.full_name || e.email || e.id.slice(0, 8)}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <label className="grid gap-1">
            <span className="font-medium">Repeat</span>
            <select className="h-10 rounded-xl border border-[#e8dcc8] px-3" value={form.recurrence_rule} onChange={(e) => patch({ recurrence_rule: e.target.value as ReminderFormValue["recurrence_rule"] })}>
              {RECURRENCE_RULES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          {form.recurrence_rule !== "none" ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1">
                <span className="font-medium">Interval</span>
                <Input type="number" min={1} value={form.recurrence_interval} onChange={(e) => patch({ recurrence_interval: Number(e.target.value) || 1 })} className="border-[#e8dcc8]" />
              </label>
              <label className="grid gap-1">
                <span className="font-medium">End date</span>
                <Input type="date" value={form.recurrence_end_date} onChange={(e) => patch({ recurrence_end_date: e.target.value })} className="border-[#e8dcc8]" />
              </label>
            </div>
          ) : null}
          <fieldset className="space-y-1">
            <legend className="font-medium">Notification timing</legend>
            {NOTIFY_OFFSET_PRESETS.map((p) => {
              const checked = form.notify_offsets_minutes.includes(p.minutes);
              return (
                <label key={p.minutes} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      patch({
                        notify_offsets_minutes: checked
                          ? form.notify_offsets_minutes.filter((m) => m !== p.minutes)
                          : [...form.notify_offsets_minutes, p.minutes],
                      })
                    }
                  />
                  {p.label}
                </label>
              );
            })}
          </fieldset>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.sound_enabled} onChange={(e) => patch({ sound_enabled: e.target.checked })} />
            Sound enabled
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.push_enabled} onChange={(e) => patch({ push_enabled: e.target.checked })} />
            Browser / push enabled
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_private} onChange={(e) => patch({ is_private: e.target.checked })} />
            Private (creator + assignees only)
          </label>
        </div>
        <div className="mt-auto flex gap-2 border-t border-[#e8edf5] p-4">
          <Button variant="outline" className="flex-1 rounded-xl border-[#e8dcc8]" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 rounded-xl bg-[#c9a227] text-white hover:bg-[#b8921f]" disabled={submitting} onClick={onSubmit}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </>
  );
}

function ViewDrawer({
  row,
  role,
  onClose,
  onEdit,
  onComplete,
  onSnooze,
  onReschedule,
}: {
  row: ReminderRow;
  role: "admin" | "employee";
  onClose: () => void;
  onEdit: () => void;
  onComplete: () => void;
  onSnooze: (m: number) => void;
  onReschedule: (date: string, time: string, reason: string) => void;
}) {
  const [date, setDate] = useState(row.reminder_date);
  const [time, setTime] = useState((row.start_time || "09:00").slice(0, 5));
  const [reason, setReason] = useState("");
  const href = relatedRecordHref(row.related_module, row.related_record_id, role);
  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-slate-900/40" aria-label="Close" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-[#0f172a]">{row.title}</h3>
            <p className="text-xs text-[#64748b]">{row.reminder_type} · {row.priority} · {row.status}</p>
          </div>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <p className="mt-3 text-sm text-[#334155]">{row.description || "No notes."}</p>
        <p className="mt-2 text-sm"><Clock className="mr-1 inline h-4 w-4" />{row.reminder_date} {row.is_all_day ? "(all day)" : (row.start_time || "").slice(0, 5)}</p>
        {row.related_record_label ? (
          <p className="mt-2 text-sm">
            Related: {row.related_module} — {row.related_record_label}{" "}
            {href ? (
              <a className="font-semibold text-[#2563eb] hover:underline" href={href}>
                View related record
              </a>
            ) : null}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" className="rounded-full bg-emerald-600 text-white" onClick={onComplete}><Check className="mr-1 h-3.5 w-3.5" /> Complete</Button>
          {[5, 10, 15, 30].map((m) => (
            <Button key={m} size="sm" variant="outline" className="rounded-full border-[#e8dcc8]" onClick={() => onSnooze(m)}>Snooze {m}m</Button>
          ))}
          <Button size="sm" variant="outline" className="rounded-full border-[#e8dcc8]" onClick={onEdit}>Edit</Button>
        </div>
        <div className="mt-5 space-y-2 rounded-xl border border-[#e8dcc8] bg-[#fffdf8] p-3">
          <p className="text-xs font-semibold uppercase text-[#94a3b8]">Reschedule</p>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border-[#e8dcc8]" />
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="border-[#e8dcc8]" />
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="border-[#e8dcc8]" />
          <Button className="w-full rounded-xl bg-[#c9a227] text-white" onClick={() => onReschedule(date, time, reason)}>Save new schedule</Button>
        </div>
      </div>
    </>
  );
}

function SettingsPanel({
  settings,
  onSave,
  onEnableBrowser,
  onEnablePush,
  onTestSound,
}: {
  settings: ReminderUserSettings | null;
  onSave: (s: ReminderUserSettings) => void;
  onEnableBrowser: () => void;
  onEnablePush: () => void;
  onTestSound: () => void;
}) {
  const [local, setLocal] = useState<ReminderUserSettings | null>(settings);
  useEffect(() => setLocal(settings), [settings]);
  if (!local) return <p className="text-sm text-[#64748b]">Loading settings…</p>;
  const patch = (p: Partial<ReminderUserSettings>) => setLocal({ ...local, ...p });
  return (
    <div className="max-w-xl space-y-3 rounded-2xl border border-[#e8dcc8] bg-[#fffdf8] p-4 text-sm">
      <p className="font-semibold text-[#0f172a]">Reminder notification settings</p>
      <p className="text-xs text-[#64748b]">Stored only in <code>aj_reminder_user_settings</code> — profiles table is unchanged.</p>
      <label className="flex items-center gap-2"><input type="checkbox" checked={local.sound_enabled} onChange={(e) => patch({ sound_enabled: e.target.checked })} /> Enable sound</label>
      <label className="grid gap-1">Volume
        <input type="range" min={0} max={100} value={local.sound_volume} onChange={(e) => patch({ sound_volume: Number(e.target.value) })} />
      </label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={local.popup_enabled} onChange={(e) => patch({ popup_enabled: e.target.checked })} /> In-app popup</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={local.browser_notification_enabled} onChange={(e) => patch({ browser_notification_enabled: e.target.checked })} /> Browser notifications</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={local.push_enabled} onChange={(e) => patch({ push_enabled: e.target.checked })} /> Push notifications</label>
      <label className="grid gap-1">Default snooze (minutes)
        <Input type="number" value={local.default_snooze_minutes} onChange={(e) => patch({ default_snooze_minutes: Number(e.target.value) || 10 })} className="border-[#e8dcc8]" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1">Quiet hours start
          <Input type="time" value={(local.quiet_hours_start || "").slice(0, 5)} onChange={(e) => patch({ quiet_hours_start: e.target.value || null })} className="border-[#e8dcc8]" />
        </label>
        <label className="grid gap-1">Quiet hours end
          <Input type="time" value={(local.quiet_hours_end || "").slice(0, 5)} onChange={(e) => patch({ quiet_hours_end: e.target.value || null })} className="border-[#e8dcc8]" />
        </label>
      </div>
      <div className="flex flex-wrap gap-2 pt-2">
        <Button className="rounded-full bg-[#c9a227] text-white" onClick={() => onSave(local)}>Save settings</Button>
        <Button variant="outline" className="rounded-full border-[#e8dcc8]" onClick={onTestSound}>Test sound (1 min)</Button>
        <Button variant="outline" className="rounded-full border-[#e8dcc8]" onClick={() => stopReminderRing()}>Stop sound</Button>
        <Button variant="outline" className="rounded-full border-[#e8dcc8]" onClick={onEnableBrowser}>Enable notifications</Button>
        <Button variant="outline" className="rounded-full border-[#e8dcc8]" onClick={onEnablePush}>Enable push</Button>
      </div>
      <p className="text-[11px] text-[#94a3b8]">
        When the app is closed, only OS/browser push sound applies — custom chime is for foreground use.
      </p>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}
