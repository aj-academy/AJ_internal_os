"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { TableHeaderCell, TableHeaderFilter } from "@/components/ui/TableHeaderFilter";
import { TableSearchBar } from "@/components/ui/TableSearchBar";
import { Input } from "@/components/ui/input";
import { LeadSummaryCard } from "@/components/ui/LeadSummaryCard";
import { PROJECT_TAB_IDS, TAB_LABELS } from "@/components/project-master/projectConfig";
import { ProjectFormPanel, type ProjectFormValue } from "@/components/project-master/ProjectFormPanel";
import {
  PROJECT_SELECT,
  displayClientName,
  friendlyProjectError,
  isDelayedProject,
  isMissingProjectsTable,
  normalizeProjectStatus,
  type ProjectRowLoose,
} from "@/components/project-master/projectHelpers";
import type { ClientOption, ProjectActivityRow, ProjectRow, ProjectTabId, TeamMemberRow } from "@/types/project";
import type { TaskRecord } from "@/types/task";

export type ProjectMasterVariant = "admin" | "manager" | "employee" | "accounts";

interface ProfileMini {
  id: string;
  full_name: string | null;
  email: string | null;
  role?: string | null;
  department?: string | null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function emptyForm(): ProjectFormValue {
  return {
    project_name: "",
    project_code: "",
    client_id: "",
    project_type: "",
    description: "",
    start_date: "",
    deadline: "",
    estimated_completion: "",
    budget: "",
    advance_paid: "0",
    project_manager: "",
    team_ids: new Set<string>(),
    status: "Planning",
    priority: "Medium",
    notes: "",
  };
}

async function logProjectActivity(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  type: string,
  notes: string,
  userId: string,
  oldVal?: string | null,
  newVal?: string | null,
) {
  await supabase.from("project_activities").insert({
    project_id: projectId,
    activity_type: type,
    notes,
    old_value: oldVal ?? null,
    new_value: newVal ?? null,
    created_by: userId,
  });
}

async function syncProjectTeamMembers(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  teamIds: string[],
  employees: ProfileMini[],
) {
  await supabase.from("project_team_members").delete().eq("project_id", projectId);
  if (!teamIds.length) return;
  const rows = teamIds.map((profileId) => ({
    project_id: projectId,
    profile_id: profileId,
    role: null as string | null,
  }));
  const { error } = await supabase.from("project_team_members").insert(rows);
  if (error) throw new Error(error.message);
}

function teamJsonFromIds(teamIds: Set<string>, employees: ProfileMini[]) {
  const map = new Map(employees.map((e) => [e.id, e]));
  return teamIds.size
    ? Array.from(teamIds).map((id) => ({
        id,
        name: map.get(id)?.full_name || map.get(id)?.email || id.slice(0, 8),
      }))
    : [];
}

export function ProjectMasterWorkbench({ variant }: { variant: ProjectMasterVariant }) {
  const supabase = useMemo(() => createClient(), []);
  const isAdmin = variant === "admin";
  const isAccounts = variant === "accounts";
  const canCreate = isAdmin;
  const canEditProjectFields = isAdmin || variant === "manager";
  const showFullTabs = !isAccounts;

  const [activeTab, setActiveTab] = useState<ProjectTabId>(() => (isAccounts ? "budget" : "overview"));
  const [userId, setUserId] = useState("");
  const [projects, setProjects] = useState<ProjectRowLoose[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [employees, setEmployees] = useState<ProfileMini[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);
  const [activities, setActivities] = useState<ProjectActivityRow[]>([]);
  const [projectTasks, setProjectTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectFormValue>(emptyForm);
  const [viewProject, setViewProject] = useState<ProjectRowLoose | null>(null);
  const [fltStatus, setFltStatus] = useState("");
  const [fltPriority, setFltPriority] = useState("");
  const [fltManager, setFltManager] = useState("");
  const [fltClient, setFltClient] = useState("");
  const [fltDeadline, setFltDeadline] = useState("");
  const [search, setSearch] = useState("");

  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);
  const employeeOpts = useMemo(
    () =>
      employees.map((e) => ({
        id: e.id,
        label: e.full_name || e.email || "User",
      })),
    [employees],
  );
  const employeeNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    employees.forEach((e) => {
      m[e.id] = e.full_name || e.email || e.id.slice(0, 8);
    });
    return m;
  }, [employees]);

