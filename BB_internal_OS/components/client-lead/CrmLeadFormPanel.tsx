"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  CRM_FOLLOW_UP_TYPES_UI,
  CRM_LEAD_STATUSES,
  CRM_PRIORITIES,
  CRM_PROPOSAL_STATUSES,
  CRM_SERVICES,
  CRM_SOURCES,
  type CrmProposalStatus,
} from "./crmConfig";

export interface CrmLeadFormValue {
  lead_name: string;
  company_name: string;
  phone: string;
  whatsapp: string;
  email: string;
  city: string;
  industry: string;
  source: string;
  service_interests: Set<string>;
  requirement: string;
  budget: string;
  expected_start_date: string;
  notes: string;
  status: string;
  priority: string;
  lead_score: string;
  assigned_to: string;
  follow_up_date: string;
  follow_up_time: string;
  follow_up_type: string;
  proposal_status: CrmProposalStatus | string;
  proposal_amount: string;
  proposal_sent_date: string;
  proposal_link: string;
  quotation_link: string;
  agreement_link: string;
}

interface EmployeeOption {
  id: string;
  label: string;
}

interface CrmLeadFormPanelProps {
  title: string;
  open: boolean;
  value: CrmLeadFormValue;
  employees: EmployeeOption[];
  canAssign: boolean;
  submitting: boolean;
  onChange: (next: CrmLeadFormValue) => void;
  onClose: () => void;
  onSubmit: () => void;
}

function toggleService(set: Set<string>, svc: string) {
  const n = new Set(set);
  if (n.has(svc)) n.delete(svc);
  else n.add(svc);
  return n;
}

