"use client";

import { Badge } from "@/components/ui/badge";
import { TableHeaderCell, TableHeaderFilter } from "@/components/ui/TableHeaderFilter";
import { ProgressBar } from "@/components/task/ProgressBar";
import type { TaskPriority, TaskRecord, TaskStatus } from "@/types/task";

interface TaskTableProps {
  tasks: TaskRecord[];
  loading: boolean;
  tableMissing?: boolean;
  employeeNameMap: Record<string, string>;
  /** Admin or manager: full task management UI */
  canManageTasks: boolean;
  /** Assignee-only portals: show who assigned the task instead of assignee picker column */
  assigneeColumn?: "assigned-to" | "assigned-by";
  statusFilter: TaskStatus | "";
  setStatusFilter: (value: TaskStatus | "") => void;
  priorityFilter: TaskPriority | "";
  setPriorityFilter: (value: TaskPriority | "") => void;
  assignedFilter: string;
  setAssignedFilter: (value: string) => void;
  dueDateFilter: string;
  setDueDateFilter: (value: string) => void;
  employeeOptions: { id: string; label: string }[];
  assigneeFilterDisabled?: boolean;
  filtersDisabled?: boolean;
  onView: (task: TaskRecord) => void;
  onEdit: (task: TaskRecord) => void;
  onDelete: (taskId: string) => void;
  onEmployeeStatusChange: (taskId: string, status: TaskStatus, progress: number) => void;
  onEmployeeProgressChange: (taskId: string, status: TaskStatus, progress: number) => void;
  /** Assignee opens completion dialog (summary + notify assigner). */
  onRequestCompleteTask?: (task: TaskRecord) => void;
}

