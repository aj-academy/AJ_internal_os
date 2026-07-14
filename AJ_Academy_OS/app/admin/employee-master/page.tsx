"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableHeaderCell, TableHeaderFilter } from "@/components/ui/TableHeaderFilter";
import { TableSearchBar } from "@/components/ui/TableSearchBar";
import { TablePagination } from "@/components/ui/TablePagination";
import { BulkSelectionBar } from "@/components/ui/BulkSelectionBar";
import { TableBulkCheckbox } from "@/components/ui/TableBulkCheckbox";
import { MobileRecordCard } from "@/components/ui/MobileRecordCard";
import {
  ResponsiveDataView,
  TABLE_CHECK_TH,
  TABLE_CHECK_TD,
} from "@/components/ui/ResponsiveDataView";
import { usePagination } from "@/lib/usePagination";
import { useRowSelection } from "@/lib/useRowSelection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { AdminEmployeeProfileView } from "@/components/admin/AdminEmployeeProfileView";
import { useHrOrgSettings } from "@/hooks/useHrOrgSettings";
import type { Profile, ProfileStatus, UserRole } from "@/types/profile";

type EmployeeRole = UserRole;

type RoleTab = "all" | "employee" | "student" | "mentor" | "freelancer";

interface EmployeeRow {
  id: string;
  full_name: string;
  email: string;
  role: EmployeeRole;
  department: string | null;
  course: string | null;
  assigned_mentor_id: string | null;
  status: ProfileStatus | null;
}

const roles: EmployeeRole[] = ["super_admin", "admin", "employee", "student", "freelancer", "mentor"];

interface FormState {
  id: string | null;
  full_name: string;
  email: string;
  role: EmployeeRole;
  department: string;
  course: string;
  assigned_mentor_id: string;
  status: ProfileStatus;
  password: string;
}

function emptyForm(department: string, course: string): FormState {
  return {
    id: null,
    full_name: "",
    email: "",
    role: "student",
    department,
    course,
    assigned_mentor_id: "",
    status: "active",
    password: "",
  };
}

