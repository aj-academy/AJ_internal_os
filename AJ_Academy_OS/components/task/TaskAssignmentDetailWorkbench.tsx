"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TaskSubsectionCollegesTable,
  TaskSubsectionLeadsTable,
  flattenTaskColleges,
  flattenTaskLeads,
} from "@/components/task/TaskSubsectionEntityTables";
import { TaskTable } from "@/components/task/TaskTable";
import { fetchTaskActivities, type TaskActivityRow } from "@/lib/taskActivities";
import { formatDisplayDate } from "@/lib/datetime";
import type { createClient } from "@/lib/supabase/client";
import type { CrmClientRow } from "@/components/student-lead-master/studentMasterHelpers";
import type { CollegeVisitRow } from "@/components/college-visits/collegeVisitsHelpers";
import type { TaskPriority, TaskRecord, TaskStatus } from "@/types/task";

type TaskAssignmentDetailWorkbenchProps = {
  task: TaskRecord;
  employeeNameMap: Record<string, string>;
  linkedLeadById: Record<string, CrmClientRow>;
  linkedCollegeById: Record<string, CollegeVisitRow>;
  loading?: boolean;
  canManageTasks: boolean;
  readOnlyList?: boolean;
  showAssignedTo?: boolean;
  showAssignedBy?: boolean;
  currentUserId?: string;
  supabase?: ReturnType<typeof createClient>;
  onClose: () => void;
  onReload: () => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
  onViewLead: (task: TaskRecord, lead: CrmClientRow, leadLoaded: boolean) => void;
  onActivityLead: (task: TaskRecord, lead: CrmClientRow) => void;
  onViewCollege: (task: TaskRecord, college: CollegeVisitRow, collegeLoaded: boolean) => void;
  onActivityCollege: (task: TaskRecord, college: CollegeVisitRow) => void;
  onEditCollege: (task: TaskRecord, college: CollegeVisitRow, collegeLoaded: boolean) => void;
  onEditTask: (task: TaskRecord) => void;
  onDeleteTask: (taskId: string) => void;
  onEmployeeStatusChange: (taskId: string, status: TaskStatus, progress: number) => void;
  onEmployeeProgressChange: (taskId: string, status: TaskStatus, progress: number) => void;
  onRequestCompleteTask?: (task: TaskRecord) => void;
};

function typeLabel(task: TaskRecord): string {
  if (task.assignment_type === "lead") return "Student Lead";
  if (task.assignment_type === "college") return "College Visit";
  if (task.assignment_type === "project") return "Project";
  return "General";
}