export function CrmLeadFormPanel({
  title,
  open,
  value,
  employees,
  canAssign,
  submitting,
  onChange,
  onClose,
  onSubmit,
}: CrmLeadFormPanelProps) {
  if (!open) return null;

  return (
    <aside className="flex h-full max-h-[100dvh] flex-col overflow-hidden bg-white shadow-[0_16px_30px_rgba(30,64,175,0.12)] lg:rounded-[24px] lg:border lg:border-[#d4deea]">
      <div className="border-b border-[#e8edf5] px-4 py-4 sm:px-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-[#0f172a]">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="touch-target flex items-center justify-center rounded-full border border-[#d4deea] bg-white p-2 text-[#1e3a8a] shadow-sm transition hover:bg-[#eff6ff] active:scale-95">
            <span className="flex h-5 w-5 items-center justify-center text-lg font-semibold leading-none">×</span>
          </button>
        </div>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#64748b]">Basic details</p>
          <div className="grid gap-3">
            <Field label="Lead name *">
              <Input value={value.lead_name} onChange={(e) => onChange({ ...value, lead_name: e.target.value })} />
            </Field>
            <Field label="Company name">
              <Input value={value.company_name} onChange={(e) => onChange({ ...value, company_name: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} />
            </Field>
            <Field label="WhatsApp">
              <Input value={value.whatsapp} onChange={(e) => onChange({ ...value, whatsapp: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} />
            </Field>
            <Field label="City / Location">
              <Input value={value.city} onChange={(e) => onChange({ ...value, city: e.target.value })} />
            </Field>
            <Field label="Business type / Industry">
              <Input value={value.industry} onChange={(e) => onChange({ ...value, industry: e.target.value })} />
            </Field>
          </div>
        </section>

        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#64748b]">Lead source</p>
          <select
            value={value.source}
            onChange={(e) => onChange({ ...value, source: e.target.value })}
            className="h-9 w-full rounded-lg border border-[#d4deea] bg-white px-3 text-sm outline-none focus:border-[#2563eb]"
          >
            {CRM_SOURCES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </section>

        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#64748b]">Service interest</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {CRM_SERVICES.map((svc) => (
              <label key={svc} className="flex cursor-pointer items-center gap-2 text-sm text-[#334155]">
                <input
                  type="checkbox"
                  checked={value.service_interests.has(svc)}
                  onChange={() =>
                    onChange({ ...value, service_interests: toggleService(value.service_interests, svc) })
                  }
                  className="rounded border-[#cbd5e1]"
                />
                {svc}
              </label>
            ))}
          </div>
        </section>

        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#64748b]">Business requirement</p>
          <div className="grid gap-3">
            <Field label="Requirement">
              <textarea
                rows={3}
                value={value.requirement}
                onChange={(e) => onChange({ ...value, requirement: e.target.value })}
                className="w-full rounded-lg border border-[#d4deea] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
              />
            </Field>
            <Field label="Budget">
              <Input type="number" value={value.budget} onChange={(e) => onChange({ ...value, budget: e.target.value })} />
            </Field>
            <Field label="Expected start date">
              <Input type="date" value={value.expected_start_date} onChange={(e) => onChange({ ...value, expected_start_date: e.target.value })} />
            </Field>
            <Field label="Notes">
              <textarea
                rows={2}
                value={value.notes}
                onChange={(e) => onChange({ ...value, notes: e.target.value })}
                className="w-full rounded-lg border border-[#d4deea] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
              />
            </Field>
          </div>
        </section>

        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#64748b]">Lead management</p>
          <div className="grid gap-3">
            <Field label="Lead status">
              <select
                value={value.status}
                onChange={(e) => onChange({ ...value, status: e.target.value })}
                className="h-9 w-full rounded-lg border border-[#d4deea] bg-white px-3 text-sm outline-none focus:border-[#2563eb]"
              >
                {CRM_LEAD_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select
                value={value.priority}
                onChange={(e) => onChange({ ...value, priority: e.target.value })}
                className="h-9 w-full rounded-lg border border-[#d4deea] bg-white px-3 text-sm outline-none focus:border-[#2563eb]"
              >
                {CRM_PRIORITIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Lead score (0–100)">
              <Input
                type="number"
                min={0}
                max={100}
                value={value.lead_score}
                onChange={(e) => onChange({ ...value, lead_score: e.target.value })}
              />
            </Field>
            <Field label="Assigned to">
              <select
                value={value.assigned_to}
                disabled={!canAssign}
                onChange={(e) => onChange({ ...value, assigned_to: e.target.value })}
                className="h-9 w-full rounded-lg border border-[#d4deea] bg-white px-3 text-sm outline-none focus:border-[#2563eb] disabled:bg-[#f1f5f9]"
              >
                <option value="">Select team member</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Follow-up date">
              <Input type="date" value={value.follow_up_date} onChange={(e) => onChange({ ...value, follow_up_date: e.target.value })} />
            </Field>
            <Field label="Follow-up time">
              <Input type="time" value={value.follow_up_time} onChange={(e) => onChange({ ...value, follow_up_time: e.target.value })} />
            </Field>
            <Field label="Follow-up type">
              <select
                value={value.follow_up_type}
                onChange={(e) => onChange({ ...value, follow_up_type: e.target.value })}
                className="h-9 w-full rounded-lg border border-[#d4deea] bg-white px-3 text-sm outline-none focus:border-[#2563eb]"
              >
                <option value="">—</option>
                {CRM_FOLLOW_UP_TYPES_UI.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#64748b]">Proposal (optional)</p>
          <div className="grid gap-3">
            <Field label="Proposal status">
              <select
                value={value.proposal_status}
                onChange={(e) => onChange({ ...value, proposal_status: e.target.value })}
                className="h-9 w-full rounded-lg border border-[#d4deea] bg-white px-3 text-sm outline-none focus:border-[#2563eb]"
              >
                {CRM_PROPOSAL_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Proposal amount">
              <Input type="number" value={value.proposal_amount} onChange={(e) => onChange({ ...value, proposal_amount: e.target.value })} />
            </Field>
            <Field label="Proposal sent date">
              <Input type="date" value={value.proposal_sent_date} onChange={(e) => onChange({ ...value, proposal_sent_date: e.target.value })} />
            </Field>
            <Field label="Proposal link">
              <Input value={value.proposal_link} onChange={(e) => onChange({ ...value, proposal_link: e.target.value })} placeholder="URL" />
            </Field>
            <Field label="Quotation link">
              <Input value={value.quotation_link} onChange={(e) => onChange({ ...value, quotation_link: e.target.value })} placeholder="URL" />
            </Field>
            <Field label="Agreement link">
              <Input value={value.agreement_link} onChange={(e) => onChange({ ...value, agreement_link: e.target.value })} placeholder="URL" />
            </Field>
          </div>
        </section>
      </div>
      <div className="border-t border-[#e8edf5] bg-[#fafcff] px-5 py-4">
        <Button
          data-requires-online
          onClick={onSubmit}
          disabled={submitting || !value.lead_name.trim()}
          className="w-full rounded-xl bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
        >
          {submitting ? "Saving…" : "Save"}
        </Button>
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[#64748b]">{label}</span>
      {children}
    </label>
  );
}