function mapProfileToRow(p: Profile & { course?: string | null; assigned_mentor_id?: string | null }): EmployeeRow {
  return {
    id: p.id,
    full_name: p.full_name ?? "",
    email: p.email ?? "",
    role: (p.role ?? "student") as EmployeeRole,
    department: p.department,
    course: p.course ?? null,
    assigned_mentor_id: p.assigned_mentor_id ?? null,
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
  const { settings: hrOrg } = useHrOrgSettings();
  const departments = hrOrg.departments;
  const courses = hrOrg.courses;
  const defaultDepartment = departments[0] ?? "General";
  const defaultCourse = courses[0] ?? "";

  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProfileStatus>("all");
  const [roleTab, setRoleTab] = useState<RoleTab>("all");
  const [mode, setMode] = useState<"add" | "edit" | "view">("add");
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultDepartment, defaultCourse));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [viewProfileId, setViewProfileId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const formCardRef = useRef<HTMLDivElement>(null);

  const departmentOptions = useMemo(() => {
    const list = [...departments];
    if (form.department && !list.includes(form.department)) {
      list.unshift(form.department);
    }
    return list.length ? list : [form.department || "General"];
  }, [departments, form.department]);

  const loadEmployees = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id,full_name,email,role,department,course,assigned_mentor_id,status,created_at")
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

  const mentorOptions = useMemo(
    () => employees.filter((e) => e.role === "mentor" && (e.status ?? "active") === "active"),
    [employees],
  );

  const courseOptions = useMemo(() => {
    const list = [...courses];
    if (form.course && !list.includes(form.course)) list.unshift(form.course);
    return list;
  }, [courses, form.course]);

  const filtersActive = Boolean(search.trim() || statusFilter !== "all");

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
  };

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((employee) => {
      const matchesSearch =
        !q ||
        employee.full_name.toLowerCase().includes(q) ||
        employee.email.toLowerCase().includes(q) ||
        employee.id.toLowerCase().includes(q) ||
        (employee.course ?? "").toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "all" ? true : (employee.status ?? "active") === statusFilter;
      const matchesRole =
        roleTab === "all" ? true : employee.role === roleTab;
      return matchesSearch && matchesStatus && matchesRole;
    });
  }, [employees, search, statusFilter, roleTab]);

  const {
    paginatedItems: paginatedEmployees,
    page: directoryPage,
    setPage: setDirectoryPage,
    totalPages: directoryTotalPages,
    totalItems: directoryTotalItems,
    pageSize: directoryPageSize,
    setPageSize: setDirectoryPageSize,
  } = usePagination(filteredEmployees, 10);

  const userBulk = useRowSelection(filteredEmployees, (employee) => employee.id);
  const [bulkRemoving, setBulkRemoving] = useState(false);

  const handleBulkRemoveUsers = async () => {
    if (userBulk.selectedCount === 0) return;
    const confirmed = window.confirm(
      `Remove ${userBulk.selectedCount} user(s) permanently?\n\nTheir login will be deleted. Completed tasks stay in the system.`,
    );
    if (!confirmed) return;
    setBulkRemoving(true);
    setSubmitError(null);
    try {
      const ids = [...userBulk.selected];
      for (const id of ids) {
        const res = await fetch(`/api/admin/employees/${id}`, { method: "DELETE", credentials: "include" });
        if (!res.ok) {
          setSubmitError(await readApiError(res, "Could not remove one or more users."));
          return;
        }
      }
      userBulk.clearSelection();
      setSuccessMessage(`${ids.length} user(s) removed.`);
      await loadEmployees();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Bulk remove failed.");
    } finally {
      setBulkRemoving(false);
    }
  };

  const onPickEmployee = (employee: EmployeeRow, selectedMode: "view" | "edit") => {
    if (selectedMode === "view") {
      setViewProfileId(employee.id);
      return;
    }
    setMode(selectedMode);
    setSubmitError(null);
    setSuccessMessage(null);
    setForm({
      id: employee.id,
      full_name: employee.full_name,
      email: employee.email,
      role: employee.role,
      department: employee.department ?? defaultDepartment,
      course: employee.course ?? defaultCourse,
      assigned_mentor_id: employee.assigned_mentor_id ?? "",
      status: (employee.status ?? "active") as ProfileStatus,
      password: "",
    });
    requestAnimationFrame(() => {
      formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const onCreateNew = () => {
    setMode("add");
    setSubmitError(null);
    setSuccessMessage(null);
    setForm(emptyForm(defaultDepartment, defaultCourse));
  };

  const onRemoveUser = async (employee: EmployeeRow) => {
    const confirmed = window.confirm(
      `Remove ${employee.full_name} permanently?\n\nTheir login will be deleted. Completed tasks stay in the system with their name on file.\n\nTo only block login, use Edit → status "inactive" instead.`,
    );
    if (!confirmed) return;

    setRemovingId(employee.id);
    setSubmitError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/admin/employees/${employee.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        setSubmitError(payload.error ?? "Could not remove user.");
        return;
      }
      setSuccessMessage(payload.message ?? "User removed.");
      if (form.id === employee.id) onCreateNew();
      await loadEmployees();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Remove failed.");
    } finally {
      setRemovingId(null);
    }
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
          credentials: "include",
          body: JSON.stringify({
            full_name: form.full_name.trim(),
            email: form.email.trim().toLowerCase(),
            role: form.role,
            department: form.department.trim(),
            course: form.course.trim() || null,
            assigned_mentor_id: form.role === "student" && form.assigned_mentor_id ? form.assigned_mentor_id : null,
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
          credentials: "include",
          body: JSON.stringify({
            full_name: form.full_name.trim(),
            email: form.email.trim().toLowerCase(),
            role: form.role,
            department: form.department.trim(),
            course: form.course.trim() || null,
            assigned_mentor_id: form.role === "student" && form.assigned_mentor_id ? form.assigned_mentor_id : null,
            status: form.status,
          }),
        });
        if (!res.ok) {
          setSubmitError(await readApiError(res, "Could not update employee."));
          return;
        }
      }

      await loadEmployees();
      setSuccessMessage(mode === "add" ? "User created successfully." : "Changes saved.");
      if (mode === "add") onCreateNew();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed while saving employee.";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const activeCount = employees.filter((employee) => (employee.status ?? "active") === "active").length;
  const inactiveCount = employees.length - activeCount;
  const mentorsCount = employees.filter((employee) => employee.role === "mentor").length;

  return (
    <section className="aj-card space-y-6 rounded-[24px] p-4 sm:p-6 shadow-[0_12px_32px_rgba(166,139,46,0.08)] lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="aj-page-label">Admin Control</p>
          <h2 className="mt-2 text-3xl font-semibold text-[#3d3428]">User Master</h2>
          <p className="mt-2 text-sm text-[#6b5d4d]">
            Edit a user in the form below (scrolls into view). Save Changes updates their profile and login email.
            Trash icon removes login permanently (task history kept). To only disable login, set status to inactive.
          </p>
        </div>
        <Button className="rounded-full px-5" onClick={onCreateNew}>
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
            <CardTitle className="text-sm text-slate-600">Mentors</CardTitle>
          </CardHeader>
          <CardContent className="pb-4 pt-1 text-3xl font-semibold text-slate-900">{mentorsCount}</CardContent>
        </Card>
      </div>

      <div className="mx-auto flex w-full max-w-[1400px] flex-col items-stretch gap-6">
        <Card className="w-full rounded-2xl border-[#dbe6f3] py-0 shadow-sm">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-lg text-slate-900">Employee Directory</CardTitle>
            <TableSearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search by name, email, or profile ID"
              showClear={filtersActive}
              onClear={clearFilters}
              hint={`Showing ${paginatedEmployees.length} of ${filteredEmployees.length} user(s)`}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {(
                [
                  ["all", "All users"],
                  ["employee", "Employees"],
                  ["student", "Students"],
                  ["mentor", "Mentors"],
                  ["freelancer", "Freelancers"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRoleTab(key)}
                  className={[
                    "rounded-full px-4 py-1.5 text-sm font-medium transition",
                    roleTab === key
                      ? "bg-[#c9a227] text-white"
                      : "border border-[#e8dcc8] bg-white text-[#3d3428] hover:bg-[#faf6ee]",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            {userBulk.selectedCount > 0 ? (
              <BulkSelectionBar
                selectedCount={userBulk.selectedCount}
                totalCount={filteredEmployees.length}
                onClear={userBulk.clearSelection}
                className="mb-3"
              >
                <Button
                  type="button"
                  size="sm"
                  disabled={bulkRemoving}
                  className="h-7 rounded-lg bg-rose-600 px-3 text-xs text-white hover:bg-rose-700"
                  onClick={() => void handleBulkRemoveUsers()}
                >
                  {bulkRemoving ? "Removing…" : "Delete selected"}
                </Button>
              </BulkSelectionBar>
            ) : null}
            {listError ? <p className="mb-3 text-sm text-red-600">{listError}</p> : null}
            {loadingList ? (
              <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading employees…
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-[#dbe6f3]">
              <ResponsiveDataView
                selectAll={{
                  checked: userBulk.allSelected,
                  indeterminate: userBulk.someSelected,
                  onChange: userBulk.toggleAll,
                  label: "Select all",
                  countLabel: `${userBulk.selectedCount} selected`,
                }}
                desktop={
                <div className="responsive-table-wrap">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-[#f1f6fc] text-[#64748b]">
                    <tr>
                      <th className={TABLE_CHECK_TH}>
                        <div className="flex justify-center">
                          <TableBulkCheckbox
                            checked={userBulk.allSelected}
                            indeterminate={userBulk.someSelected}
                            disabled={loadingList || !paginatedEmployees.length}
                            onChange={userBulk.toggleAll}
                            ariaLabel="Select all users"
                          />
                        </div>
                      </th>
                      <TableHeaderCell label="Name" className="px-4 py-3" />
                      <TableHeaderCell label="Role" className="px-4 py-3" />
                      <TableHeaderCell label="Department" className="px-4 py-3" />
                      <TableHeaderCell label="Course" className="px-4 py-3" />
                      <TableHeaderFilter
                        label="Status"
                        value={statusFilter === "all" ? "" : statusFilter}
                        onChange={(v) => setStatusFilter((v || "all") as "all" | ProfileStatus)}
                        options={[
                          { value: "active", label: "Active" },
                          { value: "inactive", label: "Inactive" },
                        ]}
                        allLabel="All statuses"
                        className="px-4 py-3"
                      />
                      <TableHeaderCell label="Action" className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8edf5] text-slate-700">
                    {paginatedEmployees.map((employee) => (
                      <tr key={employee.id}>
                        <td className={TABLE_CHECK_TD}>
                          <div className="flex justify-center">
                            <TableBulkCheckbox
                              checked={userBulk.isSelected(employee.id)}
                              onChange={() => userBulk.toggleOne(employee.id)}
                              ariaLabel={`Select ${employee.full_name}`}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <p className="font-medium text-slate-900">{employee.full_name}</p>
                          <p className="text-xs text-slate-500">{employee.email}</p>
                        </td>
                        <td className="px-4 py-2 capitalize">{employee.role.replace("_", " ")}</td>
                        <td className="px-4 py-2">{employee.department ?? "—"}</td>
                        <td className="px-4 py-2">{employee.course ?? "—"}</td>
                        <td className="px-4 py-2">
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
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 rounded-lg border-[#e8dcc8]"
                              onClick={() => onPickEmployee(employee, "view")}
                            >
                              View
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 rounded-lg bg-[#c9a227] text-white hover:bg-[#b8921f]"
                              onClick={() => onPickEmployee(employee, "edit")}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 rounded-lg border-red-200 text-red-600 hover:bg-red-50"
                              disabled={removingId === employee.id}
                              onClick={() => void onRemoveUser(employee)}
                            >
                              {removingId === employee.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!filteredEmployees.length ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                          No employees found for current filters.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
                }
                mobile={
                  !paginatedEmployees.length ? (
                    <p className="rounded-2xl border border-[#e8dcc8] bg-white px-4 py-8 text-center text-sm text-slate-500">
                      No employees found for current filters.
                    </p>
                  ) : (
                    paginatedEmployees.map((employee) => (
                      <MobileRecordCard
                        key={employee.id}
                        title={employee.full_name || "—"}
                        subtitle={employee.email}
                        showSelect
                        selected={userBulk.isSelected(employee.id)}
                        onToggleSelect={() => userBulk.toggleOne(employee.id)}
                        selectAriaLabel={`Select ${employee.full_name}`}
                        previewFields={[
                          { label: "Role", value: employee.role.replace("_", " ") },
                          { label: "Department", value: employee.department ?? "—" },
                          { label: "Status", value: employee.status ?? "active" },
                          { label: "Course", value: employee.course ?? "—" },
                        ]}
                        detailFields={[
                          { label: "Name", value: employee.full_name || "—" },
                          { label: "Email", value: employee.email || "—" },
                          { label: "Role", value: employee.role.replace("_", " ") },
                          { label: "Department", value: employee.department ?? "—" },
                          { label: "Course", value: employee.course ?? "—" },
                          { label: "Status", value: employee.status ?? "active" },
                        ]}
                        primaryActions={[
                          { label: "View", onClick: () => onPickEmployee(employee, "view") },
                          { label: "Edit", onClick: () => onPickEmployee(employee, "edit") },
                        ]}
                        moreActions={[
                          {
                            label: removingId === employee.id ? "Removing…" : "Delete",
                            destructive: true,
                            onClick: () => {
                              if (removingId !== employee.id) void onRemoveUser(employee);
                            },
                          },
                        ]}
                      />
                    ))
                  )
                }
              />
              <TablePagination
                page={directoryPage}
                totalPages={directoryTotalPages}
                totalItems={directoryTotalItems}
                pageSize={directoryPageSize}
                onPageChange={setDirectoryPage}
                onPageSizeChange={setDirectoryPageSize}
              />
              </div>
            )}
          </CardContent>
        </Card>

        <Card
          ref={formCardRef}
          className={[
            "w-full rounded-2xl border py-0 shadow-sm transition-colors",
            mode === "edit" ? "border-[#c9a227] ring-2 ring-[#c9a227]/20" : "border-[#dbe6f3]",
          ].join(" ")}
        >
          <CardHeader className="pb-0 pt-4">
            <CardTitle className="text-lg text-slate-900">
              {mode === "add" ? "Add Employee" : mode === "edit" ? "Edit Employee" : "View Employee"}
            </CardTitle>
            <p className="text-xs text-slate-500">
              {mode === "view"
                ? "Read-only profile fields (matches Supabase profiles)."
                : "Full name, email, role, department, status. On create, set an initial password for first login."}
            </p>
          </CardHeader>
          <CardContent className="pb-4">
            <form className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={onSubmit}>
              <Input
                value={form.full_name}
                onChange={(event) => setForm((prev) => ({ ...prev, full_name: event.target.value }))}
                placeholder="Full Name"
                className="h-9 rounded-xl border-[#e8dcc8]"
                disabled={mode === "view"}
                required
              />
              <Input
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="Work Email"
                className="h-9 rounded-xl border-[#e8dcc8]"
                disabled={mode === "view"}
                required
              />

              <select
                value={form.role}
                onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value as EmployeeRole }))}
                className="h-9 w-full rounded-xl border border-[#e8dcc8] bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/25"
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
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, department: event.target.value }))
                }
                className="h-9 w-full rounded-xl border border-[#e8dcc8] bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/25"
                disabled={mode === "view"}
              >
                {departmentOptions.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>

              <select
                value={form.course}
                onChange={(event) => setForm((prev) => ({ ...prev, course: event.target.value }))}
                className="h-9 w-full rounded-xl border border-[#e8dcc8] bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/25"
                disabled={mode === "view"}
              >
                <option value="">No course</option>
                {courseOptions.map((course) => (
                  <option key={course} value={course}>
                    {course}
                  </option>
                ))}
              </select>

              {form.role === "student" ? (
                <select
                  value={form.assigned_mentor_id}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, assigned_mentor_id: event.target.value }))
                  }
                  className="h-9 w-full rounded-xl border border-[#e8dcc8] bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/25 md:col-span-2"
                  disabled={mode === "view"}
                >
                  <option value="">Assigned mentor (optional)</option>
                  {mentorOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name}
                    </option>
                  ))}
                </select>
              ) : null}

              <select
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, status: event.target.value as ProfileStatus }))
                }
                className="h-9 w-full rounded-xl border border-[#e8dcc8] bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/25"
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
                    className="h-9 rounded-xl border-[#e8dcc8]"
                    autoComplete="new-password"
                    required
                  />
                  <p className="text-xs text-slate-500">
                    Stored in Supabase Auth; the employee uses this password with their email on the login page (along with the matching role).
                  </p>
                </div>
              ) : null}

              {submitError ? <p className="md:col-span-2 text-sm text-red-600">{submitError}</p> : null}
              {successMessage ? (
                <p className="md:col-span-2 text-sm text-emerald-700">{successMessage}</p>
              ) : null}

              <div className="flex flex-wrap gap-2 pt-1 md:col-span-2">
                <Button type="button" variant="outline" className="rounded-xl border-[#e8dcc8]" onClick={onCreateNew}>
                  Reset
                </Button>
                <Button
                  type="submit"
                  data-requires-online
                  className="rounded-xl bg-[#c9a227] text-white hover:bg-[#b8921f]"
                  disabled={mode === "view" || submitting}
                >
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {mode === "add" ? "Create Employee" : mode === "edit" ? "Save Changes" : ""}
                </Button>
                {mode === "edit" && form.id ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl border-red-200 text-red-600 hover:bg-red-50"
                    disabled={submitting || removingId === form.id}
                    onClick={() => {
                      const row = employees.find((e) => e.id === form.id);
                      if (row) void onRemoveUser(row);
                    }}
                  >
                    {removingId === form.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Remove user
                  </Button>
                ) : null}
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

      {viewProfileId ? (
        <AdminEmployeeProfileView profileId={viewProfileId} onClose={() => setViewProfileId(null)} />
      ) : null}
    </section>
  );
}