export function TaskAssignmentDetailWorkbench({
  task,
  employeeNameMap,
  linkedLeadById,
  linkedCollegeById,
  loading,
  canManageTasks,
  readOnlyList = false,
  showAssignedTo = true,
  showAssignedBy = true,
  currentUserId,
  supabase,
  onClose,
  onReload,
  onError,
  onSuccess,
  onViewLead,
  onActivityLead,
  onViewCollege,
  onActivityCollege,
  onEditCollege,
  onEditTask,
  onDeleteTask,
  onEmployeeStatusChange,
  onEmployeeProgressChange,
  onRequestCompleteTask,
}: TaskAssignmentDetailWorkbenchProps) {
  const [activities, setActivities] = useState<TaskActivityRow[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);

  const assignee =
    (task.assigned_to && employeeNameMap[task.assigned_to]) || task.assignee_name || "Unknown";

  const leadRows = useMemo(() => flattenTaskLeads([task], linkedLeadById), [task, linkedLeadById]);
  const collegeRows = useMemo(() => flattenTaskColleges([task], linkedCollegeById), [task, linkedCollegeById]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    setActivitiesLoading(true);
    void (async () => {
      try {
        const rows = await fetchTaskActivities(supabase, task.id);
        if (!cancelled) setActivities(rows);
      } catch {
        if (!cancelled) setActivities([]);
      } finally {
        if (!cancelled) setActivitiesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, task.id]);

  const noopFilter = () => undefined;

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-[#f4f7fb]">
      <div className="mx-auto max-w-[1680px] space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" className="rounded-full border-[#dbe6f3]" onClick={onClose}>
            ← Back to task list
          </Button>
          <div className="flex flex-wrap gap-2">
            {canManageTasks && !readOnlyList ? (
              <>
                <Button type="button" variant="outline" className="rounded-full" onClick={() => onEditTask(task)}>
                  Edit task
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full text-rose-700 hover:bg-rose-50"
                  onClick={() => onDeleteTask(task.id)}
                >
                  Delete task
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <section className="rounded-2xl border border-[#c9a227] bg-[#fffdf8] p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#a68b2e]">Task assignment</p>
          <h2 className="mt-1 text-2xl font-semibold text-[#0f172a]">{task.title}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge className="border-[#dbe6f3] bg-white text-[#334155]">{typeLabel(task)}</Badge>
            <Badge className="border-[#dbe6f3] bg-white text-[#334155]">{task.status}</Badge>
            <Badge className="border-[#dbe6f3] bg-white text-[#334155]">{task.priority} priority</Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {showAssignedBy ? (
              <div className="rounded-xl border border-[#e8dcc8] bg-white px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8]">Assigned by</p>
                <p className="mt-1 text-sm font-medium text-[#0f172a]">{task.assigner_display_name || "—"}</p>
              </div>
            ) : null}
            {showAssignedTo ? (
              <div className="rounded-xl border border-[#e8dcc8] bg-white px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8]">Assigned to</p>
                <p className="mt-1 text-sm font-medium text-[#0f172a]">{assignee}</p>
              </div>
            ) : null}
            <div className="rounded-xl border border-[#e8dcc8] bg-white px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8]">Assigned on</p>
              <p className="mt-1 text-sm font-medium text-[#0f172a]">{formatDisplayDate(task.created_at, "—")}</p>
            </div>
            <div className="rounded-xl border border-[#e8dcc8] bg-white px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8]">Due date</p>
              <p className="mt-1 text-sm font-medium text-[#0f172a]">{formatDisplayDate(task.due_date, "—")}</p>
            </div>
          </div>
          {task.description ? (
            <p className="mt-4 rounded-xl border border-[#e8edf5] bg-white px-3 py-2 text-sm text-[#475569]">
              {task.description}
            </p>
          ) : null}
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="space-y-3 rounded-2xl border border-[#dbe6f3] bg-white p-4 shadow-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#a68b2e]">Linked records</p>
              <h3 className="text-lg font-semibold text-[#0f172a]">Full table view</h3>
              <p className="mt-1 text-sm text-[#64748b]">
                Same columns as Student Lead, College Visit, or Project sections — work and outreach happen here.
              </p>
            </div>

            {task.assignment_type === "lead" ? (
              <TaskSubsectionLeadsTable
                rows={leadRows}
                employeeNameMap={employeeNameMap}
                loading={loading}
                onViewLead={onViewLead}
                onActivityLead={onActivityLead}
                currentUserId={currentUserId}
                supabase={supabase}
                onOutreachUpdated={onReload}
                onOutreachError={onError}
                onOutreachSuccess={onSuccess}
              />
            ) : null}

            {task.assignment_type === "college" ? (
              <TaskSubsectionCollegesTable
                rows={collegeRows}
                ownerNameMap={employeeNameMap}
                loading={loading}
                onViewCollege={onViewCollege}
                onActivityCollege={onActivityCollege}
                onEditCollege={onEditCollege}
                currentUserId={currentUserId}
                supabase={supabase}
                onOutreachUpdated={onReload}
                onOutreachError={onError}
                onOutreachSuccess={onSuccess}
              />
            ) : null}

            {task.assignment_type === "project" || !task.assignment_type || task.assignment_type === null ? (
              <TaskTable
                tasks={[task]}
                loading={Boolean(loading)}
                employeeNameMap={employeeNameMap}
                canManageTasks={canManageTasks}
                assigneeColumn={showAssignedTo ? "assigned-to" : "assigned-by"}
                readOnlyList={readOnlyList}
                linkTypePreset={task.assignment_type === "project" ? "project" : "all"}
                showLinkedColumn
                statusFilter=""
                setStatusFilter={noopFilter as (v: TaskStatus | "") => void}
                priorityFilter=""
                setPriorityFilter={noopFilter as (v: TaskPriority | "") => void}
                assignedFilter=""
                setAssignedFilter={noopFilter as (v: string) => void}
                dueDateFilter=""
                setDueDateFilter={noopFilter as (v: string) => void}
                employeeOptions={[]}
                assigneeFilterDisabled
                filtersDisabled
                onView={() => undefined}
                onEdit={onEditTask}
                onDelete={onDeleteTask}
                onEmployeeStatusChange={onEmployeeStatusChange}
                onEmployeeProgressChange={onEmployeeProgressChange}
                onRequestCompleteTask={onRequestCompleteTask}
                showLeadOutreach={Boolean(currentUserId && supabase)}
                currentUserId={currentUserId}
                supabase={supabase}
                onLeadOutreachUpdated={onReload}
                onLeadOutreachError={onError}
                onLeadOutreachSuccess={onSuccess}
              />
            ) : null}
          </section>

          <aside className="rounded-2xl border border-[#dbe6f3] bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#a68b2e]">Activity</p>
            <h3 className="text-lg font-semibold text-[#0f172a]">What the employee did</h3>
            <p className="mt-1 text-sm text-[#64748b]">
              Calls, WhatsApp, email, status updates, and notes appear here for admin tracking.
            </p>
            <div className="mt-4 max-h-[70vh] space-y-2 overflow-y-auto">
              {activitiesLoading ? (
                <p className="text-xs text-[#64748b]">Loading activity…</p>
              ) : activities.length ? (
                activities.map((a) => (
                  <div key={a.id} className="rounded-lg border border-[#e8edf5] bg-[#f8fbff] px-3 py-2 text-xs">
                    <p className="font-medium text-[#0f172a]">
                      {a.activity_type.replace(/_/g, " ")}
                      {a.actor_name ? ` · ${a.actor_name}` : ""}
                    </p>
                    {a.notes ? <p className="mt-1 whitespace-pre-wrap text-[#475569]">{a.notes}</p> : null}
                    <p className="mt-1 text-[#94a3b8]">{new Date(a.created_at).toLocaleString("en-IN")}</p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-[#64748b]">No activity logged yet.</p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
