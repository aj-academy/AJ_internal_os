"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  COLLEGE_PRIORITIES,
  CONNECTED_PERSON_ROLES,
  FINAL_STATUSES,
  FOLLOW_UP_STAGES,
  MOU_STATUSES,
  VISIT_STATUSES,
} from "@/components/college-visits/collegeVisitsConfig";
import type { CollegeVisitFormValue } from "@/components/college-visits/collegeVisitsHelpers";

interface OwnerOption {
  id: string;
  label: string;
}

interface CollegeVisitFormPanelProps {
  open: boolean;
  title: string;
  value: CollegeVisitFormValue;
  owners: OwnerOption[];
  submitting: boolean;
  canAssign: boolean;
  onChange: (v: CollegeVisitFormValue) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function CollegeVisitFormPanel({
  open,
  title,
  value,
  owners,
  submitting,
  canAssign,
  onChange,
  onClose,
  onSubmit,
}: CollegeVisitFormPanelProps) {
  if (!open) return null;

  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-white shadow-[0_16px_30px_rgba(30,64,175,0.12)] lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[560px] lg:max-w-[100vw] lg:rounded-l-[24px] lg:border-l lg:border-[#e8dcc8]">
        <div className="flex shrink-0 items-center justify-between border-b border-[#e8edf5] px-4 py-4 sm:px-5">
          <h3 className="text-lg font-semibold text-[#0f172a]">{title}</h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="touch-target flex items-center justify-center rounded-full border border-[#e8dcc8] bg-white p-2 text-[#3d3428] shadow-sm transition hover:bg-[#faf3e3]"
          >
            <span className="flex h-5 w-5 items-center justify-center text-lg font-semibold leading-none">×</span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="space-y-4 text-sm">
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase text-[#94a3b8]">College details</p>
              <label className="grid gap-1">
                <span className="font-medium text-[#334155]">College name *</span>
                <Input value={value.college_name} onChange={(e) => onChange({ ...value, college_name: e.target.value })} className="border-[#e8dcc8]" />
              </label>
              <label className="grid gap-1">
                <span className="font-medium text-[#334155]">Location</span>
                <Input value={value.location} onChange={(e) => onChange({ ...value, location: e.target.value })} className="border-[#e8dcc8]" />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="font-medium text-[#334155]">Contact number</span>
                  <Input value={value.contact_number} onChange={(e) => onChange({ ...value, contact_number: e.target.value })} className="border-[#e8dcc8]" />
                </label>
                <label className="grid gap-1">
                  <span className="font-medium text-[#334155]">Email ID</span>
                  <Input type="email" value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} className="border-[#e8dcc8]" />
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="font-medium text-[#334155]">Connected person</span>
                  <Input value={value.connected_person_name} onChange={(e) => onChange({ ...value, connected_person_name: e.target.value })} className="border-[#e8dcc8]" />
                </label>
                <label className="grid gap-1">
                  <span className="font-medium text-[#334155]">Role</span>
                  <select className="h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-3" value={value.connected_person_role} onChange={(e) => onChange({ ...value, connected_person_role: e.target.value })}>
                    <option value="">Select role</option>
                    {CONNECTED_PERSON_ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="grid gap-1">
                <span className="font-medium text-[#334155]">Description</span>
                <textarea className="min-h-[72px] w-full rounded-lg border border-[#e8dcc8] bg-white px-3 py-2" value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} />
              </label>
              <label className="grid gap-1">
                <span className="font-medium text-[#334155]">Source / reference</span>
                <Input value={value.source_reference} onChange={(e) => onChange({ ...value, source_reference: e.target.value })} className="border-[#e8dcc8]" />
              </label>
            </section>

            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase text-[#94a3b8]">Visit & MOU</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="font-medium text-[#334155]">Visit status</span>
                  <select className="h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-3" value={value.visit_status} onChange={(e) => onChange({ ...value, visit_status: e.target.value })}>
                    {VISIT_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="font-medium text-[#334155]">Visit date</span>
                  <Input type="date" value={value.visit_date} onChange={(e) => onChange({ ...value, visit_date: e.target.value })} className="border-[#e8dcc8]" />
                </label>
              </div>
              <label className="grid gap-1">
                <span className="font-medium text-[#334155]">MOU signed status</span>
                <select className="h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-3" value={value.mou_signed_status} onChange={(e) => onChange({ ...value, mou_signed_status: e.target.value })}>
                  {MOU_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            </section>

            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase text-[#94a3b8]">Follow-up</p>
              <label className="grid gap-1">
                <span className="font-medium text-[#334155]">Follow-up stage</span>
                <select className="h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-3" value={value.follow_up_stage} onChange={(e) => onChange({ ...value, follow_up_stage: e.target.value })}>
                  <option value="">Select stage</option>
                  {FOLLOW_UP_STAGES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="font-medium text-[#334155]">Last follow-up date</span>
                  <Input type="date" value={value.last_follow_up_date} onChange={(e) => onChange({ ...value, last_follow_up_date: e.target.value })} className="border-[#e8dcc8]" />
                </label>
                <label className="grid gap-1">
                  <span className="font-medium text-[#334155]">Next follow-up date</span>
                  <Input type="date" value={value.next_follow_up_date} onChange={(e) => onChange({ ...value, next_follow_up_date: e.target.value })} className="border-[#e8dcc8]" />
                </label>
              </div>
              <label className="grid gap-1">
                <span className="font-medium text-[#334155]">Last outcome / remarks</span>
                <textarea className="min-h-[72px] w-full rounded-lg border border-[#e8dcc8] bg-white px-3 py-2" value={value.last_outcome_remarks} onChange={(e) => onChange({ ...value, last_outcome_remarks: e.target.value })} />
              </label>
            </section>

            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase text-[#94a3b8]">Pipeline</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="font-medium text-[#334155]">Priority</span>
                  <select className="h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-3" value={value.priority} onChange={(e) => onChange({ ...value, priority: e.target.value })}>
                    {COLLEGE_PRIORITIES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="font-medium text-[#334155]">Lead score</span>
                  <Input type="number" min={0} max={100} value={value.lead_score} onChange={(e) => onChange({ ...value, lead_score: e.target.value })} className="border-[#e8dcc8]" />
                </label>
              </div>
              <label className="grid gap-1">
                <span className="font-medium text-[#334155]">Final status</span>
                <select className="h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-3" value={value.final_status} onChange={(e) => onChange({ ...value, final_status: e.target.value })}>
                  {FINAL_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              {canAssign ? (
                <label className="grid gap-1">
                  <span className="font-medium text-[#334155]">Owner (assigned employee)</span>
                  <select className="h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-3" value={value.assigned_to} onChange={(e) => onChange({ ...value, assigned_to: e.target.value })}>
                    <option value="">Unassigned</option>
                    {owners.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </section>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 border-t border-[#e8edf5] px-4 py-4 sm:px-5">
          <Button type="button" variant="outline" className="flex-1 rounded-full border-[#e8dcc8]" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" className="flex-1 rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]" onClick={onSubmit} disabled={submitting || !value.college_name.trim()}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </div>
      </aside>
    </>
  );
}
