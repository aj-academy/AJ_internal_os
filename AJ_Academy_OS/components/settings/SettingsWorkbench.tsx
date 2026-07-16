"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HrOrgSettingsPanel } from "@/components/settings/HrOrgSettingsPanel";
import {
  mergeSettings,
  mergeSystemPreferences,
  normalizeTimeInputValue,
  PREFERENCE_DASHBOARD_VIEW_OPTIONS,
  PREFERENCE_DATE_FORMAT_OPTIONS,
  PREFERENCE_THEME_OPTIONS,
  PREFERENCE_TIME_FORMAT_OPTIONS,
  SETTINGS_DEFAULTS,
} from "@/components/settings/settingsDefaults";
import type { SystemSettingRow } from "@/types/settings";
import { setDisplayPreferences } from "@/lib/datetime";
import Link from "next/link";

export type SettingsTabId =
  | "company"
  | "users"
  | "hr_org"
  | "attendance"
  | "crm"
  | "college_visits"
  | "project"
  | "finance"
  | "notifications"
  | "security"
  | "preferences";

const SETTINGS_TAB_ORDER: SettingsTabId[] = [
  "company",
  "users",
  "hr_org",
  "attendance",
  "crm",
  "college_visits",
  "project",
  "finance",
  "notifications",
  "security",
  "preferences",
];

const SETTINGS_TAB_LABELS: Record<SettingsTabId, string> = {
  company: "Company Settings",
  users: "User & Role Settings",
  hr_org: "Departments & courses",
  attendance: "Attendance Settings",
  crm: "CRM Settings",
  college_visits: "College Visits",
  project: "Project Settings",
  finance: "Finance Settings",
  notifications: "Notification Settings",
  security: "Security Settings",
  preferences: "System Preferences",
};

function isMissingSettingsTable(msg: string) {
  const m = msg.toLowerCase();
  return m.includes("system_settings") && (m.includes("does not exist") || m.includes("could not find"));
}

