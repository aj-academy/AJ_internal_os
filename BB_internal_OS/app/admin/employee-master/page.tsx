"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type EmployeeStatus = "active" | "inactive";
type EmployeeRole = "super_admin" | "admin" | "manager" | "employee" | "accounts";

interface EmployeeRow {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  role: EmployeeRole;
  department: string;
  designation: string;
  reportingManagerId: string | null;
  status: EmployeeStatus;
}

const seedEmployees: EmployeeRow[] = [
  {
    id: "1",
    employeeCode: "EMP-001",
    fullName: "Arjun Kumar",
    email: "arjun@bbinternal.com",
    role: "manager",
    department: "Engineering",
    designation: "Engineering Manager",
    reportingManagerId: null,
    status: "active",
  },
  {
    id: "2",
    employeeCode: "EMP-002",
    fullName: "Riya Sharma",
    email: "riya@bbinternal.com",
    role: "employee",
    department: "Human Resources",
    designation: "HR Executive",
    reportingManagerId: "4",
    status: "active",
  },
  {
    id: "3",
    employeeCode: "EMP-003",
    fullName: "Naveen Raj",
    email: "naveen@bbinternal.com",
    role: "accounts",
    department: "Finance",
    designation: "Accounts Officer",
    reportingManagerId: "5",
    status: "inactive",
  },
  {
    id: "4",
    employeeCode: "EMP-004",
    fullName: "Sana Ali",
    email: "sana@bbinternal.com",
    role: "manager",
    department: "Human Resources",
    designation: "HR Manager",
    reportingManagerId: null,
    status: "active",
  },
  {
    id: "5",
    employeeCode: "EMP-005",
    fullName: "Ravi Teja",
    email: "ravi@bbinternal.com",
    role: "admin",
    department: "Operations",
    designation: "Admin Ops Lead",
    reportingManagerId: null,
    status: "active",
  },
];

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
  employeeCode: string;
  fullName: string;
  email: string;
  role: EmployeeRole;
  department: string;
  designation: string;
  reportingManagerId: string;
  status: EmployeeStatus;
}

const initialFormState: FormState = {
  id: null,
  employeeCode: "",
  fullName: "",
  email: "",
  role: "employee",
  department: departments[0],
  designation: designations[1],
  reportingManagerId: "",
  status: "active",
};