const statusClassMap: Record<TaskStatus, string> = {
  Pending: "bg-slate-100 text-slate-700 border-slate-200",
  "In Progress": "bg-blue-100 text-blue-700 border-blue-200",
  Completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const priorityClassMap: Record<TaskPriority, string> = {
  Low: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Medium: "bg-orange-100 text-orange-700 border-orange-200",
  High: "bg-rose-100 text-rose-700 border-rose-200",
};

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

export function TaskTable({
  tasks,
  loading,
  tableMissing = false,
  employeeNameMap,
  canManageTasks,
  assigneeColumn = "assigned-to",
  statusFilter,
  setStatusFilter,
  priorityFilter,
  setPriorityFilter,
  assignedFilter,
  setAssignedFilter,
  dueDateFilter,
  setDueDateFilter,
  employeeOptions,
  assigneeFilterDisabled = false,
  filtersDisabled = false,
  onView,
  onEdit,
  onDelete,
  onEmployeeStatusChange,
  onEmployeeProgressChange,
  onRequestCompleteTask,
}: TaskTableProps) {
  const today = todayDateKey();
  const disabled = tableMissing || filtersDisabled;
  const showAssignedTo = assigneeColumn === "assigned-to";
  const showAssignedBy = assigneeColumn === "assigned-by";
  const columnCount = showAssignedTo || showAssignedBy ? 8 : 7;

  return (
    <article className="overflow-hidden rounded-[20px] border border-[#dbe6f3] bg-white shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
      <div className="overflow-x-auto">
        <table className={`w-full text-sm ${showAssignedTo || showAssignedBy ? "min-w-[1160px]" : "min-w-[980px]"}`}>
          <thead className="bg-[#f1f6fc] text-xs uppercase tracking-wide text-[#64748b]">
            <tr>
              <TableHeaderCell label="Task Title" className="px-4 py-3 text-center" />
              {showAssignedTo ? (
                <TableHeaderFilter
                  label="Assigned To"
                  value={assignedFilter}
                  onChange={setAssignedFilter}
                  options={employeeOptions.map((e) => ({ value: e.id, label: e.label }))}
                  allLabel="All employees"
                  disabled={disabled || assigneeFilterDisabled}
                  className="px-4 py-3"
                />
              ) : null}
              {showAssignedBy ? (
                <TableHeaderCell label="Assigned By" className="px-4 py-3 text-center" />
              ) : null}
              <TableHeaderFilter
                label="Priority"
                value={priorityFilter}
                onChange={(v) => setPriorityFilter(v as TaskPriority | "")}
                options={[
                  { value: "Low", label: "Low" },
                  { value: "Medium", label: "Medium" },
                  { value: "High", label: "High" },
                ]}
                allLabel="All priorities"
                disabled={disabled}
                className="px-4 py-3"
              />
              <TableHeaderFilter
                label="Status"
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as TaskStatus | "")}
                options={[
                  { value: "Pending", label: "Pending" },
                  { value: "In Progress", label: "In Progress" },
                  { value: "Completed", label: "Completed" },
                ]}
                allLabel="All statuses"
                disabled={disabled}
                className="px-4 py-3"
              />
              <TableHeaderCell label="Start Date" className="px-4 py-3 text-center" />
              <TableHeaderFilter
                label="Due Date"
                type="date"
                value={dueDateFilter}
                onChange={setDueDateFilter}
                disabled={disabled}
                className="px-4 py-3"
              />
              <TableHeaderCell label="Progress" className="px-4 py-3 text-center" />
              <TableHeaderCell label="Actions" className="px-4 py-3 text-center" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e8edf5] text-[#334155]">
            {loading
              ? Array.from({ length: 5 }).map((_, index) => (
                  <tr key={`skeleton-${index}`}>
                    <td colSpan={columnCount} className="px-4 py-3">
                      <div className="h-6 animate-pulse rounded-md bg-[#e8edf5]" />
                    </td>
                  </tr>
                ))
              : tasks.map((task) => {
                  const dueDate = task.due_date;
                  const isOverdue = dueDate ? dueDate < today && task.status !== "Completed" : false;
                  const isDueToday = dueDate === today;
                  return (
                    <tr
                      key={task.id}
                      className={[
                        isOverdue ? "border-l-4 border-l-rose-500 bg-rose-50/70" : "",
                        isDueToday ? "bg-amber-50/70" : "",
                      ].join(" ")}
                    >
                      <td className="px-4 py-3.5 align-middle font-medium text-[#0f172a]">{task.title}</td>
                      {showAssignedTo ? (
                        <td className="px-4 py-3.5 align-middle">
                          {(task.assigned_to && employeeNameMap[task.assigned_to]) ||
                            task.assignee_name ||
                            "Unknown"}
                        </td>
                      ) : null}
                      {showAssignedBy ? (
                        <td className="px-4 py-3.5 align-middle">{task.assigner_display_name || "—"}</td>
                      ) : null}
                      <td className="px-4 py-3.5 align-middle">
                        <Badge className={priorityClassMap[task.priority]}>{task.priority}</Badge>
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <Badge className={statusClassMap[task.status]}>{task.status}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 align-middle">{task.start_date || "-"}</td>
                      <td
                        className={["whitespace-nowrap px-4 py-3.5 align-middle", isOverdue ? "font-semibold text-rose-700" : ""].join(" ")}
                      >
                        {task.due_date || "-"}
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        {canManageTasks ? (
                          <ProgressBar value={task.progress} />
                        ) : (
                          <div className="space-y-2">
                            <ProgressBar value={task.progress} />
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={5}
                              value={task.progress}
                              disabled={disabled}
                              onChange={(event) =>
                                onEmployeeProgressChange(task.id, task.status, Number(event.target.value))
                              }
                              className="w-full disabled:opacity-50"
                            />
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 align-middle">
                        <div className="flex items-center justify-center gap-3">
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => onView(task)}
                            className="text-xs font-medium text-[#a68b2e] hover:underline disabled:opacity-40"
                          >
                            View Task
                          </button>
                          {canManageTasks ? (
                            <>
                              <button
                                type="button"
                                disabled={disabled}
                                onClick={() => onEdit(task)}
                                className="text-xs font-medium text-[#475569] hover:underline disabled:opacity-40"
                              >
                                Edit Task
                              </button>
                              <button
                                type="button"
                                disabled={disabled}
                                onClick={() => onDelete(task.id)}
                                className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-40"
                              >
                                Delete Task
                              </button>
                            </>
                          ) : (
                            <>
                              <select
                                value={task.status}
                                disabled={disabled}
                                onChange={(event) =>
                                  onEmployeeStatusChange(task.id, event.target.value as TaskStatus, task.progress)
                                }
                                className="h-7 rounded-md border border-[#e8dcc8] bg-white px-2 text-xs text-[#334155] outline-none disabled:opacity-50"
                              >
                                <option value="Pending">Pending</option>
                                <option value="In Progress">In Progress</option>
                              </select>
                              {onRequestCompleteTask && task.status !== "Completed" ? (
                                <button
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => onRequestCompleteTask(task)}
                                  className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                                >
                                  Task completed
                                </button>
                              ) : null}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            {!loading && !tasks.length ? (
              <tr>
                <td colSpan={columnCount} className="px-4 py-8 text-center text-[#64748b]">
                  {tableMissing
                    ? "Tasks will appear here after the database script is applied and you refresh."
                    : "No tasks found for current filters."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </article>
  );
}
