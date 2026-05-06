"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { LeadSource, LeadStatus } from "@/types/clientLead";

export interface LeadFormValue {
  name: string;
  company_name: string;
  email: string;
  phone: string;
  source: LeadSource;
  status: LeadStatus;
  requirement: string;
  budget: string;
  assigned_to: string;
  follow_up_date: string;
  notes: string;
}

interface EmployeeOption {
  id: string;
  label: string;
}

interface LeadFormPanelProps {
  title: string;
  open: boolean;
  value: LeadFormValue;
  employees: EmployeeOption[];
  canAssign: boolean;
  submitting: boolean;
  onChange: (next: LeadFormValue) => void;
  onClose: () => void;
  onSubmit: () => void;
}

const sourceOptions: LeadSource[] = ["Meta Ads", "Referral", "LinkedIn"];
const statusOptions: LeadStatus[] = ["Lead", "Contacted", "Converted", "Lost"];

export function LeadFormPanel({
  title,
  open,
  value,
  employees,
  canAssign,
  submitting,
  onChange,
  onClose,
  onSubmit,
}: LeadFormPanelProps) {
  if (!open) return null;

  return (
    <aside className="h-full max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[24px] border border-[#d4deea] bg-white p-5 shadow-[0_16px_30px_rgba(30,64,175,0.12)]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[#0f172a]">{title}</h3>
        <button type="button" onClick={onClose} className="text-sm font-medium text-[#64748b] hover:text-[#0f172a]">
          Close
        </button>
      </div>

      <div className="grid gap-3">
        <Field label="Name">
          <Input value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} />
        </Field>
        <Field label="Company Name">
          <Input
            value={value.company_name}
            onChange={(event) => onChange({ ...value, company_name: event.target.value })}
          />
        </Field>
        <Field label="Email">
          <Input value={value.email} onChange={(event) => onChange({ ...value, email: event.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={value.phone} onChange={(event) => onChange({ ...value, phone: event.target.value })} />
        </Field>
        <Field label="Source">
          <select
            value={value.source}
            onChange={(event) => onChange({ ...value, source: event.target.value as LeadSource })}
            className="h-9 w-full rounded-lg border border-[#d4deea] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#2563eb]"
          >
            {sourceOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            value={value.status}
            onChange={(event) => onChange({ ...value, status: event.target.value as LeadStatus })}
            className="h-9 w-full rounded-lg border border-[#d4deea] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#2563eb]"
          >
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Requirement">
          <textarea
            rows={3}
            value={value.requirement}
            onChange={(event) => onChange({ ...value, requirement: event.target.value })}
            className="w-full rounded-lg border border-[#d4deea] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
          />
        </Field>
        <Field label="Budget">
          <Input value={value.budget} onChange={(event) => onChange({ ...value, budget: event.target.value })} />
        </Field>
        <Field label="Assigned To">
          <select
            value={value.assigned_to}
            disabled={!canAssign}
            onChange={(event) => onChange({ ...value, assigned_to: event.target.value })}
            className="h-9 w-full rounded-lg border border-[#d4deea] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#2563eb] disabled:bg-[#f1f5f9]"
          >
            <option value="">Select employee</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Follow-up Date">
          <Input
            type="date"
            value={value.follow_up_date}
            onChange={(event) => onChange({ ...value, follow_up_date: event.target.value })}
          />
        </Field>
        <Field label="Notes">
          <textarea
            rows={3}
            value={value.notes}
            onChange={(event) => onChange({ ...value, notes: event.target.value })}
            className="w-full rounded-lg border border-[#d4deea] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
          />
        </Field>
      </div>

      <Button
        onClick={onSubmit}
        disabled={submitting || !value.name.trim()}
        className="mt-4 h-9 w-full rounded-full bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
      >
        {submitting ? "Saving..." : "Save Lead"}
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
