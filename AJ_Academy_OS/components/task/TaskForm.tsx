"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TaskAssigneePicker, type AssigneeProfile } from "@/components/task/TaskAssigneePicker";
import type { TaskAssignmentType, TaskPriority, TaskStatus } from "@/types/task";

export interface TaskFormValue {
  title: string;
  description: string;
  assigned_to: string;
  assignment_type: TaskAssignmentType | "";
  project_id: string;
  priority: TaskPriority;
  status: TaskStatus;
  start_date: string;
  due_date: string;
  progress: number;
}

interface EmployeeOption {
  id: string;
  label: string;
}

interface ProjectOption {
  id: string;
  label: string;
}

interface TaskFormProps {
  open: boolean;
  title: string;
  value: TaskFormValue;
  assigneeProfiles: AssigneeProfile[];
  projects?: ProjectOption[];
  showAssignmentFields?: boolean;
  selectedLeadCount?: number;
  selectedLeadPreview?: string;
  leadSelectionPath?: string;
  onOpenLeadPicker?: () => void;
  leadPickerLabel?: string;
  /** When true, assignee is fixed (self); used for employee personal tasks */
  assigneeLockedToSelf?: boolean;
  /** Shown under assignee field (e.g. who appears in the list) */
  assigneeHelperText?: string;
  submitting: boolean;
  onChange: (value: TaskFormValue) => void;
  onClose: () => void;
  onSubmit: () => void;
}

const priorities: TaskPriority[] = ["Low", "Medium", "High"];
const statuses: TaskStatus[] = ["Pending", "In Progress", "Completed"];

export function TaskForm({
  open,
  title,
  value,
  assigneeProfiles,
  projects = [],
  showAssignmentFields = false,
  selectedLeadCount = 0,
  selectedLeadPreview = "",
  leadSelectionPath = "",
  onOpenLeadPicker,
  leadPickerLabel = "Open Student Master to select leads",
  assigneeLockedToSelf = false,
  assigneeHelperText,
  submitting,
  onChange,
  onClose,
  onSubmit,
}: TaskFormProps) {
  if (!open) return null;

  const assignmentType = value.assignment_type;

  return (
    <aside className="h-full max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[24px] border border-[#e8dcc8] bg-white p-5 shadow-[0_16px_30px_rgba(30,64,175,0.12)]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[#0f172a]">{title}</h3>
        <button onClick={onClose} type="button" className="text-sm text-[#64748b] hover:text-[#0f172a]">
          Close
        </button>
      </div>

      <div className="grid gap-3">
        <Field label="Task Title">
          <Input value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} />
        </Field>
        <Field label="Description">
          <textarea
            rows={4}
            value={value.description}
            onChange={(event) => onChange({ ...value, description: event.target.value })}
            className="w-full rounded-lg border border-[#e8dcc8] px-3 py-2 text-sm outline-none focus:border-[#c9a227]"
          />
        </Field>
        {assigneeLockedToSelf ? (
          <div className="rounded-lg border border-[#dbe6f3] bg-[#f8fbff] px-3 py-2 text-sm text-[#334155]">
            <span className="font-medium text-[#0f172a]">Assigned to</span>
            <p className="mt-1 text-[#64748b]">You — admins and managers can also assign tasks to you; those appear in your list automatically.</p>
          </div>
        ) : (
          <Field label="Assign to">
            <TaskAssigneePicker
              profiles={assigneeProfiles}
              value={value.assigned_to}
              disabled={submitting}
              onChange={(profileId) =>
                onChange({
                  ...value,
                  assigned_to: profileId,
                  assignment_type: "",
                  project_id: "",
                })
              }
            />
            {assigneeHelperText ? <p className="mt-1.5 text-xs text-[#64748b]">{assigneeHelperText}</p> : null}
          </Field>
        )}

        {showAssignmentFields ? (
          <>
            <Field label="Link task to">
              <div className="grid grid-cols-2 gap-2">
                {(["lead", "project"] as TaskAssignmentType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    disabled={!value.assigned_to && !assigneeLockedToSelf}
                    onClick={() =>
                      onChange({
                        ...value,
                        assignment_type: type,
                        project_id: type === "project" ? value.project_id : "",
                      })
                    }
                    className={[
                      "rounded-lg border px-3 py-2 text-sm font-medium transition",
                      assignmentType === type
                        ? "border-[#c9a227] bg-[#fef3c7] text-[#92400e]"
                        : "border-[#e8dcc8] bg-white text-[#334155] hover:bg-[#faf6ee]",
                      !value.assigned_to && !assigneeLockedToSelf ? "cursor-not-allowed opacity-50" : "",
                    ].join(" ")}
                  >
                    {type === "lead" ? "Leads" : "Project"}
                  </button>
                ))}
              </div>
              {!value.assigned_to && !assigneeLockedToSelf ? (
                <p className="mt-1.5 text-xs text-[#64748b]">Select an assignee first to pick leads from their dashboard.</p>
              ) : null}
            </Field>

            {assignmentType === "lead" ? (
              <div className="space-y-2 rounded-xl border border-[#dbe6f3] bg-[#f8fbff] p-3">
                <p className="text-sm font-medium text-[#0f172a]">Leads from Student Master</p>
                {leadSelectionPath ? (
                  <p className="text-xs text-[#64748b]" title={leadSelectionPath}>
                    {leadSelectionPath}
                  </p>
                ) : null}
                {selectedLeadPreview ? (
                  <p className="text-xs font-medium text-[#334155]">{selectedLeadPreview}</p>
                ) : (
                  <p className="text-xs text-[#64748b]">No leads selected yet. Open Student Master to pick from any tab or sub-category.</p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                  onClick={onOpenLeadPicker}
                  className="h-9 w-full rounded-full border-[#c9a227] text-[#92400e] hover:bg-[#fef3c7]"
                >
                  {selectedLeadCount ? `Change selection (${selectedLeadCount})` : leadPickerLabel}
                </Button>
              </div>
            ) : null}

            {assignmentType === "project" ? (
              <Field label="Project">
                <select
                  value={value.project_id}
                  onChange={(event) => onChange({ ...value, project_id: event.target.value })}
                  className="h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#c9a227]"
                >
                  <option value="">Select project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.label}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
          </>
        ) : null}

        <Field label="Priority">
          <select
            value={value.priority}
            onChange={(event) => onChange({ ...value, priority: event.target.value as TaskPriority })}
            className="h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#c9a227]"
          >
            {priorities.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            value={value.status}
            onChange={(event) => onChange({ ...value, status: event.target.value as TaskStatus })}
            className="h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#c9a227]"
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start Date">
          <Input
            type="date"
            value={value.start_date}
            onChange={(event) => onChange({ ...value, start_date: event.target.value })}
          />
        </Field>
        <Field label="Due Date">
          <Input
            type="date"
            value={value.due_date}
            onChange={(event) => onChange({ ...value, due_date: event.target.value })}
          />
        </Field>
      </div>

      <Button
        data-requires-online
        onClick={onSubmit}
        disabled={submitting || !value.title.trim() || (!assigneeLockedToSelf && !value.assigned_to)}
        className="mt-4 h-9 w-full rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]"
      >
        {submitting ? "Saving..." : "Save Task"}
      </Button>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="text-sm font-medium text-[#334155]">{label}</span>
      {children}
    </label>
  );
}
