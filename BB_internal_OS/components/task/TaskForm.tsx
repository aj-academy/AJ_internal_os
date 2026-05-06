"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { TaskPriority, TaskStatus } from "@/types/task";

export interface TaskFormValue {
  title: string;
  description: string;
  assigned_to: string;
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

interface TaskFormProps {
  open: boolean;
  title: string;
  value: TaskFormValue;
  employees: EmployeeOption[];
  submitting: boolean;
  onChange: (value: TaskFormValue) => void;
  onClose: () => void;
  onSubmit: () => void;
}

const priorities: TaskPriority[] = ["Low", "Medium", "High"];
const statuses: TaskStatus[] = ["Pending", "In Progress", "Completed"];

export function TaskForm({ open, title, value, employees, submitting, onChange, onClose, onSubmit }: TaskFormProps) {
  if (!open) return null;

  return (
    <aside className="h-full max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[24px] border border-[#d4deea] bg-white p-5 shadow-[0_16px_30px_rgba(30,64,175,0.12)]">
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
            className="w-full rounded-lg border border-[#d4deea] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
          />
        </Field>
        <Field label="Assigned To">
          <select
            value={value.assigned_to}
            onChange={(event) => onChange({ ...value, assigned_to: event.target.value })}
            className="h-9 w-full rounded-lg border border-[#d4deea] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#2563eb]"
          >
            <option value="">Select employee</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select
            value={value.priority}
            onChange={(event) => onChange({ ...value, priority: event.target.value as TaskPriority })}
            className="h-9 w-full rounded-lg border border-[#d4deea] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#2563eb]"
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
            className="h-9 w-full rounded-lg border border-[#d4deea] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#2563eb]"
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
        onClick={onSubmit}
        disabled={submitting || !value.title.trim() || !value.assigned_to}
        className="mt-4 h-9 w-full rounded-full bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
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