  const loadCore = useCallback(async () => {
    const { data: ps, error: pe } = await supabase.from("projects").select(PROJECT_SELECT).order("updated_at", { ascending: false }).limit(500).returns<ProjectRow[]>();
    if (pe) {
      if (isMissingProjectsTable(pe.message)) {
        setSchemaMissing(true);
        setProjects([]);
        return;
      }
      throw new Error(pe.message);
    }
    setSchemaMissing(false);
    setProjects((ps as ProjectRowLoose[] | null) ?? []);

    const { data: cs } = await supabase.from("clients").select("id,lead_name,name,company_name").order("updated_at", { ascending: false }).limit(600);
    setClients((cs as ClientOption[] | null) ?? []);

    const { data: es } = await supabase
      .from("profiles")
      .select("id,full_name,email,role,department")
      .in("role", ["student", "freelancer", "mentor", "admin", "super_admin"])
      .or("status.is.null,status.eq.active")
      .order("full_name", { ascending: true });
    setEmployees((es as ProfileMini[] | null) ?? []);

    const { data: tm } = await supabase.from("project_team_members").select("project_id,profile_id,role").limit(3000);
    setTeamMembers((tm as TeamMemberRow[] | null) ?? []);

    const { data: act } = await supabase.from("project_activities").select("*").order("created_at", { ascending: false }).limit(400);
    setActivities((act as ProjectActivityRow[] | null) ?? []);
  }, [supabase]);

