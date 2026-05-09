"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import type { Profile, ProfileStatus, UserRole } from "@/types/profile";

type EmployeeRole = UserRole;

interface EmployeeRow {
  id: string;
  full_name: string;
  email: string;
  role: EmployeeRole;
  department: string | null;
  designation: string | null;
  status: ProfileStatus | null;
}

const roles: EmployeeRole[] = ["super_admin", "admin", "manager", "employee", "accounts"];

const departments = ["Engineering", "Human Resources", "Finance", "Operations", "Sales"];

const designations = [
  "Engineering Manager",
  "Software Engineer",
  "HR Executive",
  "HR Manager",
  "Accounts Officer",
  "Admin Ops Lead",
  "Team Lead",
];

interface FormState {
  id: string | null;
  full_name: string;
  email: string;
  role: EmployeeRole;
  department: string;
  designation: string;
  status: ProfileStatus;
  password: string;
}

const initialFormState: FormState = {
  id: null,
  full_name: "",
  email: "",
  role: "employee",
  department: departments[0],
  designation: designations[1],
  status: "active",
  password: "",
};

function mapProfileToRow(p: Profile): EmployeeRow {
  return {
    id: p.id,
    full_name: p.full_name ?? "",
    email: p.email ?? "",
    role: (p.role ?? "employee") as EmployeeRole,
    department: p.department,
    designation: p.designation,
    status: p.status,
  };
}

async function readApiError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? fallback;
  } catch {
    return fallback;
  }
}

