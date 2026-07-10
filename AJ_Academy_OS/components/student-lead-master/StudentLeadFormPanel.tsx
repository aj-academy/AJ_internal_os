"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ADMISSION_STATUSES,
  CRM_FOLLOW_UP_TYPES_UI,
  CRM_LEAD_STATUSES,
  CRM_PRIORITIES,
  CRM_PROPOSAL_STATUSES,
  CRM_SOURCES,
  CURRENT_PROFILES,
  DECISION_MAKERS,
  EMPLOYMENT_STATUSES,
  INTERESTED_PROGRAMS,
  JOINING_TIMELINES,
  LAPTOP_AVAILABILITY,
  LEAD_STAGES,
  PAYMENT_PLANS,
  PAYMENT_STATUSES,
  PREFERRED_BATCHES,
  SKILL_LEVELS,
  YES_NO_OPTIONS,
  type CrmProposalStatus,
} from "./studentMasterConfig";

export interface StudentLeadFormValue {
  lead_name: string;
  phone: string;
  whatsapp: string;
  email: string;
  city: string;
  current_profile: string;
  degree: string;
  college_company: string;
  year_of_passing: string;
  employment_status: string;
  current_salary: string;
  interested_program: string;
  career_goal: string;
  preferred_job_role: string;
  target_salary: string;
  current_skill_level: string;
  main_career_problem: string;
  joining_timeline: string;
  budget: string;
  payment_plan: string;
  parent_approval_required: string;
  decision_maker: string;
  preferred_batch: string;
  laptop_availability: string;
  source: string;
  assigned_to: string;
  lead_stage: string;
  status: string;
  priority: string;
  primary_objection: string;
  follow_up_date: string;
  follow_up_time: string;
  follow_up_type: string;
  fee_quoted: string;
  final_fee: string;
  payment_status: string;
  admission_status: string;
  notes: string;
  // Kept for proposal tab / legacy save paths
  company_name: string;
  industry: string;
  requirement: string;
  expected_start_date: string;
  lead_score: string;
  service_interests: Set<string>;
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

interface StudentLeadFormPanelProps {
  title: string;
  open: boolean;
  value: StudentLeadFormValue;
  employees: EmployeeOption[];
  canAssign: boolean;
  submitting: boolean;
  onChange: (next: StudentLeadFormValue) => void;
  onClose: () => void;
  onSubmit: () => void;
}

const selectClass =
  "h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-3 text-sm outline-none focus:border-[#c9a227]";

export function StudentLeadFormPanel({
  title,
  open,
  value,
  employees,
  canAssign,
  submitting,
  onChange,
  onClose,
  onSubmit,
}: StudentLeadFormPanelProps) {
  if (!open) return null;

  return (
    <aside className="flex h-full max-h-[100dvh] flex-col overflow-hidden bg-white shadow-[0_16px_30px_rgba(30,64,175,0.12)] lg:rounded-[24px] lg:border lg:border-[#e8dcc8]">
      <div className="border-b border-[#e8edf5] px-4 py-4 sm:px-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-[#0f172a]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="touch-target flex items-center justify-center rounded-full border border-[#e8dcc8] bg-white p-2 text-[#3d3428] shadow-sm transition hover:bg-[#faf3e3] active:scale-95"
          >
            <span className="flex h-5 w-5 items-center justify-center text-lg font-semibold leading-none">×</span>
          </button>
        </div>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#64748b]">Contact</p>
          <div className="grid gap-3">
            <Field label="Student name *">
              <Input value={value.lead_name} onChange={(e) => onChange({ ...value, lead_name: e.target.value })} />
            </Field>
            <Field label="Mobile number">
              <Input value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} />
            </Field>
            <Field label="WhatsApp number">
              <Input value={value.whatsapp} onChange={(e) => onChange({ ...value, whatsapp: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} />
            </Field>
            <Field label="City">
              <Input value={value.city} onChange={(e) => onChange({ ...value, city: e.target.value })} />
            </Field>
          </div>
        </section>

        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#64748b]">Profile & education</p>
          <div className="grid gap-3">
            <Field label="Current profile">
              <select className={selectClass} value={value.current_profile} onChange={(e) => onChange({ ...value, current_profile: e.target.value })}>
                <option value="">Select</option>
                {CURRENT_PROFILES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Degree">
              <Input value={value.degree} onChange={(e) => onChange({ ...value, degree: e.target.value })} />
            </Field>
            <Field label="College / Company">
              <Input value={value.college_company} onChange={(e) => onChange({ ...value, college_company: e.target.value })} />
            </Field>
            <Field label="Year of passing">
              <Input value={value.year_of_passing} onChange={(e) => onChange({ ...value, year_of_passing: e.target.value })} placeholder="e.g. 2024" />
            </Field>
            <Field label="Employment status">
              <select className={selectClass} value={value.employment_status} onChange={(e) => onChange({ ...value, employment_status: e.target.value })}>
                <option value="">Select</option>
                {EMPLOYMENT_STATUSES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Current salary">
              <Input type="number" value={value.current_salary} onChange={(e) => onChange({ ...value, current_salary: e.target.value })} />
            </Field>
          </div>
        </section>

        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#64748b]">Career interest</p>
          <div className="grid gap-3">
            <Field label="Interested program">
              <select className={selectClass} value={value.interested_program} onChange={(e) => onChange({ ...value, interested_program: e.target.value })}>
                <option value="">Select</option>
                {INTERESTED_PROGRAMS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Career goal">
              <Input value={value.career_goal} onChange={(e) => onChange({ ...value, career_goal: e.target.value })} />
            </Field>
            <Field label="Preferred job role">
              <Input value={value.preferred_job_role} onChange={(e) => onChange({ ...value, preferred_job_role: e.target.value })} />
            </Field>
            <Field label="Target salary">
              <Input type="number" value={value.target_salary} onChange={(e) => onChange({ ...value, target_salary: e.target.value })} />
            </Field>
            <Field label="Current skill level">
              <select className={selectClass} value={value.current_skill_level} onChange={(e) => onChange({ ...value, current_skill_level: e.target.value })}>
                <option value="">Select</option>
                {SKILL_LEVELS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Main career problem">
              <textarea
                rows={2}
                value={value.main_career_problem}
                onChange={(e) => onChange({ ...value, main_career_problem: e.target.value })}
                className="w-full rounded-lg border border-[#e8dcc8] px-3 py-2 text-sm outline-none focus:border-[#c9a227]"
              />
            </Field>
            <Field label="Joining timeline">
              <select className={selectClass} value={value.joining_timeline} onChange={(e) => onChange({ ...value, joining_timeline: e.target.value })}>
                <option value="">Select</option>
                {JOINING_TIMELINES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#64748b]">Decision & logistics</p>
          <div className="grid gap-3">
            <Field label="Program budget">
              <Input type="number" value={value.budget} onChange={(e) => onChange({ ...value, budget: e.target.value })} />
            </Field>
            <Field label="Full payment or instalment">
              <select className={selectClass} value={value.payment_plan} onChange={(e) => onChange({ ...value, payment_plan: e.target.value })}>
                <option value="">Select</option>
                {PAYMENT_PLANS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Parent approval required">
              <select className={selectClass} value={value.parent_approval_required} onChange={(e) => onChange({ ...value, parent_approval_required: e.target.value })}>
                <option value="">Select</option>
                {YES_NO_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Decision maker">
              <select className={selectClass} value={value.decision_maker} onChange={(e) => onChange({ ...value, decision_maker: e.target.value })}>
                <option value="">Select</option>
                {DECISION_MAKERS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Preferred batch">
              <select className={selectClass} value={value.preferred_batch} onChange={(e) => onChange({ ...value, preferred_batch: e.target.value })}>
                <option value="">Select</option>
                {PREFERRED_BATCHES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Laptop availability">
              <select className={selectClass} value={value.laptop_availability} onChange={(e) => onChange({ ...value, laptop_availability: e.target.value })}>
                <option value="">Select</option>
                {LAPTOP_AVAILABILITY.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#64748b]">Lead management</p>
          <div className="grid gap-3">
            <Field label="Lead source">
              <select className={selectClass} value={value.source} onChange={(e) => onChange({ ...value, source: e.target.value })}>
                {CRM_SOURCES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Assigned counsellor">
              <select
                className={`${selectClass} disabled:bg-[#f1f5f9]`}
                value={value.assigned_to}
                disabled={!canAssign}
                onChange={(e) => onChange({ ...value, assigned_to: e.target.value })}
              >
                <option value="">Select counsellor</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Lead stage">
              <select className={selectClass} value={value.lead_stage} onChange={(e) => onChange({ ...value, lead_stage: e.target.value })}>
                <option value="">Select</option>
                {LEAD_STAGES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Lead status">
              <select className={selectClass} value={value.status} onChange={(e) => onChange({ ...value, status: e.target.value })}>
                {CRM_LEAD_STATUSES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select className={selectClass} value={value.priority} onChange={(e) => onChange({ ...value, priority: e.target.value })}>
                {CRM_PRIORITIES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Primary objection">
              <Input value={value.primary_objection} onChange={(e) => onChange({ ...value, primary_objection: e.target.value })} />
            </Field>
            <Field label="Next follow-up date">
              <Input type="date" value={value.follow_up_date} onChange={(e) => onChange({ ...value, follow_up_date: e.target.value })} />
            </Field>
            <Field label="Follow-up time">
              <Input type="time" value={value.follow_up_time} onChange={(e) => onChange({ ...value, follow_up_time: e.target.value })} />
            </Field>
            <Field label="Follow-up type">
              <select className={selectClass} value={value.follow_up_type} onChange={(e) => onChange({ ...value, follow_up_type: e.target.value })}>
                <option value="">—</option>
                {CRM_FOLLOW_UP_TYPES_UI.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#64748b]">Fees & admission</p>
          <div className="grid gap-3">
            <Field label="Fee quoted">
              <Input type="number" value={value.fee_quoted} onChange={(e) => onChange({ ...value, fee_quoted: e.target.value })} />
            </Field>
            <Field label="Final fee">
              <Input type="number" value={value.final_fee} onChange={(e) => onChange({ ...value, final_fee: e.target.value })} />
            </Field>
            <Field label="Payment status">
              <select className={selectClass} value={value.payment_status} onChange={(e) => onChange({ ...value, payment_status: e.target.value })}>
                <option value="">Select</option>
                {PAYMENT_STATUSES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Admission status">
              <select className={selectClass} value={value.admission_status} onChange={(e) => onChange({ ...value, admission_status: e.target.value })}>
                <option value="">Select</option>
                {ADMISSION_STATUSES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notes">
              <textarea
                rows={2}
                value={value.notes}
                onChange={(e) => onChange({ ...value, notes: e.target.value })}
                className="w-full rounded-lg border border-[#e8dcc8] px-3 py-2 text-sm outline-none focus:border-[#c9a227]"
              />
            </Field>
          </div>
        </section>

        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#64748b]">Proposal (optional)</p>
          <div className="grid gap-3">
            <Field label="Proposal status">
              <select className={selectClass} value={value.proposal_status} onChange={(e) => onChange({ ...value, proposal_status: e.target.value })}>
                {CRM_PROPOSAL_STATUSES.map((o) => (
                  <option key={o} value={o}>
                    {o}
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
          </div>
        </section>
      </div>
      <div className="border-t border-[#e8edf5] bg-[#fafcff] px-5 py-4">
        <Button
          data-requires-online
          onClick={onSubmit}
          disabled={submitting || !value.lead_name.trim()}
          className="w-full rounded-xl bg-[#c9a227] text-white hover:bg-[#b8921f]"
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