export function SettingsWorkbench() {
  const supabase = useMemo(() => createClient(), []);
  const [activeTab, setActiveTab] = useState<SettingsTabId>("company");
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [settings, setSettings] = useState<Record<string, Record<string, unknown>>>({});
  const [toast, setToast] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const showToast = (type: "ok" | "err", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const loadSettings = useCallback(async () => {
    setLoading(true);
    const base: Record<string, Record<string, unknown>> = {};
    Object.keys(SETTINGS_DEFAULTS).forEach((k) => {
      base[k] = mergeSettings(k, {});
    });

    const { data, error } = await supabase.from("system_settings").select("*").returns<SystemSettingRow[]>();
    if (error) {
      if (isMissingSettingsTable(error.message)) {
        setSchemaMissing(true);
        setSettings(base);
        setLoading(false);
        return;
      }
      showToast("err", error.message);
      setLoading(false);
      return;
    }
    setSchemaMissing(false);
    const map = { ...base };
    (data ?? []).forEach((row) => {
      map[row.setting_key] = mergeSettings(row.setting_key, row.setting_value);
    });
    setSettings(map);
    setLoading(false);
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
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    const ch = supabase
      .channel("settings-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "system_settings" }, () => void loadSettings())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [loadSettings, supabase]);

  const patch = (key: string, partial: Record<string, unknown>) => {
    setSettings((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || mergeSettings(key, {})), ...partial },
    }));
  };

  const saveKey = async (key: string) => {
    if (!userId || schemaMissing) return;
    setSaving(true);
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        setting_key: key,
        setting_value: settings[key] || {},
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      showToast("err", payload.error ?? "Could not save settings.");
      return;
    }
    showToast("ok", "Settings saved.");
    if (key === "preferences") {
      const prefs = mergeSystemPreferences(settings.preferences || {});
      setDisplayPreferences({ dateFormat: prefs.dateFormat, timeFormat: prefs.timeFormat });
      const root = document.documentElement;
      if (prefs.theme === "dark") {
        root.classList.add("dark");
        root.setAttribute("data-theme", "dark");
      } else {
        root.classList.remove("dark");
        root.setAttribute("data-theme", "light");
      }
    }
    await loadSettings();
  };

  const c = settings.company || mergeSettings("company", {});
  const a = settings.attendance || mergeSettings("attendance", {});
  const crm = settings.crm || mergeSettings("crm", {});
  const cv = settings.college_visits || mergeSettings("college_visits", {});
  const proj = settings.project || mergeSettings("project", {});
  const fin = settings.finance || mergeSettings("finance", {});
  const notif = settings.notifications || mergeSettings("notifications", {});
  const sec = settings.security || mergeSettings("security", {});
  const pref = settings.preferences || mergeSettings("preferences", {});

  return (
    <section className="space-y-5 rounded-[24px] border border-[#e8dcc8] bg-white p-4 sm:p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
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

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold text-[#0f172a]">System Settings</h2>
          <p className="mt-1 text-xs text-[#64748b] sm:text-sm">Configure company operations, workflows and platform preferences.</p>
        </div>
        <Button variant="outline" className="h-9 rounded-full border-[#e8dcc8]" disabled={loading || schemaMissing} onClick={() => void loadSettings()}>
          Reload
        </Button>
      </header>

      {schemaMissing ? (
        <div className="rounded-xl border border-blue-200 bg-[#faf3e3] px-4 py-3 text-sm text-blue-900">
          Run <strong>AJ_Academy_SB/system_settings_schema.sql</strong> in Supabase, then refresh.
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-2">
        <div className="flex min-w-max gap-2">
          {SETTINGS_TAB_ORDER.map((tid) => (
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
              {SETTINGS_TAB_LABELS[tid]}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "company" ? (
        <SettingsPanel title="Company" onSave={() => void saveKey("company")} saving={saving} disabled={schemaMissing}>
          <p className="rounded-xl border border-[#e8dcc8] bg-[#fffdf8] px-3 py-2 text-xs text-[#64748b]">
            Optional company profile for AJ Academy (name, GST, address, logo). The app already works with defaults
            (Timezone Asia/Kolkata, Currency INR). Fill these when you want branding or invoice details — empty fields are fine.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledInput label="Company name" value={String(c.companyName ?? "")} onChange={(v) => patch("company", { companyName: v })} />
            <LabeledInput label="Company email" value={String(c.companyEmail ?? "")} onChange={(v) => patch("company", { companyEmail: v })} />
            <LabeledInput label="Phone" value={String(c.phoneNumber ?? "")} onChange={(v) => patch("company", { phoneNumber: v })} />
            <LabeledInput label="GST number" value={String(c.gstNumber ?? "")} onChange={(v) => patch("company", { gstNumber: v })} />
            <LabeledInput label="Website" value={String(c.website ?? "")} onChange={(v) => patch("company", { website: v })} />
            <LabeledInput label="Timezone" value={String(c.timezone ?? "")} onChange={(v) => patch("company", { timezone: v })} />
            <LabeledInput label="Currency" value={String(c.currency ?? "")} onChange={(v) => patch("company", { currency: v })} />
            <LabeledInput label="Logo URL" value={String(c.logoUrl ?? "")} onChange={(v) => patch("company", { logoUrl: v })} />
            <div className="sm:col-span-2">
              <LabeledInput label="Address" value={String(c.address ?? "")} onChange={(v) => patch("company", { address: v })} />
            </div>
          </div>
        </SettingsPanel>
      ) : null}

      {activeTab === "hr_org" ? (
        <HrOrgSettingsPanel schemaMissing={schemaMissing} onToast={showToast} />
      ) : null}

      {activeTab === "users" ? (
        <SettingsPanel title="User & roles" onSave={() => showToast("ok", "Role definitions are fixed in profiles.role; permission matrix coming soon.")} saving={false} disabled={schemaMissing}>
          <p className="text-sm text-[#64748b]">Roles stored on <code className="rounded bg-[#f1f5f9] px-1">profiles.role</code>: super_admin, admin, manager, employee, accounts.</p>
          <table className="mt-4 w-full text-sm">
            <thead className="border-b border-[#e2e8f0] text-left text-xs uppercase text-[#64748b]">
              <tr>
                <th className="py-2">Role</th>
                <th className="py-2">Typical access</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["super_admin", "Full platform"],
                ["admin", "Operations, CRM, projects, finance, settings"],
                ["manager", "Team, projects, tasks (read), finance (project)"],
                ["employee", "Self attendance, tasks, expense claims"],
                ["accounts", "Finance & project budgets"],
              ].map(([r, d]) => (
                <tr key={r} className="border-b border-[#f1f5f9]">
                  <td className="py-2 font-medium">{r}</td>
                  <td className="py-2 text-[#475569]">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-xs text-[#94a3b8]">Fine-grained permission matrix (view/create/edit/delete) can be added later with a dedicated table.</p>
        </SettingsPanel>
      ) : null}

      {activeTab === "attendance" ? (
        <SettingsPanel title="Attendance" onSave={() => void saveKey("attendance")} saving={saving} disabled={schemaMissing}>
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledTimeInput
              label="Office start"
              value={normalizeTimeInputValue(a.officeStartTime)}
              onChange={(v) => patch("attendance", { officeStartTime: v })}
            />
            <LabeledTimeInput
              label="Office end"
              value={normalizeTimeInputValue(a.officeEndTime)}
              onChange={(v) => patch("attendance", { officeEndTime: v })}
            />
            <LabeledInput label="Grace (minutes)" value={String(a.graceMinutes ?? "")} onChange={(v) => patch("attendance", { graceMinutes: Number(v) || 0 })} />
            <LabeledInput label="Working days" value={String(a.workingDays ?? "")} onChange={(v) => patch("attendance", { workingDays: v })} />
            <LabeledInput label="Overtime rules" value={String(a.overtimeRules ?? "")} onChange={(v) => patch("attendance", { overtimeRules: v })} />
            <label className="flex items-center gap-2 text-sm text-[#334155]">
              <input type="checkbox" checked={Boolean(a.autoLateMark)} onChange={(e) => patch("attendance", { autoLateMark: e.target.checked })} />
              Auto late mark
            </label>
            <label className="flex items-center gap-2 text-sm text-[#334155]">
              <input type="checkbox" checked={Boolean(a.locationTracking)} onChange={(e) => patch("attendance", { locationTracking: e.target.checked })} />
              Location tracking
            </label>
          </div>
        </SettingsPanel>
      ) : null}

      {activeTab === "crm" ? (
        <SettingsPanel title="CRM" onSave={() => void saveKey("crm")} saving={saving} disabled={schemaMissing}>
          <p className="text-xs text-[#64748b]">One entry per line for lists.</p>
          <LabeledTextarea
            label="Lead sources"
            value={(crm.leadSources as string[])?.join("\n") || ""}
            onChange={(v) => patch("crm", { leadSources: v.split("\n").map((s) => s.trim()).filter(Boolean) })}
          />
          <LabeledTextarea
            label="Lead statuses"
            value={(crm.leadStatuses as string[])?.join("\n") || ""}
            onChange={(v) => patch("crm", { leadStatuses: v.split("\n").map((s) => s.trim()).filter(Boolean) })}
          />
          <LabeledTextarea
            label="Follow-up types"
            value={(crm.followUpTypes as string[])?.join("\n") || ""}
            onChange={(v) => patch("crm", { followUpTypes: v.split("\n").map((s) => s.trim()).filter(Boolean) })}
          />
          <LabeledTextarea
            label="Programs / service interests"
            value={
              ((crm.interestedPrograms as string[])?.length
                ? (crm.interestedPrograms as string[])
                : (crm.serviceCategories as string[]))?.join("\n") || ""
            }
            onChange={(v) => {
              const list = v.split("\n").map((s) => s.trim()).filter(Boolean);
              patch("crm", { serviceCategories: list, interestedPrograms: list });
            }}
          />
          <LabeledTextarea
            label="Priority types"
            value={(crm.priorityTypes as string[])?.join("\n") || ""}
            onChange={(v) => patch("crm", { priorityTypes: v.split("\n").map((s) => s.trim()).filter(Boolean) })}
          />
        </SettingsPanel>
      ) : null}

      {activeTab === "college_visits" ? (
        <SettingsPanel title="College Visits" onSave={() => void saveKey("college_visits")} saving={saving} disabled={schemaMissing}>
          <p className="text-xs text-[#64748b]">One entry per line. Same lists as College Visits → Settings.</p>
          <LabeledTextarea
            label="Visit statuses"
            value={(cv.visitStatuses as string[])?.join("\n") || ""}
            onChange={(v) => patch("college_visits", { visitStatuses: v.split("\n").map((s) => s.trim()).filter(Boolean) })}
          />
          <LabeledTextarea
            label="MOU statuses"
            value={(cv.mouStatuses as string[])?.join("\n") || ""}
            onChange={(v) => patch("college_visits", { mouStatuses: v.split("\n").map((s) => s.trim()).filter(Boolean) })}
          />
          <LabeledTextarea
            label="Proposal statuses"
            value={(cv.proposalStatuses as string[])?.join("\n") || ""}
            onChange={(v) => patch("college_visits", { proposalStatuses: v.split("\n").map((s) => s.trim()).filter(Boolean) })}
          />
          <LabeledTextarea
            label="Final statuses"
            value={(cv.finalStatuses as string[])?.join("\n") || ""}
            onChange={(v) => patch("college_visits", { finalStatuses: v.split("\n").map((s) => s.trim()).filter(Boolean) })}
          />
        </SettingsPanel>
      ) : null}

      {activeTab === "project" ? (
        <SettingsPanel title="Project defaults" onSave={() => void saveKey("project")} saving={saving} disabled={schemaMissing}>
          <p className="text-xs text-[#64748b]">One entry per line for lists. Same store as Project Master → Settings.</p>
          <LabeledTextarea
            label="Project types"
            value={(proj.projectTypes as string[])?.join("\n") || ""}
            onChange={(v) => patch("project", { projectTypes: v.split("\n").map((s) => s.trim()).filter(Boolean) })}
          />
          <LabeledTextarea
            label="Statuses (one per line)"
            value={(proj.statuses as string[])?.join("\n") || ""}
            onChange={(v) => patch("project", { statuses: v.split("\n").map((s) => s.trim()).filter(Boolean) })}
          />
          <LabeledTextarea
            label="Priorities"
            value={(proj.priorities as string[])?.join("\n") || ""}
            onChange={(v) => patch("project", { priorities: v.split("\n").map((s) => s.trim()).filter(Boolean) })}
          />
          <LabeledInput
            label="Default deadline (days)"
            value={String(proj.defaultDeadlineDays ?? "")}
            onChange={(v) => patch("project", { defaultDeadlineDays: Number(v) || 0 })}
          />
          <label className="mt-2 flex items-center gap-2 text-sm text-[#334155]">
            <input type="checkbox" checked={Boolean(proj.autoProgressFromTasks)} onChange={(e) => patch("project", { autoProgressFromTasks: e.target.checked })} />
            Auto progress from tasks (informational; DB trigger already syncs)
          </label>
        </SettingsPanel>
      ) : null}

      {activeTab === "finance" ? (
        <SettingsPanel title="Finance" onSave={() => void saveKey("finance")} saving={saving} disabled={schemaMissing}>
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledInput label="Currency" value={String(fin.currency ?? "")} onChange={(v) => patch("finance", { currency: v })} />
            <LabeledInput label="Tax %" value={String(fin.taxPercent ?? "")} onChange={(v) => patch("finance", { taxPercent: Number(v) || 0 })} />
            <LabeledInput label="Invoice prefix" value={String(fin.invoicePrefix ?? "")} onChange={(v) => patch("finance", { invoicePrefix: v })} />
          </div>
          <p className="rounded-xl border border-[#e8dcc8] bg-[#fffdf8] px-3 py-2 text-xs text-[#64748b]">
            Expense categories are managed in{" "}
            <Link href="/admin/finance" className="font-semibold text-[#a68b2e] hover:underline">
              Finance &amp; Expenses
            </Link>{" "}
            (finance_categories table), not in this settings screen.
          </p>
          <LabeledTextarea
            label="Payment methods (one per line)"
            value={(fin.paymentMethods as string[])?.join("\n") || ""}
            onChange={(v) => patch("finance", { paymentMethods: v.split("\n").map((s) => s.trim()).filter(Boolean) })}
          />
        </SettingsPanel>
      ) : null}

      {activeTab === "notifications" ? (
        <SettingsPanel title="Notifications" onSave={() => void saveKey("notifications")} saving={saving} disabled={schemaMissing}>
          {(["emailNotifications", "attendanceAlerts", "taskAlerts", "paymentReminders", "followUpReminders"] as const).map((k) => (
            <label key={k} className="mt-2 flex items-center gap-2 text-sm capitalize text-[#334155]">
              <input type="checkbox" checked={Boolean(notif[k])} onChange={(e) => patch("notifications", { [k]: e.target.checked })} />
              {k.replace(/([A-Z])/g, " $1").trim()}
            </label>
          ))}
        </SettingsPanel>
      ) : null}

      {activeTab === "security" ? (
        <SettingsPanel title="Security" onSave={() => void saveKey("security")} saving={saving} disabled={schemaMissing}>
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledInput label="Min password length" value={String(sec.minPasswordLength ?? "")} onChange={(v) => patch("security", { minPasswordLength: Number(v) || 0 })} />
            <LabeledInput label="Session timeout (minutes)" value={String(sec.sessionTimeoutMinutes ?? "")} onChange={(v) => patch("security", { sessionTimeoutMinutes: Number(v) || 0 })} />
            <LabeledInput label="Login attempt limit" value={String(sec.loginAttemptLimit ?? "")} onChange={(v) => patch("security", { loginAttemptLimit: Number(v) || 0 })} />
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-[#334155]">
            <input type="checkbox" checked={Boolean(sec.twoFactorPlaceholder)} onChange={(e) => patch("security", { twoFactorPlaceholder: e.target.checked })} />
            Two-factor auth (placeholder)
          </label>
        </SettingsPanel>
      ) : null}

      {activeTab === "preferences" ? (
        <SettingsPanel title="Preferences" onSave={() => void saveKey("preferences")} saving={saving} disabled={schemaMissing}>
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledSelect
              label="Theme"
              value={String(pref.theme ?? "light")}
              options={PREFERENCE_THEME_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(v) => patch("preferences", { theme: v })}
            />
            <LabeledSelect
              label="Date format"
              value={String(pref.dateFormat ?? "DD/MM/YYYY")}
              options={PREFERENCE_DATE_FORMAT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(v) => patch("preferences", { dateFormat: v })}
            />
            <LabeledSelect
              label="Time format"
              value={String(pref.timeFormat ?? "12h")}
              options={PREFERENCE_TIME_FORMAT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(v) => patch("preferences", { timeFormat: v })}
            />
            <LabeledSelect
              label="Dashboard default view"
              value={String(pref.dashboardDefaultView ?? "overview")}
              options={PREFERENCE_DASHBOARD_VIEW_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(v) => patch("preferences", { dashboardDefaultView: v })}
            />
            <label className="flex items-center gap-2 text-sm text-[#334155] sm:col-span-2">
              <input type="checkbox" checked={Boolean(pref.sidebarCollapsed)} onChange={(e) => patch("preferences", { sidebarCollapsed: e.target.checked })} />
              Sidebar collapsed by default
            </label>
          </div>
          <p className="mt-4 text-xs text-[#94a3b8]">
            These apply across admin and employee dashboards after save (theme, sidebar, date/time display, and default landing module).
          </p>
        </SettingsPanel>
      ) : null}

      {loading ? <p className="text-sm text-[#64748b]">Loading settings…</p> : null}
    </section>
  );
}

function SettingsPanel({
  title,
  children,
  onSave,
  saving,
  disabled,
}: {
  title: string;
  children: ReactNode;
  onSave: () => void;
  saving: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-[20px] border border-[#dbe6f3] bg-[#f8fbff] p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-[#0f172a]">{title}</h3>
        <Button className="h-9 rounded-full bg-[#c9a227] px-4 text-white" disabled={disabled || saving} onClick={onSave}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-semibold uppercase text-[#64748b]">{label}</span>
      <Input className="mt-1 h-9 border-[#e8dcc8]" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function LabeledTimeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-semibold uppercase text-[#64748b]">{label}</span>
      <Input
        type="time"
        className="mt-1 h-9 border-[#e8dcc8]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function LabeledSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-semibold uppercase text-[#64748b]">{label}</span>
      <select
        className="mt-1 h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#c9a227]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function LabeledTextarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-semibold uppercase text-[#64748b]">{label}</span>
      <textarea
        className="mt-1 min-h-[100px] w-full rounded-lg border border-[#e8dcc8] bg-white px-3 py-2 text-sm text-[#334155] outline-none focus:border-[#c9a227]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
