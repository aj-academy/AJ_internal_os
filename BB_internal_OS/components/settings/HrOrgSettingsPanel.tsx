"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HR_ORG_SETTING_KEY, type HrOrgSettings } from "@/lib/hrOrg";
import { useHrOrgSettings } from "@/hooks/useHrOrgSettings";

interface HrOrgSettingsPanelProps {
  userId: string;
  schemaMissing: boolean;
  onToast: (type: "ok" | "err", text: string) => void;
}

export function HrOrgSettingsPanel({ userId, schemaMissing, onToast }: HrOrgSettingsPanelProps) {
  const supabase = useMemo(() => createClient(), []);
  const { settings: loaded, loading, schemaMissing: hrSchemaMissing, reload } = useHrOrgSettings();
  const [draft, setDraft] = useState<HrOrgSettings>(loaded);
  const [selectedDept, setSelectedDept] = useState("");
  const [newDept, setNewDept] = useState("");
  const [newJobDomain, setNewJobDomain] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(loaded);
    if (!selectedDept && loaded.departments.length) {
      setSelectedDept(loaded.departments[0]);
    }
  }, [loaded, selectedDept]);

  const jobDomains = selectedDept ? draft.jobDomainsByDepartment[selectedDept] ?? [] : [];

  const persist = async (next: HrOrgSettings) => {
    if (!userId || schemaMissing || hrSchemaMissing) return;
    setSaving(true);
    const { error } = await supabase.from("system_settings").upsert(
      {
        setting_key: HR_ORG_SETTING_KEY,
        setting_value: next,
        updated_by: userId,
      },
      { onConflict: "setting_key" },
    );
    setSaving(false);
    if (error) {
      onToast("err", error.message);
      return;
    }
    setDraft(next);
    onToast("ok", "Departments and job domains saved.");
    await reload();
  };

  const addDepartment = () => {
    const name = newDept.trim();
    if (!name) return;
    if (draft.departments.some((d) => d.toLowerCase() === name.toLowerCase())) {
      onToast("err", "Department already exists.");
      return;
    }
    const next: HrOrgSettings = {
      departments: [...draft.departments, name],
      jobDomainsByDepartment: {
        ...draft.jobDomainsByDepartment,
        [name]: ["General"],
      },
    };
    setNewDept("");
    setSelectedDept(name);
    void persist(next);
  };

  const removeDepartment = (name: string) => {
    if (!confirm(`Remove department "${name}"? Job domains under it will be removed.`)) return;
    const { [name]: _removed, ...rest } = draft.jobDomainsByDepartment;
    const next: HrOrgSettings = {
      departments: draft.departments.filter((d) => d !== name),
      jobDomainsByDepartment: rest,
    };
    setSelectedDept(next.departments[0] ?? "");
    void persist(next);
  };

  const addJobDomain = () => {
    const label = newJobDomain.trim();
    if (!selectedDept || !label) return;
    const current = draft.jobDomainsByDepartment[selectedDept] ?? [];
    if (current.some((j) => j.toLowerCase() === label.toLowerCase())) {
      onToast("err", "Job domain already exists for this department.");
      return;
    }
    const next: HrOrgSettings = {
      ...draft,
      jobDomainsByDepartment: {
        ...draft.jobDomainsByDepartment,
        [selectedDept]: [...current, label],
      },
    };
    setNewJobDomain("");
    void persist(next);
  };

  const removeJobDomain = (label: string) => {
    if (!selectedDept) return;
    const current = draft.jobDomainsByDepartment[selectedDept] ?? [];
    const next: HrOrgSettings = {
      ...draft,
      jobDomainsByDepartment: {
        ...draft.jobDomainsByDepartment,
        [selectedDept]: current.filter((j) => j !== label),
      },
    };
    void persist(next);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-[#64748b]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading departments…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-[#64748b]">
        Manage departments and job domains used in Employee Master. Changes apply immediately to add/edit employee forms.
      </p>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <section className="min-w-0 rounded-[20px] border border-[#dbe6f3] bg-[#f8fbff] p-4 sm:p-5">
          <h4 className="text-base font-semibold text-[#0f172a]">Departments</h4>
          <p className="mt-1 text-xs text-[#64748b]">Add or remove company departments.</p>
          <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row">
            <Input
              value={newDept}
              onChange={(e) => setNewDept(e.target.value)}
              placeholder="New department name"
              className="h-10 min-w-0 flex-1 border-[#d4deea] sm:h-9"
              disabled={saving || schemaMissing || hrSchemaMissing}
            />
            <Button
              type="button"
              className="h-10 shrink-0 rounded-full bg-[#2563eb] px-4 text-white sm:h-9"
              disabled={saving || schemaMissing || hrSchemaMissing}
              onClick={addDepartment}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
          <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
            {draft.departments.map((dept) => (
              <li
                key={dept}
                className={[
                  "flex min-w-0 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm",
                  selectedDept === dept ? "border-[#2563eb] bg-white" : "border-[#e8edf5] bg-white",
                ].join(" ")}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left font-medium text-[#0f172a]"
                  onClick={() => setSelectedDept(dept)}
                >
                  {dept}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${dept}`}
                  className="touch-target shrink-0 rounded-full p-1.5 text-rose-600 hover:bg-rose-50"
                  disabled={saving || draft.departments.length <= 1}
                  onClick={() => removeDepartment(dept)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="min-w-0 rounded-[20px] border border-[#dbe6f3] bg-[#f8fbff] p-4 sm:p-5">
          <h4 className="text-base font-semibold text-[#0f172a]">Job domains</h4>
          <p className="mt-1 text-xs text-[#64748b]">
            {selectedDept ? `Roles for ${selectedDept}` : "Select a department to manage job domains."}
          </p>
          {selectedDept ? (
            <>
              <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row">
                <Input
                  value={newJobDomain}
                  onChange={(e) => setNewJobDomain(e.target.value)}
                  placeholder="New job domain"
                  className="h-10 min-w-0 flex-1 border-[#d4deea] sm:h-9"
                  disabled={saving || schemaMissing || hrSchemaMissing}
                />
                <Button
                  type="button"
                  className="h-10 shrink-0 rounded-full bg-[#2563eb] px-4 text-white sm:h-9"
                  disabled={saving || schemaMissing || hrSchemaMissing}
                  onClick={addJobDomain}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add
                </Button>
              </div>
              <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
                {jobDomains.map((job) => (
                  <li
                    key={job}
                    className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-[#e8edf5] bg-white px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate font-medium text-[#0f172a]">{job}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${job}`}
                      className="touch-target shrink-0 rounded-full p-1.5 text-rose-600 hover:bg-rose-50"
                      disabled={saving || jobDomains.length <= 1}
                      onClick={() => removeJobDomain(job)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
                {!jobDomains.length ? (
                  <li className="text-sm text-[#64748b]">No job domains yet. Add one above.</li>
                ) : null}
              </ul>
            </>
          ) : (
            <p className="mt-4 text-sm text-[#64748b]">Add a department first.</p>
          )}
        </section>
      </div>
    </div>
  );
}


