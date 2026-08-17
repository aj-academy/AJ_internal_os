"use client";

import { Badge } from "@/components/ui/badge";
import { TableBulkCheckbox } from "@/components/ui/TableBulkCheckbox";
import { formatDisplayDate } from "@/lib/datetime";
import type { TaskRecord } from "@/types/task";

type TaskAssignmentRowListProps = {
  tasks: TaskRecord[];
  loading?: boolean;
  employeeNameMap: Record<string, string>;
  showAssignedTo?: boolean;
  showAssignedBy?: boolean;
  selection?: {
    allSelected: boolean;
    someSelected: boolean;
    isSelected: (id: string) => boolean;
    onToggleAll: () => void;
    onToggle: (id: string) => void;
  };
  onOpenTask: (task: TaskRecord) => void;
};

function typeLabel(task: TaskRecord): string {
  if (task.assignment_type === "lead") return "Student Lead";
  if (task.assignment_type === "college") return "College Visit";
  if (task.assignment_type === "project") return "Project";
  return "General";
}

function linkedSummary(task: TaskRecord): string {
  if (task.assignment_type === "lead") {
    const n = task.client_ids?.length ?? task.linked_lead_labels?.length ?? 0;
    return n ? `${n} lead${n === 1 ? "" : "s"}` : "No leads linked";
  }
  if (task.assignment_type === "college") {
    const n = task.college_visit_ids?.length ?? task.linked_college_labels?.length ?? 0;
    return n ? `${n} college${n === 1 ? "" : "s"}` : "No colleges linked";
  }
  if (task.assignment_type === "project") return task.project_label || "Project linked";
  return "—";
}

const statusClass: Record<string, string> = {
  Pending: "bg-slate-100 text-slate-700 border-slate-200",
  "In Progress": "bg-blue-100 text-blue-700 border-blue-200",
  Completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export function TaskAssignmentRowList({
  tasks,
  loading,
  employeeNameMap,
  showAssignedTo = true,
  showAssignedBy = true,
  selection,
  onOpenTask,
}: TaskAssignmentRowListProps) {
  const showSelection = Boolean(selection);

  if (loading) {
    return (
      <div className="rounded-[20px] border border-[#dbe6f3] bg-white px-4 py-10 text-center text-sm text-[#64748b]">
        Loading tasks…
      </div>
    );
  }

  if (!tasks.length) {
    return (
      <div className="rounded-[20px] border border-[#dbe6f3] bg-white px-4 py-10 text-center text-sm text-[#64748b]">
        No tasks found for current filters.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[20px] border border-[#dbe6f3] bg-white shadow-sm">
      {showSelection ? (
        <div className="flex items-center gap-3 border-b border-[#e8edf5] bg-[#f8fbff] px-4 py-2">
          <TableBulkCheckbox
            checked={selection!.allSelected}
            indeterminate={selection!.someSelected}
            disabled={!tasks.length}
            onChange={selection!.onToggleAll}
            ariaLabel="Select all tasks on this page"
          />
          <span className="text-xs font-medium text-[#64748b]">Select all on this page</span>
        </div>
      ) : null}
      <ul className="divide-y divide-[#e8edf5]">
        {tasks.map((task) => {
          const assignee =
            (task.assigned_to && employeeNameMap[task.assigned_to]) || task.assignee_name || "Unknown";
          return (
            <li key={task.id}>
              <div className="flex items-stretch gap-3 px-4 py-3 hover:bg-[#fafcff]">
                {showSelection ? (
                  <div className="flex shrink-0 items-center pt-1">
                    <TableBulkCheckbox
                      checked={selection!.isSelected(task.id)}
                      onChange={() => selection!.onToggle(task.id)}
                      ariaLabel={`Select task ${task.title}`}
                    />
                  </div>
                ) : null}
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onOpenTask(task)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-semibold text-[#0f172a]">{task.title}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748b]">
                        <span className="rounded-full bg-[#f1f6fc] px-2 py-0.5 font-medium text-[#475569]">
                          {typeLabel(task)}
                        </span>
                        <span>{linkedSummary(task)}</span>
                        {showAssignedBy && task.assigner_display_name ? (
                          <span>
                            Assigned by <strong className="text-[#334155]">{task.assigner_display_name}</strong>
                          </span>
                        ) : null}
                        <span>{formatDisplayDate(task.created_at, "—")}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {showAssignedTo ? (
                        <span className="text-xs font-medium text-[#334155]">To: {assignee}</span>
                      ) : null}
                      <Badge className={statusClass[task.status] ?? statusClass.Pending}>{task.status}</Badge>
                      <span className="text-xs text-[#64748b]">{task.progress}%</span>
                      <span className="text-xs font-semibold text-[#c9a227]">Open →</span>
                    </div>
                  </div>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