  const reload = useCallback(async () => {
    if (!userId) return;
    setError(null);
    setLoading(true);
    try {
      await loadCore();
    } catch (e) {
      setError(friendlyProjectError(e));
    } finally {
      setLoading(false);
    }
  }, [loadCore, userId]);

  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) setUserId(user.id);
    })();
  }, [supabase]);

  useEffect(() => {
    if (!userId) return;
    void reload();
  }, [reload, userId]);

  useEffect(() => {
    if (!userId || schemaMissing) return;
    const ch = supabase
      .channel("project-master-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "project_activities" }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "project_team_members" }, () => void reload())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [reload, schemaMissing, supabase, userId]);

  const filtered = useMemo(() => {
    let list = [...projects];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p) => String(p.project_name || "").toLowerCase().includes(q));
    if (fltStatus) list = list.filter((p) => normalizeProjectStatus(String(p.status)) === fltStatus);
    if (fltPriority) list = list.filter((p) => (p.priority || "") === fltPriority);
    if (fltManager) list = list.filter((p) => (p.project_manager || "") === fltManager);
    if (fltClient) list = list.filter((p) => (p.client_id || "") === fltClient);
    if (fltDeadline) list = list.filter((p) => (p.deadline || "").slice(0, 10) === fltDeadline);
    return list;
  }, [fltClient, fltDeadline, fltManager, fltPriority, fltStatus, projects, search]);

  const filtersActive = Boolean(search.trim() || fltStatus || fltPriority || fltManager || fltClient || fltDeadline);

  const clearTableFilters = () => {
    setSearch("");
    setFltStatus("");
    setFltPriority("");
    setFltManager("");
    setFltClient("");
    setFltDeadline("");
  };

  const today = todayISO();
  const activeList = filtered.filter((p) => normalizeProjectStatus(String(p.status)) === "Active");
  const completedList = filtered.filter((p) => normalizeProjectStatus(String(p.status)) === "Completed");
  const delayedList = filtered.filter((p) => isDelayedProject(p, today) || normalizeProjectStatus(String(p.status)) === "Delayed");

  const overview = useMemo(() => {
    const total = projects.length;
    const active = projects.filter((p) => normalizeProjectStatus(String(p.status)) === "Active").length;
    const completed = projects.filter((p) => normalizeProjectStatus(String(p.status)) === "Completed").length;
    const delayed = projects.filter((p) => isDelayedProject(p, today) || normalizeProjectStatus(String(p.status)) === "Delayed").length;
    const dueWeek = projects.filter((p) => {
      if (!p.deadline) return false;
      const d = String(p.deadline).slice(0, 10);
      const t = new Date(today);
      const end = new Date(t);
      end.setDate(end.getDate() + 7);
      return d >= today && d <= end.toISOString().slice(0, 10) && normalizeProjectStatus(String(p.status)) !== "Completed";
    }).length;
    const revenue = projects.reduce((a, p) => a + Number(p.budget ?? 0), 0);
    const pendingPay = projects.reduce((a, p) => a + Number(p.pending_amount ?? 0), 0);
    const util =
      employees.length && projects.length
        ? `${Math.min(100, Math.round((teamMembers.length / Math.max(1, employees.length / projects.length)) * 10))}%`
        : "—";
    return { total, active, completed, delayed, dueWeek, revenue, pendingPay, util };
  }, [employees.length, projects, teamMembers.length, today]);

  const openCreate = () => {
    if (!canCreate || schemaMissing) return;
    setEditId(null);
    setForm(emptyForm());
    setPanelOpen(true);
  };

  const openEdit = (p: ProjectRowLoose) => {
    if (!canEditProjectFields || schemaMissing) return;
    setEditId(p.id);
    const teamIds = new Set(teamMembers.filter((t) => t.project_id === p.id).map((t) => t.profile_id));
    setForm({
      project_name: String(p.project_name || ""),
      project_code: String(p.project_code || ""),
      client_id: String(p.client_id || ""),
      project_type: String(p.project_type || ""),
      description: String(p.description || ""),
      start_date: p.start_date ? String(p.start_date).slice(0, 10) : "",
      deadline: p.deadline ? String(p.deadline).slice(0, 10) : "",
      estimated_completion: p.estimated_completion ? String(p.estimated_completion).slice(0, 10) : "",
      budget: p.budget != null ? String(p.budget) : "",
      advance_paid: p.advance_paid != null ? String(p.advance_paid) : "0",
      project_manager: String(p.project_manager || ""),
      team_ids: teamIds,
      status: normalizeProjectStatus(String(p.status)) as string,
      priority: (p.priority as string) || "Medium",
      notes: String(p.notes || ""),
    });
    setPanelOpen(true);
  };

  const saveProject = async () => {
    if (!userId || !canEditProjectFields || schemaMissing) return;
    if (!form.project_name.trim() || !form.client_id) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    const budget = form.budget.trim() === "" ? null : Number(form.budget);
    const adv = form.advance_paid.trim() === "" ? 0 : Number(form.advance_paid);
    const pending = Math.max(0, (budget ?? 0) - adv);
    const teamJson = teamJsonFromIds(form.team_ids, employees);
    const payload: Record<string, unknown> = {
      project_name: form.project_name.trim(),
      project_code: form.project_code.trim() || null,
      client_id: form.client_id,
      project_type: form.project_type || null,
      description: form.description || null,
      start_date: form.start_date || null,
      deadline: form.deadline || null,
      estimated_completion: form.estimated_completion || null,
      budget,
      advance_paid: adv,
      pending_amount: pending,
      project_manager: form.project_manager || null,
      assigned_team: teamJson,
      status: form.status,
      priority: form.priority,
      notes: form.notes || null,
    };
    try {
      if (editId) {
        const prev = projects.find((x) => x.id === editId);
        const { error: up } = await supabase.from("projects").update(payload).eq("id", editId);
        if (up) throw new Error(up.message);
        await syncProjectTeamMembers(supabase, editId, Array.from(form.team_ids), employees);
        await logProjectActivity(supabase, editId, "Project updated", "Project saved", userId, null, null);
        if (prev && String(prev.status) !== form.status) {
          await logProjectActivity(supabase, editId, "Status changed", "", userId, String(prev.status), form.status);
        }
        setSuccess("Project updated.");
      } else {
        if (!isAdmin) {
          setError("Only admins can create new projects.");
          return;
        }
        const { data: ins, error: ie } = await supabase
          .from("projects")
          .insert({ ...payload, created_by: userId })
          .select("id")
          .maybeSingle();
        if (ie) throw new Error(ie.message);
        const nid = ins?.id as string | undefined;
        if (!nid) throw new Error("Insert failed.");
        await syncProjectTeamMembers(supabase, nid, Array.from(form.team_ids), employees);
        await logProjectActivity(supabase, nid, "Project created", form.project_name, userId);
        setSuccess("Project created.");
      }
      setPanelOpen(false);
      await reload();
    } catch (e) {
      setError(friendlyProjectError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const deleteProject = async (id: string) => {
    if (!isAdmin || !confirm("Delete this project? Linked tasks will have project_id cleared.")) return;
    const { error: de } = await supabase.from("projects").delete().eq("id", id);
    if (de) setError(de.message);
    else {
      setSuccess("Deleted.");
      await reload();
    }
  };

  const loadTasksForProject = async (projectId: string) => {
    const { data, error: te } = await supabase
      .from("tasks")
      .select("id,title,description,assigned_to,priority,status,start_date,due_date,progress,created_at,updated_at,project_id")
      .eq("project_id", projectId)
      .returns<TaskRecord[]>();
    if (!te) setProjectTasks(data ?? []);
  };

  useEffect(() => {
    if (viewProject?.id) void loadTasksForProject(viewProject.id);
    else setProjectTasks([]);
  }, [viewProject?.id, supabase]);

  const teamWorkload = useMemo(() => {
    const byEmp: Record<string, { projects: Set<string>; tasks: number }> = {};
    teamMembers.forEach((tm) => {
      if (!byEmp[tm.profile_id]) byEmp[tm.profile_id] = { projects: new Set(), tasks: 0 };
      byEmp[tm.profile_id].projects.add(tm.project_id);
    });
    return employees
      .filter((e) => e.role === "employee" || e.role === "manager")
      .map((e) => {
        const pr = byEmp[e.id]?.projects.size ?? 0;
        const overload = pr > 3;
        return {
          id: e.id,
          name: e.full_name || e.email || "",
          dept: e.department?.trim() || "—",
          projects: pr,
          overload,
        };
      });
  }, [employees, teamMembers]);

  const visibleTabs: ProjectTabId[] = isAccounts ? ["budget", "reports", "settings"] : PROJECT_TAB_IDS;

  return (
    <section className="space-y-5 rounded-[24px] border border-[#e8dcc8] bg-white p-4 sm:p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold text-[#0f172a]">Project Master</h2>
          <p className="mt-1 text-sm text-[#64748b]">Manage client projects, timelines, teams, budgets and delivery progress.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-9 rounded-full border-[#e8dcc8]" disabled={loading || schemaMissing} onClick={() => void reload()}>
            Refresh
          </Button>
          {canCreate ? (
            <Button className="h-9 rounded-full bg-[#c9a227] px-4 text-white" disabled={schemaMissing} onClick={openCreate}>
              + New project
            </Button>
          ) : null}
        </div>
      </header>

      {schemaMissing ? (
        <div className="rounded-xl border border-blue-200 bg-[#faf3e3] px-4 py-3 text-sm text-blue-900">
          <p className="font-semibold">Database setup</p>
          <p className="mt-1">
            Run <strong>AJ_Academy_SB/project_master_schema.sql</strong> in Supabase (after <code className="rounded bg-white/80 px-1">schema.sql</code> and{" "}
            <code className="rounded bg-white/80 px-1">tasks</code>), then refresh. See DATABASE_SETUP_ORDER.txt.
          </p>
        </div>
      ) : null}

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{success}</div> : null}

      <div className="overflow-x-auto rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-2">
        <div className="flex min-w-max gap-2">
          {visibleTabs.map((tid) => (
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
              {TAB_LABELS[tid]}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "overview" && showFullTabs ? (
        <>
          <div className="stat-cards-grid">
            <LeadSummaryCard title="Total Projects" value={overview.total} loading={loading} />
            <LeadSummaryCard title="Active Projects" value={overview.active} loading={loading} />
            <LeadSummaryCard title="Completed" value={overview.completed} loading={loading} />
            <LeadSummaryCard title="Delayed" value={overview.delayed} loading={loading} accent="rose" />
            <LeadSummaryCard title="Due this week" value={overview.dueWeek} loading={loading} />
            <LeadSummaryCard title="Total budget" value={`₹${Math.round(overview.revenue).toLocaleString()}`} loading={loading} />
            <LeadSummaryCard title="Pending payments" value={`₹${Math.round(overview.pendingPay).toLocaleString()}`} loading={loading} />
            <LeadSummaryCard title="Team utilization" value={overview.util} loading={loading} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-[#64748b]">Status breakdown</p>
              <div className="mt-3 space-y-2 text-sm">
                {["Planning", "Active", "On Hold", "In Review", "Completed", "Cancelled", "Delayed"].map((st) => {
                  const c = projects.filter((p) => normalizeProjectStatus(String(p.status)) === st).length;
                  const max = Math.max(1, projects.length);
                  return (
                    <div key={st}>
                      <div className="flex justify-between text-xs">
                        <span>{st}</span>
                        <span>{c}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-[#c9a227]" style={{ width: `${Math.max(4, (c / max) * 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-[#64748b]">Monthly project trend (created)</p>
              <div className="mt-3 space-y-2 text-sm">
                {(() => {
                  const buckets: Record<string, number> = {};
                  projects.forEach((p) => {
                    if (!p.created_at) return;
                    const k = monthKey(new Date(String(p.created_at)));
                    buckets[k] = (buckets[k] || 0) + 1;
                  });
                  const keys = Object.keys(buckets).sort();
                  const max = Math.max(1, ...Object.values(buckets));
                  return keys.slice(-6).map((k) => (
                    <div key={k}>
                      <div className="flex justify-between text-xs">
                        <span>{k}</span>
                        <span>{buckets[k]}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-sky-500" style={{ width: `${(buckets[k] / max) * 100}%` }} />
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {["all", "active", "completed", "delayed"].includes(activeTab) && showFullTabs ? (
        <div className="space-y-3">
          <TableSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search project name…"
            showClear={filtersActive}
            onClear={clearTableFilters}
            hint={`Showing ${activeTab === "active" ? activeList.length : activeTab === "completed" ? completedList.length : activeTab === "delayed" ? delayedList.length : filtered.length} project(s)`}
          />
          <ProjectsDataTable
            rows={activeTab === "active" ? activeList : activeTab === "completed" ? completedList : activeTab === "delayed" ? delayedList : filtered}
            loading={loading}
            clientMap={clientMap}
            clients={clients}
            employeeNameMap={employeeNameMap}
            employeeOpts={employeeOpts}
            teamMembers={teamMembers}
            isAdmin={isAdmin}
            canEdit={canEditProjectFields}
            fltStatus={fltStatus}
            setFltStatus={setFltStatus}
            fltPriority={fltPriority}
            setFltPriority={setFltPriority}
            fltManager={fltManager}
            setFltManager={setFltManager}
            fltClient={fltClient}
            setFltClient={setFltClient}
            fltDeadline={fltDeadline}
            setFltDeadline={setFltDeadline}
            onView={setViewProject}
            onEdit={openEdit}
            onDelete={(id) => void deleteProject(id)}
          />
        </div>
      ) : null}

      {activeTab === "team" && showFullTabs ? (
        <div className="responsive-table-wrap rounded-[20px] border border-[#dbe6f3] bg-white">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-[#f1f6fc] text-xs uppercase text-[#64748b]">
              <tr>
                <th className="px-4 py-3 text-left">Employee</th>
                <th className="px-4 py-3 text-left">Department</th>
                <th className="px-4 py-3 text-left">Projects</th>
                <th className="px-4 py-3 text-left">Workload</th>
              </tr>
            </thead>
            <tbody>
              {teamWorkload.map((row) => (
                <tr key={row.id} className={["border-t border-[#eef2ff]", row.overload ? "bg-rose-50/80" : ""].join(" ")}>
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3">{row.dept}</td>
                  <td className="px-4 py-3">{row.projects}</td>
                  <td className="px-4 py-3">{row.overload ? "High" : "Normal"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {activeTab === "timeline" && showFullTabs ? (
        <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4">
          <p className="text-sm text-[#64748b]">Latest project activities across all visible projects.</p>
          <ul className="mt-4 space-y-2">
            {activities.slice(0, 80).map((a) => (
              <li key={a.id} className="rounded-lg border border-[#e8edf5] px-3 py-2 text-sm">
                <span className="font-semibold text-[#0f172a]">{a.activity_type}</span>
                <span className="text-xs text-[#64748b]"> · {new Date(a.created_at).toLocaleString()}</span>
                <p className="text-xs text-[#475569]">{a.notes || ""}</p>
              </li>
            ))}
            {!activities.length ? <li className="text-sm text-[#64748b]">No activities yet.</li> : null}
          </ul>
        </div>
      ) : null}

      {activeTab === "budget" ? (
        <div className="space-y-4">
          <div className="stat-cards-grid">
            <LeadSummaryCard title="Total budget" value={`₹${Math.round(overview.revenue).toLocaleString()}`} loading={loading} />
            <LeadSummaryCard title="Advance received" value={`₹${Math.round(projects.reduce((a, p) => a + Number(p.advance_paid ?? 0), 0)).toLocaleString()}`} loading={loading} />
            <LeadSummaryCard title="Pending" value={`₹${Math.round(overview.pendingPay).toLocaleString()}`} loading={loading} />
            <LeadSummaryCard title="Overdue (delayed projects)" value={overview.delayed} loading={loading} accent="rose" />
          </div>
          <div className="overflow-x-auto rounded-[20px] border border-[#dbe6f3] bg-white">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-[#f1f6fc] text-xs uppercase text-[#64748b]">
                <tr>
                  <th className="px-4 py-3 text-left">Project</th>
                  <th className="px-4 py-3 text-left">Client</th>
                  <th className="px-4 py-3 text-left">Budget</th>
                  <th className="px-4 py-3 text-left">Paid</th>
                  <th className="px-4 py-3 text-left">Pending</th>
                  <th className="px-4 py-3 text-left">Deadline</th>
                  <th className="px-4 py-3 text-left">Payment status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const bud = Number(p.budget ?? 0);
                  const adv = Number(p.advance_paid ?? 0);
                  const pend = Number(p.pending_amount ?? Math.max(0, bud - adv));
                  let paySt = "Pending";
                  if (bud <= 0) paySt = "—";
                  else if (adv >= bud) paySt = "Paid";
                  else if (adv > 0) paySt = "Partially Paid";
                  if (pend > 0 && p.deadline && String(p.deadline).slice(0, 10) < today && normalizeProjectStatus(String(p.status)) !== "Completed") paySt = "Overdue";
                  return (
                    <tr key={p.id} className="border-t border-[#eef2ff]">
                      <td className="px-4 py-3 font-medium">{p.project_name}</td>
                      <td className="px-4 py-3">{p.client_id ? displayClientName(clientMap[p.client_id] || {}) : "—"}</td>
                      <td className="px-4 py-3">₹{bud.toLocaleString()}</td>
                      <td className="px-4 py-3">₹{adv.toLocaleString()}</td>
                      <td className="px-4 py-3">₹{pend.toLocaleString()}</td>
                      <td className="px-4 py-3">{p.deadline ? String(p.deadline).slice(0, 10) : "—"}</td>
                      <td className="px-4 py-3">{paySt}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {activeTab === "reports" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <LeadSummaryCard title="Completion rate" value={projects.length ? `${Math.round((overview.completed / projects.length) * 100)}%` : "0%"} loading={loading} />
          <LeadSummaryCard title="Delayed %" value={projects.length ? `${Math.round((overview.delayed / projects.length) * 100)}%` : "0%"} loading={loading} />
          <LeadSummaryCard title="Avg budget" value={projects.length ? `₹${Math.round(overview.revenue / projects.length).toLocaleString()}` : "—"} loading={loading} />
        </div>
      ) : null}

      {activeTab === "settings" ? (
        <div className="rounded-[20px] border border-[#dbe6f3] bg-[#f8fbff] p-6 text-sm text-[#475569]">
          <p className="font-semibold text-[#0f172a]">Project configuration</p>
          <p className="mt-2">Project types, status lists, priorities, and notification defaults are defined in the app today. Advanced editable settings (stored in Supabase) are coming soon.</p>
        </div>
      ) : null}

      {panelOpen ? (
        <ProjectFormPanel
          open={panelOpen}
          title={editId ? "Edit project" : "New project"}
          value={form}
          clients={clients}
          employees={employeeOpts}
          submitting={submitting}
          canEdit={canEditProjectFields}
          onChange={setForm}
          onClose={() => setPanelOpen(false)}
          onSubmit={() => void saveProject()}
        />
      ) : null}

      {viewProject ? (
        <ProjectViewDrawer
          project={viewProject}
          client={viewProject.client_id ? clientMap[viewProject.client_id] : undefined}
          managerName={viewProject.project_manager ? employeeNameMap[String(viewProject.project_manager)] : "—"}
          tasks={projectTasks}
          employeeNameMap={employeeNameMap}
          showCreateTaskLink={isAdmin}
          onClose={() => setViewProject(null)}
          onCreateTask={() => {
            window.open(`/admin/task-assignment?project=${viewProject.id}`, "_blank", "noopener,noreferrer");
          }}
        />
      ) : null}
    </section>
  );
}

function ProjectsDataTable({
  rows,
  loading,
  clientMap,
  clients,
  employeeNameMap,
  employeeOpts,
  teamMembers,
  isAdmin,
  canEdit,
  fltStatus,
  setFltStatus,
  fltPriority,
  setFltPriority,
  fltManager,
  setFltManager,
  fltClient,
  setFltClient,
  fltDeadline,
  setFltDeadline,
  onView,
  onEdit,
  onDelete,
}: {
  rows: ProjectRowLoose[];
  loading: boolean;
  clientMap: Record<string, ClientOption>;
  clients: ClientOption[];
  employeeNameMap: Record<string, string>;
  employeeOpts: { id: string; label: string }[];
  teamMembers: TeamMemberRow[];
  isAdmin: boolean;
  canEdit: boolean;
  fltStatus: string;
  setFltStatus: (s: string) => void;
  fltPriority: string;
  setFltPriority: (s: string) => void;
  fltManager: string;
  setFltManager: (s: string) => void;
  fltClient: string;
  setFltClient: (s: string) => void;
  fltDeadline: string;
  setFltDeadline: (s: string) => void;
  onView: (p: ProjectRowLoose) => void;
  onEdit: (p: ProjectRowLoose) => void;
  onDelete: (id: string) => void;
}) {
  const today = todayISO();
  return (
    <div className="overflow-x-auto rounded-[20px] border border-[#dbe6f3] bg-white shadow-sm">
      <table className="w-full min-w-[1100px] text-sm">
        <thead className="bg-[#f1f6fc] text-xs uppercase tracking-wide text-[#64748b]">
          <tr>
            <TableHeaderCell label="Code" className="px-4 py-3" />
            <TableHeaderCell label="Project" className="px-4 py-3" />
            <TableHeaderFilter
              label="Client"
              value={fltClient}
              onChange={setFltClient}
              options={clients.map((c) => ({ value: c.id, label: displayClientName(c) }))}
              allLabel="All clients"
              className="px-4 py-3"
            />
            <TableHeaderFilter
              label="Manager"
              value={fltManager}
              onChange={setFltManager}
              options={employeeOpts.map((e) => ({ value: e.id, label: e.label }))}
              allLabel="All managers"
              className="px-4 py-3"
            />
            <TableHeaderCell label="Team" className="px-4 py-3" />
            <TableHeaderCell label="Budget" className="px-4 py-3" />
            <TableHeaderCell label="Progress" className="px-4 py-3" />
            <TableHeaderFilter
              label="Status"
              value={fltStatus}
              onChange={setFltStatus}
              options={["Planning", "Active", "On Hold", "In Review", "Completed", "Cancelled", "Delayed"].map((s) => ({
                value: s,
                label: s,
              }))}
              allLabel="All statuses"
              className="px-4 py-3"
            />
            <TableHeaderFilter
              label="Priority"
              value={fltPriority}
              onChange={setFltPriority}
              options={["Low", "Medium", "High", "Urgent"].map((s) => ({ value: s, label: s }))}
              allLabel="All priorities"
              className="px-4 py-3"
            />
            <TableHeaderFilter
              label="Deadline"
              type="date"
              value={fltDeadline}
              onChange={setFltDeadline}
              className="px-4 py-3"
            />
            <TableHeaderCell label="Actions" className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={11} className="px-4 py-3">
                    <div className="h-5 animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ))
            : rows.map((p) => {
                const delayed = isDelayedProject(p, today);
                const urgent = (p.priority || "") === "Urgent";
                const tc = teamMembers.filter((t) => t.project_id === p.id).length;
                const dl = p.deadline ? String(p.deadline).slice(0, 10) : "";
                const near = dl && dl >= today && dl <= new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
                return (
                  <tr
                    key={p.id}
                    className={[delayed ? "bg-rose-50/90" : "", urgent ? "outline outline-1 outline-amber-300/80" : "", near ? "bg-amber-50/50" : ""].join(" ")}
                  >
                    <td className="px-4 py-3 font-mono text-xs">{p.project_code || "—"}</td>
                    <td className="px-4 py-3 font-semibold text-[#0f172a]">{p.project_name}</td>
                    <td className="max-w-[180px] truncate px-4 py-3">{p.client_id ? displayClientName(clientMap[p.client_id] || {}) : "—"}</td>
                    <td className="px-4 py-3">{p.project_manager ? employeeNameMap[String(p.project_manager)] : "—"}</td>
                    <td className="px-4 py-3">{tc}</td>
                    <td className="px-4 py-3">{p.budget != null ? `₹${Number(p.budget).toLocaleString()}` : "—"}</td>
                    <td className="px-4 py-3">{p.progress ?? 0}%</td>
                    <td className="px-4 py-3">{normalizeProjectStatus(String(p.status))}</td>
                    <td className="px-4 py-3">{p.priority || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3">{dl || "—"}</td>
                    <td className="space-x-2 whitespace-nowrap px-4 py-3 text-xs">
                      <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={() => onView(p)}>
                        View
                      </button>
                      {canEdit ? (
                        <button type="button" className="font-semibold text-slate-600 hover:underline" onClick={() => onEdit(p)}>
                          Edit
                        </button>
                      ) : null}
                      {isAdmin ? (
                        <button type="button" className="font-semibold text-rose-600 hover:underline" onClick={() => onDelete(p.id)}>
                          Delete
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
          {!loading && !rows.length ? (
            <tr>
              <td colSpan={11} className="px-6 py-10 text-center text-[#64748b]">
                No projects match filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function ProjectViewDrawer({
  project,
  client,
  managerName,
  tasks,
  employeeNameMap,
  showCreateTaskLink,
  onClose,
  onCreateTask,
}: {
  project: ProjectRowLoose;
  client?: ClientOption;
  managerName: string;
  tasks: TaskRecord[];
  employeeNameMap: Record<string, string>;
  showCreateTaskLink: boolean;
  onClose: () => void;
  onCreateTask: () => void;
}) {
  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-[60] bg-slate-900/40" onClick={onClose} />
      <div className="fixed inset-y-4 right-4 z-[61] flex w-full max-w-xl flex-col overflow-hidden rounded-[24px] border border-[#e8dcc8] bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#e8edf5] px-5 py-4">
          <div>
            <h3 className="text-xl font-semibold text-[#0f172a]">{project.project_name}</h3>
            <p className="text-xs text-[#64748b]">{project.project_code || "No code"}</p>
          </div>
          <button type="button" className="text-sm text-[#64748b]" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm">
          <section>
            <h4 className="text-xs font-semibold uppercase text-[#94a3b8]">Overview</h4>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-[#475569]">
              <dt className="text-xs text-[#94a3b8]">Client</dt>
              <dd className="font-medium">{client ? displayClientName(client) : "—"}</dd>
              <dt className="text-xs text-[#94a3b8]">Manager</dt>
              <dd>{managerName}</dd>
              <dt className="text-xs text-[#94a3b8]">Budget / Pending</dt>
              <dd>
                ₹{Number(project.budget ?? 0).toLocaleString()} / ₹{Number(project.pending_amount ?? 0).toLocaleString()}
              </dd>
              <dt className="text-xs text-[#94a3b8]">Progress</dt>
              <dd>{project.progress ?? 0}%</dd>
            </dl>
          </section>
          <section>
            <h4 className="text-xs font-semibold uppercase text-[#94a3b8]">Task summary</h4>
            <p className="mt-1 text-[#475569]">
              Total {project.total_tasks ?? 0} · Completed {project.completed_tasks ?? 0} · Delayed {project.delayed_tasks ?? 0}
            </p>
            {showCreateTaskLink ? (
              <Button type="button" variant="outline" className="mt-2 h-8 rounded-full text-xs" onClick={onCreateTask}>
                Create task in Task Assignment
              </Button>
            ) : (
              <p className="mt-2 text-xs text-[#64748b]">Ask an admin to create tasks linked to this project in Task Assignment.</p>
            )}
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
              {tasks.map((t) => (
                <li key={t.id} className="rounded border border-[#e8edf5] px-2 py-1">
                  {t.title} · {t.status} ·{" "}
                  {(t.assigned_to && employeeNameMap[t.assigned_to]) ||
                    (t as { assignee_name?: string }).assignee_name ||
                    (t.assigned_to ? t.assigned_to.slice(0, 6) : "—")}
                </li>
              ))}
              {!tasks.length ? <li className="text-[#64748b]">No tasks linked to this project.</li> : null}
            </ul>
          </section>
          <section>
            <h4 className="text-xs font-semibold uppercase text-[#94a3b8]">Notes</h4>
            <p className="mt-1 whitespace-pre-wrap text-[#475569]">{project.notes || "—"}</p>
          </section>
          <section>
            <h4 className="text-xs font-semibold uppercase text-[#94a3b8]">Documents</h4>
            <p className="text-xs text-[#64748b]">Link proposal/agreement from Client profile or attach files in a future release.</p>
          </section>
        </div>
      </div>
    </>
  );
}
