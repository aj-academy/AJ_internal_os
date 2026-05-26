"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HR_ORG_SETTING_KEY, mergeHrOrgSettings, type HrOrgSettings } from "@/lib/hrOrg";
import { useHrOrgSettings } from "@/hooks/useHrOrgSettings";

interface HrOrgSettingsPanelProps {
  schemaMissing: boolean;
  onToast: (type: "ok" | "err", text: string) => void;
}

export function HrOrgSettingsPanel({ schemaMissing, onToast }: HrOrgSettingsPanelProps) {
  const { settings: loaded, loading, schemaMissing: hrSchemaMissing, applySettings } =
    useHrOrgSettings();
  const [draft, setDraft] = useState<HrOrgSettings>(loaded);
  const [newDept, setNewDept] = useState("");
  const [newCourse, setNewCourse] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(loaded);
  }, [loaded]);

  const persist = async (next: HrOrgSettings) => {
    if (schemaMissing || hrSchemaMissing) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setting_key: HR_ORG_SETTING_KEY,
          setting_value: next,
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        setting?: { setting_value?: unknown };
      };

      if (!res.ok) {
        onToast("err", payload.error ?? "Could not save departments.");
        return;
      }

      const saved = mergeHrOrgSettings(payload.setting?.setting_value ?? next);
      setDraft(saved);
      applySettings(saved);
      onToast("ok", "Departments saved.");
    } catch {
      onToast("err", "Could not save departments. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const addDepartment = () => {
    const name = newDept.trim();
    if (!name) return;
    if (draft.departments.some((d) => d.toLowerCase() === name.toLowerCase())) {
      onToast("err", "Department already exists.");
      return;
    }
    const next: HrOrgSettings = { ...draft, departments: [...draft.departments, name] };
    setNewDept("");
    void persist(next);
  };

  const removeDepartment = (name: string) => {
    if (!confirm(`Remove department "${name}"? Users already assigned keep this text on their profile.`)) return;
    const next: HrOrgSettings = {
      ...draft,
      departments: draft.departments.filter((d) => d !== name),
    };
    void persist(next);
  };

  const addCourse = () => {
    const name = newCourse.trim();
    if (!name) return;
    if (draft.courses.some((c) => c.toLowerCase() === name.toLowerCase())) {
      onToast("err", "Course already exists.");
      return;
    }
    const next: HrOrgSettings = { ...draft, courses: [...draft.courses, name] };
    setNewCourse("");
    void persist(next);
  };

  const removeCourse = (name: string) => {
    if (!confirm(`Remove course "${name}"?`)) return;
    const next: HrOrgSettings = { ...draft, courses: draft.courses.filter((c) => c !== name) };
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
        Manage teaching and operations departments (e.g. Digital Marketing). Used in User Master and to match mentors with students in the same department.
      </p>

      <section className="min-w-0 rounded-[20px] border border-[#dbe6f3] bg-[#f8fbff] p-4 sm:p-5">
        <h4 className="text-base font-semibold text-[#0f172a]">Departments</h4>
        <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row">
          <Input
            value={newDept}
            onChange={(e) => setNewDept(e.target.value)}
            placeholder="New department name"
            className="h-10 min-w-0 flex-1 border-[#e8dcc8] sm:h-9"
            disabled={saving || schemaMissing || hrSchemaMissing}
          />
          <Button
            type="button"
            className="h-10 shrink-0 rounded-full bg-[#c9a227] px-4 text-white sm:h-9"
            disabled={saving || schemaMissing || hrSchemaMissing}
            onClick={addDepartment}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </div>
        <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto">
          {draft.departments.map((dept) => (
            <li
              key={dept}
              className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-[#e8edf5] bg-white px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate font-medium text-[#0f172a]">{dept}</span>
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
        <h4 className="text-base font-semibold text-[#0f172a]">Courses</h4>
        <p className="mt-1 text-xs text-[#64748b]">Used in User Master for students (and other roles if needed).</p>
        <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row">
          <Input
            value={newCourse}
            onChange={(e) => setNewCourse(e.target.value)}
            placeholder="New course name"
            className="h-10 min-w-0 flex-1 border-[#e8dcc8] sm:h-9"
            disabled={saving || schemaMissing || hrSchemaMissing}
          />
          <Button
            type="button"
            className="h-10 shrink-0 rounded-full bg-[#c9a227] px-4 text-white sm:h-9"
            disabled={saving || schemaMissing || hrSchemaMissing}
            onClick={addCourse}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </div>
        <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto">
          {draft.courses.map((course) => (
            <li
              key={course}
              className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-[#e8edf5] bg-white px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate font-medium text-[#0f172a]">{course}</span>
              <button
                type="button"
                aria-label={`Remove ${course}`}
                className="touch-target shrink-0 rounded-full p-1.5 text-rose-600 hover:bg-rose-50"
                disabled={saving || draft.courses.length <= 1}
                onClick={() => removeCourse(course)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
