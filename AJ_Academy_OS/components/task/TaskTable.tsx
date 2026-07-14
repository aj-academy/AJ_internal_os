"use client";

import { Badge } from "@/components/ui/badge";
import { TableHeaderCell, TableHeaderFilter } from "@/components/ui/TableHeaderFilter";
import { ProgressBar } from "@/components/task/ProgressBar";
import { TablePagination } from "@/components/ui/TablePagination";
import { TableBulkCheckbox } from "@/components/ui/TableBulkCheckbox";
import { MobileRecordCard } from "@/components/ui/MobileRecordCard";
import {
  ResponsiveDataView,
  TABLE_CHECK_TH,
  TABLE_CHECK_TD,
} from "@/components/ui/ResponsiveDataView";
import { formatDisplayDate } from "@/lib/datetime";
import { TaskLeadOutreachBlock } from "@/components/task/TaskLeadOutreachBlock";
import type { createClient } from "@/lib/supabase/client";
import type { TaskAssignmentType, TaskPriority, TaskRecord, TaskStatus } from "@/types/task";

interface TaskTableProps {
  tasks: TaskRecord[];
  loading: boolean;
  tableMissing?: boolean;
  employeeNameMap: Record<string, string>;
  /** Admin or manager: full task management UI */
  canManageTasks: boolean;
  /** Assignee-only portals: show who assigned the task instead of assignee picker column */
  assigneeColumn?: "assigned-to" | "assigned-by";
  showDepartment?: boolean;
  /** Delegated tasks list: view-only (no status/progress edits). */
  readOnlyList?: boolean;
  /** Filter preset drives Linked To label and Lead Contact column. */
  linkTypePreset?: TaskAssignmentType | "all";
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
  showLeadOutreach?: boolean;
  currentUserId?: string;
  supabase?: ReturnType<typeof createClient>;
  onLeadOutreachUpdated?: () => void;
  onLeadOutreachError?: (message: string) => void;
  onLeadOutreachSuccess?: (message: string) => void;
  pagination?: {
    page: number;
    totalPages: number;
    totalItems: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
  };
  selection?: {
    allSelected: boolean;
    someSelected: boolean;
    isSelected: (id: string) => boolean;
    onToggleAll: () => void;
    onToggle: (id: string) => void;
  };
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

function linkedLabel(task: TaskRecord): string {
  if (task.assignment_type === "project" && task.project_label) return task.project_label;
  if (task.assignment_type === "lead" && task.linked_lead_labels?.length) {
    return task.linked_lead_labels.length === 1
      ? task.linked_lead_labels[0]
      : `${task.linked_lead_labels.length} leads`;
  }
  if (task.assignment_type === "college" && task.linked_college_labels?.length) {
    return task.linked_college_labels.length === 1
      ? task.linked_college_labels[0]
      : `${task.linked_college_labels.length} colleges`;
  }
  return "—";
}

export function TaskTable({
  tasks,
  loading,
  tableMissing = false,
  employeeNameMap,
  canManageTasks,
  assigneeColumn = "assigned-to",
  showDepartment = false,
  readOnlyList = false,
  linkTypePreset = "all",
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
  showLeadOutreach = false,
  currentUserId = "",
  supabase,
  onLeadOutreachUpdated,
  onLeadOutreachError,
  onLeadOutreachSuccess,
  pagination,
  selection,
}: TaskTableProps) {
  const today = todayDateKey();
  const disabled = tableMissing || filtersDisabled;
  const showAssignedTo = assigneeColumn === "assigned-to";
  const showAssignedBy = assigneeColumn === "assigned-by";
  const showSelection = Boolean(selection);
  const showContact =
    showLeadOutreach && (linkTypePreset === "all" || linkTypePreset === "lead");
  const linkedHeader =
    linkTypePreset === "project"
      ? "Project"
      : linkTypePreset === "college"
        ? "College"
        : linkTypePreset === "lead"
          ? "Student Lead(s)"
          : "Linked To";
  const columnCount =
    8 +
    (showSelection ? 1 : 0) +
    (showAssignedTo || showAssignedBy ? 1 : 0) +
    (showDepartment ? 1 : 0) +
    (showContact ? 1 : 0);
  const minWidth = showAssignedTo || showAssignedBy ? "1280px" : "1100px";
  const emptyMessage = tableMissing
    ? "Tasks will appear here after the database script is applied and you refresh."
    : "No tasks found for current filters.";

  return (
    <article className="overflow-hidden rounded-[20px] border border-[#dbe6f3] bg-white shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
      <ResponsiveDataView
        selectAll={
          showSelection
            ? {
                checked: selection!.allSelected,
                indeterminate: selection!.someSelected,
                onChange: selection!.onToggleAll,
                label: "Select all",
                countLabel: `${tasks.filter((t) => selection!.isSelected(t.id)).length} selected`,
              }
            : undefined
        }
        desktop={
          <div className="responsive-table-wrap">
            <table className="w-full text-sm" style={{ minWidth }}>
              <thead className="bg-[#f1f6fc] text-xs uppercase tracking-wide text-[#64748b]">
                <tr>
                  {showSelection ? (
                    <th className={TABLE_CHECK_TH}>
                      <div className="flex justify-center">
                        <TableBulkCheckbox
                          checked={selection!.allSelected}
                          indeterminate={selection!.someSelected}
                          disabled={disabled || !tasks.length}
                          onChange={selection!.onToggleAll}
                          ariaLabel="Select all tasks on this page"
                        />
                      </div>
                    </th>
                  ) : null}
                  <TableHeaderCell label="Task Title" className="px-4 py-3 text-center" />
                  <TableHeaderCell label={linkedHeader} className="px-4 py-3 text-center" />
                  {showContact ? (
                    <TableHeaderCell label="Lead Contact" className="px-4 py-3 text-center" />
                  ) : null}
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
                  {showDepartment ? (
                    <TableHeaderCell label="Department" className="px-4 py-3 text-center" />
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
                          {showSelection ? (
                            <td className={TABLE_CHECK_TD}>
                              <div className="flex justify-center">
                                <TableBulkCheckbox
                                  checked={selection!.isSelected(task.id)}
                                  disabled={disabled}
                                  onChange={() => selection!.onToggle(task.id)}
                                  ariaLabel={`Select task ${task.title}`}
                                />
                              </div>
                            </td>
                          ) : null}
                          <td className="px-4 py-3.5 align-middle font-medium text-[#0f172a]">{task.title}</td>
                          <td className="max-w-[200px] px-4 py-3.5 align-middle text-xs text-[#475569]">
                            {task.assignment_type === "project" && task.project_label ? (
                              <span className="font-medium text-[#0f172a]">{task.project_label}</span>
                            ) : task.assignment_type === "lead" && task.linked_lead_labels?.length ? (
                              <span title={task.linked_lead_labels.join(", ")}>
                                {task.linked_lead_labels.length === 1
                                  ? task.linked_lead_labels[0]
                                  : `${task.linked_lead_labels.length} leads`}
                              </span>
                            ) : task.assignment_type === "college" && task.linked_college_labels?.length ? (
                              <span title={task.linked_college_labels.join(", ")}>
                                {task.linked_college_labels.length === 1
                                  ? task.linked_college_labels[0]
                                  : `${task.linked_college_labels.length} colleges`}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          {showContact ? (
                            <td className="px-4 py-3.5 align-middle">
                              {task.assignment_type === "lead" && task.linked_leads?.length && currentUserId && supabase ? (
                                <TaskLeadOutreachBlock
                                  taskId={task.id}
                                  leads={task.linked_leads}
                                  supabase={supabase}
                                  userId={currentUserId}
                                  compact
                                  onUpdated={onLeadOutreachUpdated}
                                  onError={onLeadOutreachError}
                                  onSuccess={onLeadOutreachSuccess}
                                />
                              ) : (
                                "—"
                              )}
                            </td>
                          ) : null}
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
                          {showDepartment ? (
                            <td className="px-4 py-3.5 align-middle">
                              {showAssignedBy
                                ? task.assigner_department || "—"
                                : task.assignee_department || "—"}
                            </td>
                          ) : null}
                          <td className="px-4 py-3.5 align-middle">
                            <Badge className={priorityClassMap[task.priority]}>{task.priority}</Badge>
                          </td>
                          <td className="px-4 py-3.5 align-middle">
                            <Badge className={statusClassMap[task.status]}>{task.status}</Badge>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 align-middle">{formatDisplayDate(task.start_date, "-")}</td>
                          <td
                            className={["whitespace-nowrap px-4 py-3.5 align-middle", isOverdue ? "font-semibold text-rose-700" : ""].join(" ")}
                          >
                            {formatDisplayDate(task.due_date, "-")}
                          </td>
                          <td className="px-4 py-3.5 align-middle">
                            {canManageTasks || readOnlyList ? (
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
                                View / Activity
                              </button>
                              {readOnlyList ? null : canManageTasks ? (
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
                      {emptyMessage}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        }
        mobile={
          loading ? (
            <p className="rounded-2xl border border-[#e8dcc8] bg-white px-4 py-8 text-center text-sm text-[#64748b]">
              Loading…
            </p>
          ) : !tasks.length ? (
            <p className="rounded-2xl border border-[#e8dcc8] bg-white px-4 py-8 text-center text-sm text-[#64748b]">
              {emptyMessage}
            </p>
          ) : (
            tasks.map((task) => {
              const dueDate = task.due_date;
              const isOverdue = dueDate ? dueDate < today && task.status !== "Completed" : false;
              const assignee =
                (task.assigned_to && employeeNameMap[task.assigned_to]) || task.assignee_name || "Unknown";
              const primaryActions = [
                {
                  label: "View",
                  onClick: () => {
                    if (!disabled) onView(task);
                  },
                },
              ];
              if (!readOnlyList && canManageTasks) {
                primaryActions.push({
                  label: "Edit",
                  onClick: () => {
                    if (!disabled) onEdit(task);
                  },
                });
              }
              if (!readOnlyList && !canManageTasks && onRequestCompleteTask && task.status !== "Completed") {
                primaryActions.push({
                  label: "Complete",
                  onClick: () => {
                    if (!disabled) onRequestCompleteTask(task);
                  },
                });
              }
              const moreActions: { label: string; onClick: () => void; destructive?: boolean }[] = [];
              if (!readOnlyList && canManageTasks) {
                moreActions.push({
                  label: "Delete Task",
                  destructive: true,
                  onClick: () => {
                    if (!disabled) onDelete(task.id);
                  },
                });
              }
              if (!readOnlyList && !canManageTasks) {
                if (task.status !== "Pending") {
                  moreActions.push({
                    label: "Set Pending",
                    onClick: () => {
                      if (!disabled) onEmployeeStatusChange(task.id, "Pending", task.progress);
                    },
                  });
                }
                if (task.status !== "In Progress") {
                  moreActions.push({
                    label: "Set In Progress",
                    onClick: () => {
                      if (!disabled) onEmployeeStatusChange(task.id, "In Progress", task.progress);
                    },
                  });
                }
              }

              return (
                <MobileRecordCard
                  key={task.id}
                  title={task.title}
                  subtitle={isOverdue ? "Overdue" : dueDate === today ? "Due today" : undefined}
                  showSelect={showSelection}
                  selected={showSelection ? selection!.isSelected(task.id) : false}
                  onToggleSelect={showSelection ? () => selection!.onToggle(task.id) : undefined}
                  selectAriaLabel={`Select task ${task.title}`}
                  previewFields={[
                    { label: linkedHeader, value: linkedLabel(task) },
                    { label: "Priority", value: task.priority },
                    { label: "Status", value: task.status },
                    { label: "Due", value: formatDisplayDate(task.due_date, "—") },
                    ...(showAssignedTo ? [{ label: "Assigned To", value: assignee }] : []),
                    ...(showAssignedBy
                      ? [{ label: "Assigned By", value: task.assigner_display_name || "—" }]
                      : []),
                  ]}
                  detailFields={[
                    { label: "Task Title", value: task.title },
                    { label: linkedHeader, value: linkedLabel(task) },
                    ...(showAssignedTo ? [{ label: "Assigned To", value: assignee }] : []),
                    ...(showAssignedBy
                      ? [{ label: "Assigned By", value: task.assigner_display_name || "—" }]
                      : []),
                    ...(showDepartment
                      ? [
                          {
                            label: "Department",
                            value: showAssignedBy
                              ? task.assigner_department || "—"
                              : task.assignee_department || "—",
                          },
                        ]
                      : []),
                    { label: "Priority", value: task.priority },
                    { label: "Status", value: task.status },
                    { label: "Start Date", value: formatDisplayDate(task.start_date, "—") },
                    { label: "Due Date", value: formatDisplayDate(task.due_date, "—") },
                    { label: "Progress", value: `${task.progress}%` },
                  ]}
                  primaryActions={primaryActions}
                  moreActions={moreActions}
                  className={
                    isOverdue
                      ? "border-rose-200 bg-rose-50/70"
                      : dueDate === today
                        ? "border-amber-200 bg-amber-50/70"
                        : undefined
                  }
                />
              );
            })
          )
        }
      />
      {pagination ? (
        <TablePagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          pageSize={pagination.pageSize}
          onPageChange={pagination.onPageChange}
          onPageSizeChange={pagination.onPageSizeChange}
          className="rounded-b-[20px]"
        />
      ) : null}
    </article>
  );
}
