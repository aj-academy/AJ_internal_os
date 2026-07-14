"use client";

import { Plus, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  COLLEGE_PRIORITIES,
  CONNECTED_PERSON_ROLES,
  CV_PROPOSAL_STATUSES,
  FINAL_STATUSES,
  FOLLOW_UP_STAGES,
  MOU_STATUSES,
  VISIT_STATUSES,
} from "@/components/college-visits/collegeVisitsConfig";
import {
  emptyCollegeContact,
  MAX_COLLEGE_CONTACTS,
  MAX_PHONES_PER_CONTACT,
  normalizeCollegeContacts,
  type CollegeContact,
  type CollegeVisitFormValue,
} from "@/components/college-visits/collegeVisitsHelpers";

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
  proposalUploadSlot?: ReactNode;
}

function updateContacts(value: CollegeVisitFormValue, contacts: CollegeContact[], onChange: (v: CollegeVisitFormValue) => void) {
  // Keep empty phone slots while editing so "+ Alternate number" stays visible.
  onChange({ ...value, contacts: normalizeCollegeContacts(contacts, { keepEmptyPhones: true }) });
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
  proposalUploadSlot,
}: CollegeVisitFormPanelProps) {
  if (!open) return null;

  const contacts = normalizeCollegeContacts(
    value.contacts?.length ? value.contacts : [emptyCollegeContact(true)],
    { keepEmptyPhones: true },
  );

  const setContact = (id: string, patch: Partial<CollegeContact>) => {
    updateContacts(
      value,
      contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      onChange,
    );
  };

  const setPrimary = (id: string) => {
    updateContacts(
      value,
      contacts.map((c) => ({ ...c, is_primary: c.id === id })),
      onChange,
    );
  };

  const addContact = () => {
    if (contacts.length >= MAX_COLLEGE_CONTACTS) return;
    updateContacts(value, [...contacts, emptyCollegeContact(false)], onChange);
  };

  const removeContact = (id: string) => {
    if (contacts.length <= 1) return;
    const next = contacts.filter((c) => c.id !== id);
    if (!next.some((c) => c.is_primary) && next[0]) next[0] = { ...next[0], is_primary: true };
    updateContacts(value, next, onChange);
  };

  const setPhone = (contactId: string, phoneIdx: number, phone: string) => {
    const c = contacts.find((x) => x.id === contactId);
    if (!c) return;
    const phones = [...c.phones];
    phones[phoneIdx] = phone;
    setContact(contactId, { phones });
  };

  const addPhone = (contactId: string) => {
    const c = contacts.find((x) => x.id === contactId);
    if (!c || c.phones.length >= MAX_PHONES_PER_CONTACT) return;
    setContact(contactId, { phones: [...c.phones, ""] });
  };

  const removePhone = (contactId: string, phoneIdx: number) => {
    const c = contacts.find((x) => x.id === contactId);
    if (!c || c.phones.length <= 1) return;
    setContact(contactId, { phones: c.phones.filter((_, i) => i !== phoneIdx) });
  };

  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-white shadow-[0_16px_30px_rgba(61,52,40,0.12)] lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[560px] lg:max-w-[100vw] lg:rounded-l-[24px] lg:border-l lg:border-[#e8dcc8]">
        <div className="flex shrink-0 items-center justify-between border-b border-[#e8edf5] px-4 py-4 sm:px-5">
          <h3 className="text-lg font-semibold text-[#0f172a]">{title}</h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="touch-target flex items-center justify-center rounded-full border border-[#e8dcc8] bg-white p-2 text-[#3d3428] shadow-sm transition hover:bg-[#faf3e3]"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
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
              <label className="grid gap-1">
                <span className="font-medium text-[#334155]">Description</span>
                <textarea className="min-h-[72px] w-full rounded-lg border border-[#e8dcc8] bg-white px-3 py-2" value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} />
              </label>
              <label className="grid gap-1">
                <span className="font-medium text-[#334155]">Source / reference</span>
                <Input value={value.source_reference} onChange={(e) => onChange({ ...value, source_reference: e.target.value })} className="border-[#e8dcc8]" />
              </label>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase text-[#94a3b8]">Contacts</p>
                  <p className="mt-0.5 text-[11px] text-[#64748b]">
                    Primary is used for Call / WhatsApp / Email by default. Up to {MAX_COLLEGE_CONTACTS} people.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 rounded-xl border-[#e8dcc8]"
                  onClick={addContact}
                  disabled={contacts.length >= MAX_COLLEGE_CONTACTS}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add contact
                </Button>
              </div>

              {contacts.map((contact, index) => (
                <div
                  key={contact.id}
                  className="space-y-2 rounded-xl border border-[#e8dcc8] bg-[#fffdf8] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#3d3428]">
                      <input
                        type="radio"
                        name="primary-contact"
                        checked={contact.is_primary}
                        onChange={() => setPrimary(contact.id)}
                        className="accent-[#c9a227]"
                      />
                      {contact.is_primary ? "Primary contact" : `Contact ${index + 1}`}
                    </label>
                    {contacts.length > 1 ? (
                      <button
                        type="button"
                        aria-label="Remove contact"
                        className="rounded-lg p-1.5 text-[#94a3b8] hover:bg-rose-50 hover:text-rose-600"
                        onClick={() => removeContact(contact.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="grid gap-1">
                      <span className="font-medium text-[#334155]">Name</span>
                      <Input
                        value={contact.name}
                        onChange={(e) => setContact(contact.id, { name: e.target.value })}
                        className="border-[#e8dcc8] bg-white"
                        placeholder="Connected person"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="font-medium text-[#334155]">Role</span>
                      <select
                        className="h-10 w-full rounded-xl border border-[#e8dcc8] bg-white px-3"
                        value={contact.role}
                        onChange={(e) => setContact(contact.id, { role: e.target.value })}
                      >
                        <option value="">Select role</option>
                        {CONNECTED_PERSON_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[#334155]">Phone numbers</span>
                      <button
                        type="button"
                        className="text-xs font-semibold text-[#a68b2e] hover:underline disabled:opacity-40"
                        onClick={() => addPhone(contact.id)}
                        disabled={contact.phones.length >= MAX_PHONES_PER_CONTACT}
                      >
                        + Alternate number
                      </button>
                    </div>
                    {contact.phones.map((phone, phoneIdx) => (
                      <div key={`${contact.id}-phone-${phoneIdx}`} className="flex gap-2">
                        <Input
                          value={phone}
                          onChange={(e) => setPhone(contact.id, phoneIdx, e.target.value)}
                          className="border-[#e8dcc8] bg-white"
                          placeholder={phoneIdx === 0 ? "Primary mobile" : `Alternate ${phoneIdx + 1}`}
                          inputMode="tel"
                        />
                        {contact.phones.length > 1 ? (
                          <button
                            type="button"
                            aria-label="Remove number"
                            className="shrink-0 rounded-xl border border-[#e8dcc8] px-2 text-[#94a3b8] hover:bg-rose-50 hover:text-rose-600"
                            onClick={() => removePhone(contact.id, phoneIdx)}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <label className="grid gap-1">
                    <span className="font-medium text-[#334155]">Email</span>
                    <Input
                      type="email"
                      value={contact.email}
                      onChange={(e) => setContact(contact.id, { email: e.target.value })}
                      className="border-[#e8dcc8] bg-white"
                      placeholder="optional@"
                    />
                  </label>
                </div>
              ))}
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

            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase text-[#94a3b8]">Proposal</p>
              <label className="grid gap-1">
                <span className="font-medium text-[#334155]">Proposal status</span>
                <select
                  className="h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-3"
                  value={value.proposal_status}
                  onChange={(e) => onChange({ ...value, proposal_status: e.target.value })}
                >
                  {CV_PROPOSAL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="font-medium text-[#334155]">Proposal amount</span>
                  <Input
                    value={value.proposal_amount}
                    onChange={(e) => onChange({ ...value, proposal_amount: e.target.value })}
                    className="border-[#e8dcc8]"
                    placeholder="Optional"
                  />
                </label>
              <label className="grid gap-1">
                <span className="font-medium text-[#334155]">Sent date</span>
                <Input
                  type="date"
                  value={value.proposal_sent_date}
                  onChange={(e) => onChange({ ...value, proposal_sent_date: e.target.value })}
                  className="border-[#e8dcc8]"
                />
              </label>
              </div>
              {proposalUploadSlot}
            </section>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 border-t border-[#e8edf5] px-4 py-4 sm:px-5">
          <Button type="button" variant="outline" className="flex-1 rounded-full border-[#e8dcc8]" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" className="flex-1 rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]" onClick={onSubmit} disabled={submitting || !value.college_name.trim()}>
            {submitting ? "Saving..." : "Save"}
          </Button>
        </div>
      </aside>
    </>
  );
}
