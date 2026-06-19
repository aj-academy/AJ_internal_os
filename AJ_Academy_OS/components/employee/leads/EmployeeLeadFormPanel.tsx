"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CustomColumnDef,
  EMPLOYEE_LEAD_PRIORITIES,
  EMPLOYEE_LEAD_SOURCES,
  EMPLOYEE_LEAD_STATUSES,
} from "@/components/employee/leads/employeeLeadConfig";

export type EmployeeLeadFormValue = {
  lead_name: string;
  company_name: string;
  phone: string;
  whatsapp: string;
  email: string;
  requirement: string;
  source: string;
  status: string;
  priority: string;
  notes: string;
  custom_fields: Record<string, string>;
};

type EmployeeLeadFormPanelProps = {
  open: boolean;
  value: EmployeeLeadFormValue;
  customColumns: CustomColumnDef[];
  submitting: boolean;
  onChange: (next: EmployeeLeadFormValue) => void;
  onClose: () => void;
  onSubmit: () => void;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-[#334155]">{label}</span>
      {children}
    </label>
  );
}

const fieldClass = "h-10 w-full rounded-xl border border-[#cfdceb] bg-white px-3 text-sm text-[#0f172a]";

export function EmployeeLeadFormPanel({
  open,
  value,
  customColumns,
  submitting,
  onChange,
  onClose,
  onSubmit,
}: EmployeeLeadFormPanelProps) {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close panel overlay"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px]"
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-hidden bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[#eef2f7] px-4 py-4 sm:px-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">New lead</p>
            <h3 className="text-lg font-semibold text-[#0f172a]">Add client / lead</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full border border-[#d4deea] bg-white p-2 text-[#334155] hover:bg-[#f8fbff]"
          >
            <span className="flex h-5 w-5 items-center justify-center text-lg leading-none">×</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <Field label="Lead name *">
            <Input
              value={value.lead_name}
              onChange={(e) => onChange({ ...value, lead_name: e.target.value })}
              className="border-[#cfdceb]"
              placeholder="Contact or lead name"
            />
          </Field>
          <Field label="Company">
            <Input
              value={value.company_name}
              onChange={(e) => onChange({ ...value, company_name: e.target.value })}
              className="border-[#cfdceb]"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone">
              <Input
                value={value.phone}
                onChange={(e) => onChange({ ...value, phone: e.target.value })}
                className="border-[#cfdceb]"
              />
            </Field>
            <Field label="WhatsApp">
              <Input
                value={value.whatsapp}
                onChange={(e) => onChange({ ...value, whatsapp: e.target.value })}
                className="border-[#cfdceb]"
                placeholder="Same as phone if empty"
              />
            </Field>
          </div>
          <Field label="Email">
            <Input
              type="email"
              value={value.email}
              onChange={(e) => onChange({ ...value, email: e.target.value })}
              className="border-[#cfdceb]"
            />
          </Field>
          <Field label="Description / requirement">
            <textarea
              value={value.requirement}
              onChange={(e) => onChange({ ...value, requirement: e.target.value })}
              rows={3}
              className={`${fieldClass} min-h-[80px] py-2`}
              placeholder="What does this lead need?"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Source">
              <select
                value={value.source}
                onChange={(e) => onChange({ ...value, source: e.target.value })}
                className={fieldClass}
              >
                <option value="">Select source</option>
                {EMPLOYEE_LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                value={value.status}
                onChange={(e) => onChange({ ...value, status: e.target.value })}
                className={fieldClass}
              >
                {EMPLOYEE_LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Priority">
            <select
              value={value.priority}
              onChange={(e) => onChange({ ...value, priority: e.target.value })}
              className={fieldClass}
            >
              {EMPLOYEE_LEAD_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes">
            <textarea
              value={value.notes}
              onChange={(e) => onChange({ ...value, notes: e.target.value })}
              rows={2}
              className={`${fieldClass} min-h-[64px] py-2`}
            />
          </Field>

          {customColumns.length ? (
            <section className="rounded-xl border border-[#dbe6f3] bg-[#f8fbff] p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#64748b]">Custom columns</p>
              <div className="space-y-3">
                {customColumns.map((col) => (
                  <Field key={col.id} label={col.column_name}>
                    <Input
                      value={value.custom_fields[col.column_key] ?? ""}
                      onChange={(e) =>
                        onChange({
                          ...value,
                          custom_fields: { ...value.custom_fields, [col.column_key]: e.target.value },
                        })
                      }
                      className="border-[#cfdceb]"
                    />
                  </Field>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-[#eef2f7] px-4 py-4 sm:px-5">
          <Button
            type="button"
            disabled={submitting}
            className="w-full rounded-full bg-[#2563eb] hover:bg-[#1d4ed8]"
            onClick={onSubmit}
          >
            {submitting ? "Saving…" : "Save lead"}
          </Button>
        </div>
      </aside>
    </>
  );
}