export default function EmployeeMasterPage() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProfileStatus>("all");
  const [mode, setMode] = useState<"add" | "edit" | "view">("add");
  const [form, setForm] = useState<FormState>(initialFormState);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadEmployees = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id,full_name,email,role,department,designation,status,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setListError(error.message);
      setEmployees([]);
    } else {
      setEmployees((data ?? []).map((row) => mapProfileToRow(row as Profile)));
    }
    setLoadingList(false);
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((employee) => {
      const matchesSearch =
        !q ||
        employee.full_name.toLowerCase().includes(q) ||
        employee.email.toLowerCase().includes(q) ||
        employee.id.toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "all" ? true : (employee.status ?? "active") === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [employees, search, statusFilter]);

  const onPickEmployee = (employee: EmployeeRow, selectedMode: "view" | "edit") => {
    setMode(selectedMode);
    setSubmitError(null);
    setForm({
      id: employee.id,
      full_name: employee.full_name,
      email: employee.email,
      role: employee.role,
      department: employee.department ?? departments[0],
      designation: employee.designation ?? designations[0],
      status: (employee.status ?? "active") as ProfileStatus,
      password: "",
    });
  };

  const onCreateNew = () => {
    setMode("add");
    setSubmitError(null);
    setForm(initialFormState);
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    if (mode === "view") return;

    if (mode === "add") {
      if (form.password.length < 8) {
        setSubmitError("Initial password must be at least 8 characters for the employee's first login.");
        return;
      }
    }

    setSubmitting(true);

    try {
      if (mode === "add") {
        const res = await fetch("/api/admin/employees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            full_name: form.full_name.trim(),
            email: form.email.trim().toLowerCase(),
            role: form.role,
            department: form.department.trim(),
            designation: form.designation.trim(),
            status: form.status,
            password: form.password,
          }),
        });
        if (!res.ok) {
          setSubmitError(await readApiError(res, "Could not create employee."));
          return;
        }
      } else if (mode === "edit" && form.id) {
        const res = await fetch(`/api/admin/employees/${form.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            full_name: form.full_name.trim(),
            email: form.email.trim().toLowerCase(),
            role: form.role,
            department: form.department.trim(),
            designation: form.designation.trim(),
            status: form.status,
          }),
        });
        if (!res.ok) {
          setSubmitError(await readApiError(res, "Could not update employee."));
          return;
        }
      }

      await loadEmployees();
      onCreateNew();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed while saving employee.";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const activeCount = employees.filter((employee) => (employee.status ?? "active") === "active").length;
  const inactiveCount = employees.length - activeCount;
  const managersCount = employees.filter((employee) => employee.role === "manager").length;

  return (
    <section className="space-y-6 rounded-[24px] border border-[#d4deea] bg-white p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#64748b]">Admin Control</p>
          <h2 className="mt-2 text-3xl font-semibold text-[#0f172a]">Employee Master</h2>
          <p className="mt-2 text-sm text-[#64748b]">
            Directory and creation form match the Supabase profiles columns (full name, email, role, department, designation, status).
            New employees sign in with their work email, the matching role, and the initial password you set below.
          </p>
        </div>
        <Button className="rounded-full bg-[#2563eb] px-5 text-white hover:bg-[#1d4ed8]" onClick={onCreateNew}>
          Add Employee
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl border-[#dbe6f3] py-0 shadow-sm">
          <CardHeader className="pb-0 pt-4">
            <CardTitle className="text-sm text-slate-600">Total Employees</CardTitle>
          </CardHeader>
          <CardContent className="pb-4 pt-1 text-3xl font-semibold text-slate-900">{employees.length}</CardContent>
        </Card>
        <Card className="rounded-2xl border-[#dbe6f3] py-0 shadow-sm">
          <CardHeader className="pb-0 pt-4">
            <CardTitle className="text-sm text-slate-600">Active Employees</CardTitle>
          </CardHeader>
          <CardContent className="pb-4 pt-1 text-3xl font-semibold text-slate-900">{activeCount}</CardContent>
        </Card>
        <Card className="rounded-2xl border-[#dbe6f3] py-0 shadow-sm">
          <CardHeader className="pb-0 pt-4">
            <CardTitle className="text-sm text-slate-600">Managers</CardTitle>
          </CardHeader>
          <CardContent className="pb-4 pt-1 text-3xl font-semibold text-slate-900">{managersCount}</CardContent>
        </Card>
      </div>

      <div className="mx-auto flex w-full max-w-[1400px] flex-col items-stretch gap-6">
        <Card className="w-full rounded-2xl border-[#dbe6f3] py-0 shadow-sm">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-lg text-slate-900">Employee Directory</CardTitle>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                placeholder="Search by name, email, or profile ID"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 rounded-xl border-[#cfdceb]"
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "all" | ProfileStatus)}
                className="h-9 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#dbeafe]"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            {listError ? <p className="mb-3 text-sm text-red-600">{listError}</p> : null}
            {loadingList ? (
              <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading employees…
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#dbe6f3]">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-[#f1f6fc] text-[#64748b]">
                    <tr>
                      {["Name", "Role", "Department", "Designation", "Status", "Action"].map((heading) => (
                        <th key={heading} className="px-4 py-3">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8edf5] text-slate-700">
                    {filteredEmployees.map((employee) => (
                      <tr key={employee.id}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{employee.full_name}</p>
                          <p className="text-xs text-slate-500">{employee.email}</p>
                        </td>
                        <td className="px-4 py-3 capitalize">{employee.role.replace("_", " ")}</td>
                        <td className="px-4 py-3">{employee.department ?? "—"}</td>
                        <td className="px-4 py-3">{employee.designation ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={[
                              "rounded-full px-2.5 py-1 text-xs font-semibold",
                              (employee.status ?? "active") === "active"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-200 text-slate-700",
                            ].join(" ")}
                          >
                            {employee.status ?? "active"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 rounded-lg border-[#cfdceb]"
                              onClick={() => onPickEmployee(employee, "view")}
                            >
                              View
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 rounded-lg bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
                              onClick={() => onPickEmployee(employee, "edit")}
                            >
                              Edit
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!filteredEmployees.length ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                          No employees found for current filters.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="w-full rounded-2xl border-[#dbe6f3] py-0 shadow-sm">
          <CardHeader className="pb-0 pt-4">
            <CardTitle className="text-lg text-slate-900">
              {mode === "add" ? "Add Employee" : mode === "edit" ? "Edit Employee" : "View Employee"}
            </CardTitle>
            <p className="text-xs text-slate-500">
              {mode === "view"
                ? "Read-only profile fields (matches Supabase profiles)."
                : "Fields match the profiles table: full name, email, role, department, designation, status. On create, set an initial password the employee will use at login."}
            </p>
          </CardHeader>
          <CardContent className="pb-4">
            <form className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={onSubmit}>
              <Input
                value={form.full_name}
                onChange={(event) => setForm((prev) => ({ ...prev, full_name: event.target.value }))}
                placeholder="Full Name"
                className="h-9 rounded-xl border-[#cfdceb]"
                disabled={mode === "view"}
                required
              />
              <Input
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="Work Email"
                className="h-9 rounded-xl border-[#cfdceb]"
                disabled={mode === "view"}
                required
              />

              <select
                value={form.role}
                onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value as EmployeeRole }))}
                className="h-9 w-full rounded-xl border border-[#cfdceb] bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#dbeafe]"
                disabled={mode === "view"}
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role.replace("_", " ")}
                  </option>
                ))}
              </select>

              <select
                value={form.department}
                onChange={(event) => setForm((prev) => ({ ...prev, department: event.target.value }))}
                className="h-9 w-full rounded-xl border border-[#cfdceb] bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#dbeafe]"
                disabled={mode === "view"}
              >
                {departments.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>

              <select
                value={form.designation}
                onChange={(event) => setForm((prev) => ({ ...prev, designation: event.target.value }))}
                className="h-9 w-full rounded-xl border border-[#cfdceb] bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#dbeafe]"
                disabled={mode === "view"}
              >
                {designations.map((designation) => (
                  <option key={designation} value={designation}>
                    {designation}
                  </option>
                ))}
              </select>

              <select
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, status: event.target.value as ProfileStatus }))
                }
                className="h-9 w-full rounded-xl border border-[#cfdceb] bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#dbeafe]"
                disabled={mode === "view"}
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>

              {mode === "add" ? (
                <div className="md:col-span-2 space-y-1">
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                    placeholder="Initial login password (min 8 characters)"
                    className="h-9 rounded-xl border-[#cfdceb]"
                    autoComplete="new-password"
                    required
                  />
                  <p className="text-xs text-slate-500">
                    Stored in Supabase Auth; the employee uses this password with their email on the login page (along with the matching role).
                  </p>
                </div>
              ) : null}

              {submitError ? <p className="md:col-span-2 text-sm text-red-600">{submitError}</p> : null}

              <div className="flex flex-wrap gap-2 pt-1 md:col-span-2">
                <Button type="button" variant="outline" className="rounded-xl border-[#cfdceb]" onClick={onCreateNew}>
                  Reset
                </Button>
                <Button
                  type="submit"
                  className="rounded-xl bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
                  disabled={mode === "view" || submitting}
                >
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {mode === "add" ? "Create Employee" : mode === "edit" ? "Save Changes" : ""}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-[#dbe6f3] py-0 shadow-sm">
        <CardHeader className="pb-0 pt-4">
          <CardTitle className="text-sm text-slate-600">Status Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="pb-4 pt-2 text-sm text-slate-600">
          Active: <span className="font-semibold text-slate-900">{activeCount}</span> |
          Inactive: <span className="font-semibold text-slate-900"> {inactiveCount}</span>
        </CardContent>
      </Card>
    </section>
  );
}