export default function EmployeeMasterPage() {
  const [employees, setEmployees] = useState<EmployeeRow[]>(seedEmployees);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | EmployeeStatus>("all");
  const [mode, setMode] = useState<"add" | "edit" | "view">("add");
  const [form, setForm] = useState<FormState>(initialFormState);

  const managerOptions = useMemo(
    () => employees.filter((employee) => employee.role === "manager" || employee.role === "admin"),
    [employees],
  );

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const matchesSearch =
        employee.fullName.toLowerCase().includes(search.toLowerCase()) ||
        employee.email.toLowerCase().includes(search.toLowerCase()) ||
        employee.employeeCode.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" ? true : employee.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [employees, search, statusFilter]);

  const onPickEmployee = (employee: EmployeeRow, selectedMode: "view" | "edit") => {
    setMode(selectedMode);
    setForm({
      id: employee.id,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      email: employee.email,
      role: employee.role,
      department: employee.department,
      designation: employee.designation,
      reportingManagerId: employee.reportingManagerId ?? "",
      status: employee.status,
    });
  };

  const onCreateNew = () => {
    setMode("add");
    setForm(initialFormState);
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (mode === "view") return;

    const payload: EmployeeRow = {
      id: form.id ?? crypto.randomUUID(),
      employeeCode: form.employeeCode.trim(),
      fullName: form.fullName.trim(),
      email: form.email.trim().toLowerCase(),
      role: form.role,
      department: form.department,
      designation: form.designation,
      reportingManagerId: form.reportingManagerId || null,
      status: form.status,
    };

    if (mode === "add") {
      setEmployees((prev) => [payload, ...prev]);
    } else {
      setEmployees((prev) => prev.map((employee) => (employee.id === payload.id ? payload : employee)));
    }

    onCreateNew();
  };

  const activeCount = employees.filter((employee) => employee.status === "active").length;
  const inactiveCount = employees.length - activeCount;
  const managersCount = employees.filter((employee) => employee.role === "manager").length;

  return (
    <section className="space-y-6 rounded-[24px] border border-[#d4deea] bg-white p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#64748b]">Admin Control</p>
          <h2 className="mt-2 text-3xl font-semibold text-[#0f172a]">Employee Master</h2>
          <p className="mt-2 text-sm text-[#64748b]">
            Manage employee records, role mapping, department, designation, reporting manager, and status.
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

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8 rounded-2xl border-[#dbe6f3] py-0 shadow-sm">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-lg text-slate-900">Employee Directory</CardTitle>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                placeholder="Search by name, email, employee ID"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 rounded-xl border-[#cfdceb]"
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "all" | EmployeeStatus)}
                className="h-9 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#dbeafe]"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="overflow-x-auto rounded-xl border border-[#dbe6f3]">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="bg-[#f1f6fc] text-[#64748b]">
                  <tr>
                    {[
                      "Employee ID",
                      "Name",
                      "Role",
                      "Department",
                      "Designation",
                      "Reporting Manager",
                      "Status",
                      "Action",
                    ].map((heading) => (
                      <th key={heading} className="px-4 py-3">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8edf5] text-slate-700">
                  {filteredEmployees.map((employee) => {
                    const managerName =
                      employees.find((item) => item.id === employee.reportingManagerId)?.fullName ?? "-";
                    return (
                      <tr key={employee.id}>
                        <td className="px-4 py-3 font-medium text-slate-900">{employee.employeeCode}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{employee.fullName}</p>
                          <p className="text-xs text-slate-500">{employee.email}</p>
                        </td>
                        <td className="px-4 py-3 capitalize">{employee.role.replace("_", " ")}</td>
                        <td className="px-4 py-3">{employee.department}</td>
                        <td className="px-4 py-3">{employee.designation}</td>
                        <td className="px-4 py-3">{managerName}</td>
                        <td className="px-4 py-3">
                          <span
                            className={[
                              "rounded-full px-2.5 py-1 text-xs font-semibold",
                              employee.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700",
                            ].join(" ")}
                          >
                            {employee.status}
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
                    );
                  })}
                  {!filteredEmployees.length ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                        No employees found for current filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-4 rounded-2xl border-[#dbe6f3] py-0 shadow-sm">
          <CardHeader className="pb-0 pt-4">
            <CardTitle className="text-lg text-slate-900">
              {mode === "add" ? "Add Employee" : mode === "edit" ? "Edit Employee" : "View Employee"}
            </CardTitle>
            <p className="text-xs text-slate-500">
              {mode === "view"
                ? "Read-only employee details."
                : "Configure role mapping, department, designation and reporting manager."}
            </p>
          </CardHeader>
          <CardContent className="pb-4">
            <form className="space-y-3" onSubmit={onSubmit}>
              <Input
                value={form.employeeCode}
                onChange={(event) => setForm((prev) => ({ ...prev, employeeCode: event.target.value }))}
                placeholder="Employee Code"
                className="h-9 rounded-xl border-[#cfdceb]"
                disabled={mode === "view"}
                required
              />
              <Input
                value={form.fullName}
                onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
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
                value={form.reportingManagerId}
                onChange={(event) => setForm((prev) => ({ ...prev, reportingManagerId: event.target.value }))}
                className="h-9 w-full rounded-xl border border-[#cfdceb] bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#dbeafe]"
                disabled={mode === "view"}
              >
                <option value="">No Manager</option>
                {managerOptions.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.fullName}
                  </option>
                ))}
              </select>

              <select
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as EmployeeStatus }))}
                className="h-9 w-full rounded-xl border border-[#cfdceb] bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#dbeafe]"
                disabled={mode === "view"}
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>

              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="rounded-xl border-[#cfdceb]" onClick={onCreateNew}>
                  Reset
                </Button>
                <Button
                  type="submit"
                  className="rounded-xl bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
                  disabled={mode === "view"}
                >
                  {mode === "add" ? "Create Employee" : "Save Changes"}
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
