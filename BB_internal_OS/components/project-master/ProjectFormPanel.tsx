"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PROJECT_PRIORITIES, PROJECT_STATUSES, PROJECT_TYPES } from "@/components/project-master/projectConfig";
import type { ClientOption } from "@/types/project";

export interface ProjectFormValue {
  project_name: string;
  project_code: string;
  client_id: string;
  project_type: string;
  description: string;
  start_date: string;
  deadline: string;
  estimated_completion: string;
  budget: string;
  advance_paid: string;
  project_manager: string;
  team_ids: Set<string>;
  status: string;
  priority: string;
  notes: string;
}

interface EmployeeOpt {
  id: string;
  label: string;
}

interface ProjectFormPanelProps {
  open: boolean;
  title: string;
  value: ProjectFormValue;
  clients: ClientOption[];
  employees: EmployeeOpt[];
  submitting: boolean;
  canEdit: boolean;
  onChange: (v: ProjectFormValue) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function ProjectFormPanel({
  open,
  title,
  value,
  clients,
  employees,
  submitting,
  canEdit,
  onChange,
  onClose,
  onSubmit,
}: ProjectFormPanelProps) {
  if (!open) return null;

  const budgetNum = parseFloat(value.budget) || 0;
  const advNum = parseFloat(value.advance_paid) || 0;
  const pending = Math.max(0, budgetNum - advNum);

  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-40 bg-slate-900/25" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[520px] overflow-y-auto bg-[#f8fbff] p-3 sm:p-4">
        <aside className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[24px] border border-[#d4deea] bg-white p-5 shadow-[0_16px_30px_rgba(30,64,175,0.12)]">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[#0f172a]">{title}</h3>
            <button type="button" className="text-sm text-[#64748b]" onClick={onClose}>
              Close
            </button>
          </div>

          <div className="space-y-4 text-sm">
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase text-[#94a3b8]">Basic details</p>
              <label className="grid gap-1">
                <span className="font-medium text-[#334155]">Project name *</span>
                <Input
                  disabled={!canEdit}
                  value={value.project_name}
                  onChange={(e) => onChange({ ...value, project_name: e.target.value })}
                  className="border-[#d4deea]"
                />
              </label>
              <label className="grid gap-1">
                <span className="font-medium text-[#334155]">Project code</span>
                <Input
                  disabled={!canEdit}
                  placeholder="Auto if left blank on create"
                  value={value.project_code}
                  onChange={(e) => onChange({ ...value, project_code: e.target.value })}
                  className="border-[#d4deea]"
                />
              </label>
              <label className="grid gap-1">
                <span className="font-medium text-[#334155]">Client</span>
                <select
                  disabled={!canEdit}
                  className="h-9 w-full rounded-lg border border-[#d4deea] bg-white px-3"
                  value={value.client_id}
                  onChange={(e) => onChange({ ...value, client_id: e.target.value })}
                >
                  <option value="">Select client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {(c.lead_name || c.name || "Lead").trim()} {c.company_name ? `· ${c.company_name}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="font-medium text-[#334155]">Project type</span>
                <select
                  disabled={!canEdit}
                  className="h-9 w-full rounded-lg border border-[#d4deea] bg-white px-3"
                  value={value.project_type}
                  onChange={(e) => onChange({ ...value, project_type: e.target.value })}
                >
                  <option value="">Select type</option>
                  {PROJECT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="font-medium text-[#334155]">Description</span>
                <textarea
                  disabled={!canEdit}
                  rows={3}
                  value={value.description}
                  onChange={(e) => onChange({ ...value, description: e.target.value })}
                  className="w-full rounded-lg border border-[#d4deea] px-3 py-2"
                />
              </label>
            </section>

            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase text-[#94a3b8]">Timeline</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="grid gap-1">
                  <span className="text-xs text-[#64748b]">Start</span>
                  <Input
                    disabled={!canEdit}
                    type="date"
                    value={value.start_date}
                    onChange={(e) => onChange({ ...value, start_date: e.target.value })}
                    className="border-[#d4deea]"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs text-[#64748b]">Deadline</span>
                  <Input
                    disabled={!canEdit}
                    type="date"
                    value={value.deadline}
                    onChange={(e) => onChange({ ...value, deadline: e.target.value })}
                    className="border-[#d4deea]"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs text-[#64748b]">Est. completion</span>
                  <Input
                    disabled={!canEdit}
                    type="date"
                    value={value.estimated_completion}
                    onChange={(e) => onChange({ ...value, estimated_completion: e.target.value })}
                    className="border-[#d4deea]"
                  />
                </label>
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase text-[#94a3b8]">Budget</p>
              <label className="grid gap-1">
                <span className="font-medium text-[#334155]">Total budget</span>
                <Input
                  disabled={!canEdit}
                  type="number"
                  min={0}
                  step="0.01"
                  value={value.budget}
                  onChange={(e) => onChange({ ...value, budget: e.target.value })}
                  className="border-[#d4deea]"
                />
              </label>
              <label className="grid gap-1">
                <span className="font-medium text-[#334155]">Advance paid</span>
                <Input
                  disabled={!canEdit}
                  type="number"
                  min={0}
                  step="0.01"
                  value={value.advance_paid}
                  onChange={(e) => onChange({ ...value, advance_paid: e.target.value })}
                  className="border-[#d4deea]"
                />
              </label>
              <p className="rounded-lg border border-[#dbe6f3] bg-[#f8fbff] px-3 py-2 text-xs text-[#475569]">
                Pending amount (auto): <strong>₹{pending.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
              </p>
            </section>

            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase text-[#94a3b8]">Management</p>
              <label className="grid gap-1">
                <span className="font-medium text-[#334155]">Project manager</span>
                <select
                  disabled={!canEdit}
                  className="h-9 w-full rounded-lg border border-[#d4deea] bg-white px-3"
                  value={value.project_manager}
                  onChange={(e) => onChange({ ...value, project_manager: e.target.value })}
                >
                  <option value="">Select manager</option>
                  {employees.map((em) => (
                    <option key={em.id} value={em.id}>
                      {em.label}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <p className="mb-2 font-medium text-[#334155]">Assigned team</p>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-[#d4deea] p-2">
                  {employees.map((em) => (
                    <label key={em.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={value.team_ids.has(em.id)}
                        onChange={() => {
                          const next = new Set(value.team_ids);
                          if (next.has(em.id)) next.delete(em.id);
                          else next.add(em.id);
                          onChange({ ...value, team_ids: next });
                        }}
                      />
                      {em.label}
                    </label>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="font-medium text-[#334155]">Status</span>
                <select
                  disabled={!canEdit}
                  className="h-9 rounded-lg border border-[#d4deea] bg-white px-3"
                  value={value.status}
                  onChange={(e) => onChange({ ...value, status: e.target.value })}
                >
                  {PROJECT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="font-medium text-[#334155]">Priority</span>
                <select
                  disabled={!canEdit}
                  className="h-9 rounded-lg border border-[#d4deea] bg-white px-3"
                  value={value.priority}
                  onChange={(e) => onChange({ ...value, priority: e.target.value })}
                >
                  {PROJECT_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <label className="grid gap-1">
              <span className="font-medium text-[#334155]">Internal notes</span>
              <textarea
                disabled={!canEdit}
                rows={3}
                value={value.notes}
                onChange={(e) => onChange({ ...value, notes: e.target.value })}
                className="rounded-lg border border-[#d4deea] px-3 py-2"
              />
            </label>
          </div>

          {canEdit ? (
            <Button
              type="button"
              className="mt-6 h-10 w-full rounded-full bg-[#2563eb] text-white"
              disabled={submitting || !value.project_name.trim() || !value.client_id}
              onClick={onSubmit}
            >
              {submitting ? "Saving…" : "Save project"}
            </Button>
          ) : null}
        </aside>
      </div>
    </>
  );
}
