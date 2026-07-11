"use client";

import { useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";

export type AssigneeProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  role: string | null;
};

type AssigneeCategory = "student" | "freelancer" | "mentor" | "employee";

const CATEGORY_META: { id: AssigneeCategory; label: string }[] = [
  { id: "student", label: "Student" },
  { id: "freelancer", label: "Freelancer" },
  { id: "mentor", label: "Mentor" },
  { id: "employee", label: "Employee" },
];

function profileCategory(role: string | null | undefined): AssigneeCategory | null {
  const r = (role ?? "").toLowerCase();
  if (r === "student") return "student";
  if (r === "freelancer") return "freelancer";
  if (r === "mentor") return "mentor";
  if (["employee", "admin", "super_admin", "manager"].includes(r)) return "employee";
  return null;
}

function displayName(p: AssigneeProfile) {
  return p.full_name?.trim() || p.email?.trim() || "Unnamed";
}

type TaskAssigneePickerProps = {
  profiles: AssigneeProfile[];
  value: string;
  disabled?: boolean;
  onChange: (profileId: string) => void;
};

export function TaskAssigneePicker({ profiles, value, disabled = false, onChange }: TaskAssigneePickerProps) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<AssigneeCategory | null>(null);
  const [department, setDepartment] = useState<string>("");

  const selected = profiles.find((p) => p.id === value) ?? null;

  const byCategory = useMemo(() => {
    const map: Record<AssigneeCategory, AssigneeProfile[]> = {
      student: [],
      freelancer: [],
      mentor: [],
      employee: [],
    };
    profiles.forEach((p) => {
      const cat = profileCategory(p.role);
      if (cat) map[cat].push(p);
    });
    Object.values(map).forEach((list) =>
      list.sort((a, b) => displayName(a).localeCompare(displayName(b)),
    ),
    );
    return map;
  }, [profiles]);

  const departmentsForCategory = useMemo(() => {
    if (!category || category === "employee") return [];
    const depts = new Set<string>();
    byCategory[category].forEach((p) => {
      const d = p.department?.trim();
      if (d) depts.add(d);
    });
    return [...depts].sort((a, b) => a.localeCompare(b));
  }, [byCategory, category]);

  const peopleList = useMemo(() => {
    if (!category) return [];
    const list = byCategory[category];
    if (category === "employee") return list;
    if (!department) return list;
    return list.filter((p) => (p.department ?? "").trim() === department);
  }, [byCategory, category, department]);

  const pickPerson = (id: string) => {
    onChange(id);
    setOpen(false);
    setCategory(null);
    setDepartment("");
  };

  const selectedLabel = selected
    ? `${displayName(selected)}${selected.department ? ` — ${selected.department}` : ""}`
    : "";

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-[#e8dcc8] bg-white px-3 text-left text-sm text-[#334155] outline-none focus:border-[#c9a227] disabled:opacity-50"
      >
        <span className={selectedLabel ? "font-medium text-[#0f172a]" : "text-[#94a3b8]"}>
          {selectedLabel || "Select category → department → person"}
        </span>
        <span className="text-xs text-[#64748b]">{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-[min(420px,55vh)] overflow-hidden rounded-xl border border-[#dbe6f3] bg-white shadow-xl">
          {!category ? (
            <div className="grid grid-cols-2 gap-2 p-3">
              {CATEGORY_META.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setCategory(c.id);
                    setDepartment("");
                  }}
                  className="rounded-lg border border-[#e8dcc8] bg-[#fffdf8] px-3 py-3 text-left text-sm font-medium text-[#0f172a] hover:border-[#c9a227] hover:bg-[#fef3c7]"
                >
                  {c.label}
                  <p className="mt-0.5 text-xs font-normal text-[#64748b]">{byCategory[c.id].length} user(s)</p>
                </button>
              ))}
            </div>
          ) : category === "employee" ? (
            <div className="flex max-h-[min(400px,52vh)] flex-col">
              <PickerHeader
                title="All employees"
                onBack={() => setCategory(null)}
              />
              <ul className="min-h-0 flex-1 overflow-y-auto divide-y divide-[#e8edf5]">
                {peopleList.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => pickPerson(p.id)}
                      className="flex w-full flex-col px-3 py-2.5 text-left hover:bg-[#f8fbff]"
                    >
                      <span className="text-sm font-medium text-[#0f172a]">{displayName(p)}</span>
                      <span className="text-xs text-[#64748b]">
                        {(p.role ?? "employee").replace("_", " ")}
                        {p.department ? ` · ${p.department}` : " · No department"}
                      </span>
                    </button>
                  </li>
                ))}
                {!peopleList.length ? (
                  <li className="px-3 py-6 text-center text-xs text-[#64748b]">No employees found.</li>
                ) : null}
              </ul>
            </div>
          ) : !department && departmentsForCategory.length ? (
            <div className="flex max-h-[min(400px,52vh)] flex-col">
              <PickerHeader
                title={CATEGORY_META.find((c) => c.id === category)?.label ?? "Department"}
                onBack={() => setCategory(null)}
              />
              <ul className="min-h-0 flex-1 overflow-y-auto p-2 space-y-1">
                <li>
                  <button
                    type="button"
                    onClick={() => setDepartment("__all__")}
                    className="w-full rounded-lg border border-[#e8dcc8] px-3 py-2 text-left text-sm hover:bg-[#f8fbff]"
                  >
                    All departments ({byCategory[category].length})
                  </button>
                </li>
                {departmentsForCategory.map((d) => (
                  <li key={d}>
                    <button
                      type="button"
                      onClick={() => setDepartment(d)}
                      className="w-full rounded-lg border border-[#e8dcc8] px-3 py-2 text-left text-sm hover:bg-[#f8fbff]"
                    >
                      {d}
                      <span className="ml-1 text-xs text-[#64748b]">
                        ({byCategory[category].filter((p) => (p.department ?? "").trim() === d).length})
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="flex max-h-[min(400px,52vh)] flex-col">
              <PickerHeader
                title={
                  department === "__all__"
                    ? `All ${CATEGORY_META.find((c) => c.id === category)?.label ?? ""}`
                    : department || "People"
                }
                onBack={() => {
                  if (department) setDepartment("");
                  else setCategory(null);
                }}
              />
              <ul className="min-h-0 flex-1 overflow-y-auto divide-y divide-[#e8edf5]">
                {(department === "__all__" ? byCategory[category] : peopleList).map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => pickPerson(p.id)}
                      className="flex w-full flex-col px-3 py-2.5 text-left hover:bg-[#f8fbff]"
                    >
                      <span className="text-sm font-medium text-[#0f172a]">{displayName(p)}</span>
                      {p.department ? <span className="text-xs text-[#64748b]">{p.department}</span> : null}
                    </button>
                  </li>
                ))}
                {!peopleList.length && department !== "__all__" ? (
                  <li className="px-3 py-6 text-center text-xs text-[#64748b]">No users in this department.</li>
                ) : null}
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function PickerHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[#e8edf5] bg-[#f8fbff] px-3 py-2">
      <button type="button" onClick={onBack} className="rounded p-1 text-[#64748b] hover:bg-white">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <p className="text-sm font-semibold text-[#0f172a]">{title}</p>
    </div>
  );
}
