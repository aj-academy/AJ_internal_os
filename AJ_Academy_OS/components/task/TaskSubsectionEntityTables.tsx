"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TableHeaderCell } from "@/components/ui/TableHeaderFilter";
import { TablePagination } from "@/components/ui/TablePagination";
import { usePagination } from "@/lib/usePagination";
import { STUDENT_MASTER_CSV_HEADERS } from "@/components/student-lead-master/studentMasterCsv";
import { displayLeadName, type CrmClientRow } from "@/components/student-lead-master/studentMasterHelpers";
import { StudentOutreachButtons } from "@/components/student-lead-master/StudentOutreachButtons";
import { WhatsAppComposeModal } from "@/components/shared/WhatsAppComposeModal";
import { EmailComposeModal } from "@/components/shared/EmailComposeModal";
import {
  anyCollegeOutreachEmail,
  anyCollegeOutreachPhone,
  collegeContactsForRow,
  contactRoleSelectLabel,
  daysSince,
  isFollowUpDue,
  selectedCollegeContact,
  type CollegeVisitRow,
} from "@/components/college-visits/collegeVisitsHelpers";
import {
  TABLE_CHECK_TD,
  TABLE_CHECK_TH,
  TABLE_DATA_TD,
  TABLE_DATA_TH,
  TABLE_SNO_TD,
  TABLE_SNO_TH,
} from "@/components/ui/ResponsiveDataView";
import { whatsAppHref } from "@/components/employee/leads/employeeLeadConfig";
import {
  logTaskLeadEmail,
  logTaskLeadPhoneCall,
  logTaskLeadWhatsApp,
  mapClientRowToTaskLinkedLead,
  type TaskLinkedLead,
} from "@/lib/taskLeadOutreach";
import { formatDisplayDate } from "@/lib/datetime";
import type { createClient } from "@/lib/supabase/client";
import type { TaskRecord } from "@/types/task";
import type { CSSProperties } from "react";

export type TaskLeadFlatRow = {
  key: string;
  task: TaskRecord;
  lead: CrmClientRow;
  leadLoaded: boolean;
};

export type TaskCollegeFlatRow = {
  key: string;
  task: TaskRecord;
  college: CollegeVisitRow;
  collegeLoaded: boolean;
};

function placeholderLead(id: string): CrmClientRow {
  return {
    id,
    name: null,
    lead_name: `Lead ${id.slice(0, 8)}...`,
    client_code: null,
    company_name: null,
    email: null,
    phone: null,
    whatsapp: null,
    city: null,
    status: null,
    priority: null,
    assigned_to: null,
  } as CrmClientRow;
}

function placeholderCollege(id: string): CollegeVisitRow {
  return {
    id,
    college_name: `College ${id.slice(0, 8)}...`,
    location: null,
    contact_number: null,
    email: null,
    connected_person_name: null,
    connected_person_role: null,
    contacts: [],
    visit_status: "-",
    visited_by_name: null,
    visit_date: null,
    mou_signed_status: "-",
    follow_up_stage: null,
    last_follow_up_date: null,
    next_follow_up_date: null,
    priority: "-",
    assigned_to: null,
    assigned_by: null,
    description: null,
    last_outcome_remarks: null,
    lead_score: 0,
    final_status: "-",
    source_reference: null,
    proposal_status: "Not Sent",
    proposal_amount: null,
    proposal_sent_date: null,
    proposal_link: null,
    proposal_pdf_url: null,
    proposal_pdf_name: null,
    proposal_file_name: null,
    proposal_file_path: null,
    proposal_file_type: null,
    proposal_file_size: null,
    proposal_uploaded_at: null,
    created_by: null,
    created_at: "",
    updated_at: "",
  };
}

export function flattenTaskLeads(
  tasks: TaskRecord[],
  leadById: Record<string, CrmClientRow>,
): TaskLeadFlatRow[] {
  const out: TaskLeadFlatRow[] = [];
  for (const task of tasks) {
    if ((task.assignment_type ?? "") !== "lead") continue;
    const ids = task.client_ids ?? [];
    if (!ids.length) {
      out.push({
        key: `${task.id}:none`,
        task,
        lead: placeholderLead(task.id),
        leadLoaded: false,
      });
      continue;
    }
    for (const id of ids) {
      const lead = leadById[id];
      out.push({
        key: `${task.id}:${id}`,
        task,
        lead: lead ?? placeholderLead(id),
        leadLoaded: Boolean(lead),
      });
    }
  }
  return out;
}

export function flattenTaskColleges(
  tasks: TaskRecord[],
  collegeById: Record<string, CollegeVisitRow>,
): TaskCollegeFlatRow[] {
  const out: TaskCollegeFlatRow[] = [];
  for (const task of tasks) {
    if ((task.assignment_type ?? "") !== "college") continue;
    const ids = task.college_visit_ids ?? [];
    if (!ids.length) {
      out.push({
        key: `${task.id}:none`,
        task,
        college: placeholderCollege(task.id),
        collegeLoaded: false,
      });
      continue;
    }
    for (const id of ids) {
      const college = collegeById[id];
      out.push({
        key: `${task.id}:${id}`,
        task,
        college: college ?? placeholderCollege(id),
        collegeLoaded: Boolean(college),
      });
    }
  }
  return out;
}

function LeadStatusBadge({ status }: { status: string | null | undefined }) {
  const s = String(status || "—");
  return (
    <span className="inline-flex rounded-full border border-[#dbe6f3] bg-[#f8fbff] px-2 py-0.5 text-[11px] font-semibold text-[#334155]">
      {s}
    </span>
  );
}

type SubsectionSelection = {
  isSelected: (taskId: string) => boolean;
  onToggle: (taskId: string) => void;
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: () => void;
};

/** Single Student Master-shaped grid for My Tasks -> Student Lead (View = edit form; Activity separate). */
export function TaskSubsectionLeadsTable({
  rows,
  employeeNameMap,
  loading,
  onViewLead,
  onActivityLead,
  onEditLead,
  selection,
  currentUserId,
  supabase,
  onOutreachUpdated,
  onOutreachError,
  onOutreachSuccess,
}: {
  rows: TaskLeadFlatRow[];
  employeeNameMap: Record<string, string>;
  loading?: boolean;
  onViewLead: (task: TaskRecord, lead: CrmClientRow, leadLoaded: boolean) => void;
  onActivityLead: (task: TaskRecord, lead: CrmClientRow) => void;
  onEditLead?: (task: TaskRecord, lead: CrmClientRow, leadLoaded: boolean) => void;
  selection?: SubsectionSelection;
  currentUserId?: string;
  supabase?: ReturnType<typeof createClient>;
  onOutreachUpdated?: () => void;
  onOutreachError?: (msg: string) => void;
  onOutreachSuccess?: (msg: string) => void;
}) {
  const {
    paginatedItems: pageRows,
    page,
    setPage,
    totalPages,
    totalItems,
    pageSize,
    setPageSize,
  } = usePagination(rows, 25);

  const [waTarget, setWaTarget] = useState<{ taskId: string; lead: TaskLinkedLead } | null>(null);
  const [emailTarget, setEmailTarget] = useState<{ taskId: string; lead: TaskLinkedLead } | null>(null);
  const [outreachBusy, setOutreachBusy] = useState(false);

  const th =
    "min-w-[10.5rem] whitespace-nowrap px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-[#64748b]";
  const td = "whitespace-nowrap px-4 py-3 text-center text-xs text-[#334155]";
  const tdTrunc = `${td} max-w-[160px] truncate`;
  const colSpan = STUDENT_MASTER_CSV_HEADERS.length + 5 + (selection ? 1 : 0);

  const canOutreach = Boolean(currentUserId && supabase);

  return (
    <div className="overflow-hidden rounded-[20px] border border-[#dbe6f3] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table
          className="table-freeze-cols w-full min-w-[5600px] text-sm"
          style={{ ["--sticky-col-2" as string]: "12rem" } as CSSProperties}
        >
          <thead className="bg-[#f1f6fc]">
            <tr>
              {selection ? (
                <th className={`${th} w-10 min-w-[2.5rem]`}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#1e3a5f]"
                    checked={selection.allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = selection.someSelected && !selection.allSelected;
                    }}
                    onChange={selection.onToggleAll}
                    aria-label="Select all tasks"
                  />
                </th>
              ) : null}
              <TableHeaderCell
                label="Task"
                className={`${th} sticky-col sticky-col-1 w-[12rem] min-w-[12rem] max-w-[12rem]`}
              />
              <TableHeaderCell
                label="Task Status"
                className={`${th} sticky-col sticky-col-2 w-[9rem] min-w-[9rem]`}
              />
              <TableHeaderCell label="Progress" className={th} />
              <TableHeaderCell label="Assigned by" className={th} />
              {STUDENT_MASTER_CSV_HEADERS.map((h) => (
                <TableHeaderCell key={h} label={h} className={th} />
              ))}
              <TableHeaderCell label="Actions" className={th} />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e8edf5]">
            {loading ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-[#64748b]">
                  Loading linked leads...
                </td>
              </tr>
            ) : !rows.length ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-[#64748b]">
                  No student-lead tasks here. Assign a task with linked leads (or switch ownership tabs).
                </td>
              </tr>
            ) : (
              pageRows.map(({ key, task, lead, leadLoaded }) => {
                const linked = leadLoaded ? mapClientRowToTaskLinkedLead(lead) : null;
                const outreachOk = Boolean(canOutreach && linked);
                return (
                <tr key={key} className="hover:bg-[#fafcff]">
                  {selection ? (
                    <td className={td}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#1e3a5f]"
                        checked={selection.isSelected(task.id)}
                        onChange={() => selection.onToggle(task.id)}
                        aria-label={`Select task ${task.title}`}
                      />
                    </td>
                  ) : null}
                  <td
                    className={`${tdTrunc} sticky-col sticky-col-1 w-[12rem] min-w-[12rem] max-w-[12rem] font-medium text-[#0f172a]`}
                    title={task.title}
                  >
                    {task.title}
                  </td>
                  <td className={`${td} sticky-col sticky-col-2 w-[9rem] min-w-[9rem]`}>{task.status}</td>
                  <td className={td}>{task.progress}%</td>
                  <td className={td}>{task.assigner_display_name || "-"}</td>
                  <td
                    className={`${td} font-semibold`}
                    title={leadLoaded ? displayLeadName(lead) : "Run AJ_Academy_SB/tasks_linked_lead_access.sql to load student data"}
                  >
                    {displayLeadName(lead) || "-"}
                    {!leadLoaded ? <span className="ml-1 text-[10px] text-amber-700">(limited)</span> : null}
                  </td>
                  <td className={`${td} min-w-[11rem]`}>
                    <div className="flex justify-center">
                      <StudentOutreachButtons
                        mode="phone"
                        phone={lead.phone}
                        phoneCalled={lead.phone_called}
                        onPhoneClick={
                          outreachOk && linked && currentUserId && supabase
                            ? () => {
                                void (async () => {
                                  const phone = linked.phone?.trim();
                                  if (!phone) return;
                                  try {
                                    window.location.href = `tel:${phone}`;
                                    await logTaskLeadPhoneCall(supabase, {
                                      taskId: task.id,
                                      lead: linked,
                                      userId: currentUserId,
                                      phone,
                                    });
                                    onOutreachSuccess?.(`Call logged for ${linked.name}.`);
                                    onOutreachUpdated?.();
                                  } catch (e) {
                                    onOutreachError?.(e instanceof Error ? e.message : "Could not log call.");
                                  }
                                })();
                              }
                            : undefined
                        }
                      />
                    </div>
                  </td>
                  <td className={td}>
                    <div className="flex justify-center">
                      <StudentOutreachButtons
                        mode="whatsapp"
                        phone={lead.phone}
                        whatsapp={lead.whatsapp}
                        whatsappSent={lead.whatsapp_sent}
                        onWhatsAppClick={
                          outreachOk && linked ? () => setWaTarget({ taskId: task.id, lead: linked }) : undefined
                        }
                      />
                    </div>
                  </td>
                  <td className={td}>
                    <div className="flex justify-center">
                      <StudentOutreachButtons
                        mode="email"
                        email={lead.email}
                        emailSent={lead.email_sent}
                        onEmailClick={
                          outreachOk && linked ? () => setEmailTarget({ taskId: task.id, lead: linked }) : undefined
                        }
                      />
                    </div>
                  </td>
                  <td className={td}>{lead.city || "-"}</td>
                  <td className={tdTrunc}>{lead.current_profile || "-"}</td>
                  <td className={td}>{lead.degree || "-"}</td>
                  <td className={tdTrunc}>{lead.college_company || lead.company_name || "-"}</td>
                  <td className={td}>{lead.year_of_passing || "-"}</td>
                  <td className={td}>{lead.employment_status || "-"}</td>
                  <td className={td}>{lead.current_salary != null ? String(lead.current_salary) : "-"}</td>
                  <td className={tdTrunc}>{lead.interested_program || lead.service_interest || "-"}</td>
                  <td className={tdTrunc}>{lead.career_goal || "-"}</td>
                  <td className={tdTrunc}>{lead.preferred_job_role || "-"}</td>
                  <td className={td}>{lead.target_salary != null ? String(lead.target_salary) : "-"}</td>
                  <td className={td}>{lead.current_skill_level || "-"}</td>
                  <td className={tdTrunc}>{lead.main_career_problem || "-"}</td>
                  <td className={td}>{lead.joining_timeline || "-"}</td>
                  <td className={td}>{lead.budget != null ? String(lead.budget) : "-"}</td>
                  <td className={td}>{lead.payment_plan || "-"}</td>
                  <td className={td}>{lead.parent_approval_required || "-"}</td>
                  <td className={td}>{lead.decision_maker || "-"}</td>
                  <td className={td}>{lead.preferred_batch || "-"}</td>
                  <td className={td}>{lead.laptop_availability || "-"}</td>
                  <td className={td}>{lead.source || "-"}</td>
                  <td className={td}>{lead.assigned_to ? employeeNameMap[lead.assigned_to] || "-" : "-"}</td>
                  <td className={td}>{lead.lead_stage || "-"}</td>
                  <td className={td}>
                    <LeadStatusBadge status={lead.status} />
                  </td>
                  <td className={td}>{lead.priority || "-"}</td>
                  <td className={tdTrunc}>{lead.primary_objection || "-"}</td>
                  <td className={td}>{formatDisplayDate(lead.follow_up_date)}</td>
                  <td className={td}>{lead.fee_quoted != null ? String(lead.fee_quoted) : "-"}</td>
                  <td className={td}>{lead.final_fee != null ? String(lead.final_fee) : "-"}</td>
                  <td className={td}>{lead.payment_status || "-"}</td>
                  <td className={td}>{lead.admission_status || "-"}</td>
                  <td className={td}>
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-full px-2 text-[11px]"
                        onClick={() => onViewLead(task, lead, leadLoaded)}
                      >
                        View
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-full px-2 text-[11px]"
                        disabled={!leadLoaded}
                        onClick={() => onActivityLead(task, lead)}
                      >
                        Activity
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-full px-2 text-[11px]"
                        disabled={!leadLoaded}
                        onClick={() => (onEditLead ?? onViewLead)(task, lead, leadLoaded)}
                      >
                        Edit
                      </Button>
                    </div>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <TablePagination
        page={page}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
      <WhatsAppComposeModal
        open={!!waTarget}
        leadName={waTarget?.lead.name ?? ""}
        phone={waTarget?.lead.whatsapp || waTarget?.lead.phone || ""}
        templates={[]}
        submitting={outreachBusy}
        onClose={() => !outreachBusy && setWaTarget(null)}
        onSend={(message) => {
          void (async () => {
            if (!waTarget || !currentUserId || !supabase) return;
            const trimmed = message.trim();
            if (!trimmed) {
              onOutreachError?.("Enter a message.");
              return;
            }
            const wa = whatsAppHref(waTarget.lead.whatsapp || waTarget.lead.phone, trimmed);
            if (!wa) {
              onOutreachError?.("No WhatsApp number.");
              return;
            }
            setOutreachBusy(true);
            try {
              window.open(wa, "_blank", "noopener,noreferrer");
              await logTaskLeadWhatsApp(supabase, {
                taskId: waTarget.taskId,
                lead: waTarget.lead,
                userId: currentUserId,
                messagePreview: trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed,
              });
              onOutreachSuccess?.("WhatsApp logged on lead and task activity.");
              onOutreachUpdated?.();
              setWaTarget(null);
            } catch (e) {
              onOutreachError?.(e instanceof Error ? e.message : "Could not log WhatsApp.");
            } finally {
              setOutreachBusy(false);
            }
          })();
        }}
      />
      <EmailComposeModal
        open={!!emailTarget}
        leadName={emailTarget?.lead.name ?? ""}
        email={emailTarget?.lead.email ?? ""}
        templates={[]}
        submitting={outreachBusy}
        onClose={() => !outreachBusy && setEmailTarget(null)}
        onSend={(message) => {
          void (async () => {
            if (!emailTarget || !currentUserId || !supabase) return;
            const trimmed = message.trim();
            if (!trimmed) {
              onOutreachError?.("Enter a message.");
              return;
            }
            const to = emailTarget.lead.email?.trim();
            if (!to) {
              onOutreachError?.("No email address.");
              return;
            }
            setOutreachBusy(true);
            try {
              window.location.href = `mailto:${encodeURIComponent(to)}?body=${encodeURIComponent(trimmed)}`;
              await logTaskLeadEmail(supabase, {
                taskId: emailTarget.taskId,
                lead: emailTarget.lead,
                userId: currentUserId,
                subject: trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed,
              });
              onOutreachSuccess?.("Email logged on lead and task activity.");
              onOutreachUpdated?.();
              setEmailTarget(null);
            } catch (e) {
              onOutreachError?.(e instanceof Error ? e.message : "Could not log email.");
            } finally {
              setOutreachBusy(false);
            }
          })();
        }}
      />
    </div>
  );
}

/** College Visits-shaped grid for My Tasks → College Visit (matches College Visits All Colleges columns). */
export function TaskSubsectionCollegesTable({
  rows,
  ownerNameMap,
  loading,
  onViewCollege,
  onActivityCollege,
  onEditCollege,
  selection,
}: {
  rows: TaskCollegeFlatRow[];
  ownerNameMap: Record<string, string>;
  loading?: boolean;
  onViewCollege: (task: TaskRecord, college: CollegeVisitRow, collegeLoaded: boolean) => void;
  onActivityCollege: (task: TaskRecord, college: CollegeVisitRow) => void;
  onEditCollege: (task: TaskRecord, college: CollegeVisitRow, collegeLoaded: boolean) => void;
  selection?: SubsectionSelection;
}) {
  const {
    paginatedItems: pageRows,
    page,
    setPage,
    totalPages,
    totalItems,
    pageSize,
    setPageSize,
  } = usePagination(rows, 25);

  const [contactByRow, setContactByRow] = useState<Record<string, string>>({});
  const th = TABLE_DATA_TH;
  const td = TABLE_DATA_TD;
  const colSpan = 25 + (selection ? 1 : 0);

  return (
    <div className="overflow-hidden rounded-[20px] border border-[#dbe6f3] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table
          className="table-freeze-cols w-full min-w-[3200px] text-sm"
          style={
            {
              ["--sticky-check-w" as string]: "2.75rem",
              ["--sticky-col-2" as string]: "4.25rem",
            } as CSSProperties
          }
        >
          <thead className="cv-head bg-[#f8fbff]">
            <tr>
              {selection ? (
                <th className={TABLE_CHECK_TH}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#1e3a5f]"
                    checked={selection.allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = selection.someSelected && !selection.allSelected;
                    }}
                    onChange={selection.onToggleAll}
                    aria-label="Select all tasks"
                  />
                </th>
              ) : (
                <th className={TABLE_CHECK_TH} aria-hidden />
              )}
              <TableHeaderCell label="S.No" className={TABLE_SNO_TH} />
              <TableHeaderCell
                label="College Name"
                className={`${th} sticky-col sticky-col-after-check-2 min-w-[14rem]`}
              />
              <TableHeaderCell label="Task" className={`${th} min-w-[11rem]`} />
              <TableHeaderCell label="Location" className={th} />
              <TableHeaderCell label="Call" className={`${th} min-w-[5.5rem]`} />
              <TableHeaderCell label="WhatsApp" className={`${th} min-w-[5.5rem]`} />
              <TableHeaderCell label="Email" className={`${th} min-w-[5.5rem]`} />
              <TableHeaderCell label="Connected Person Name" className={th} />
              <TableHeaderCell label="Role" className={th} />
              <TableHeaderCell label="Visit Status" className={th} />
              <TableHeaderCell label="Visit Date" className={th} />
              <TableHeaderCell label="MOU Signed Status" className={th} />
              <TableHeaderCell label="Follow-up Stage" className={th} />
              <TableHeaderCell label="Last Follow-up Date" className={th} />
              <TableHeaderCell label="Next Follow-up Date" className={th} />
              <TableHeaderCell label="Priority" className={th} />
              <TableHeaderCell label="Owner" className={th} />
              <TableHeaderCell label="Description" className={th} />
              <TableHeaderCell label="Last Outcome / Remarks" className={th} />
              <TableHeaderCell label="Days Since Last Follow-up" className={th} />
              <TableHeaderCell label="Follow-up Due?" className={th} />
              <TableHeaderCell label="Lead Score" className={th} />
              <TableHeaderCell label="Final Status" className={th} />
              <TableHeaderCell label="Source / Reference" className={th} />
              <TableHeaderCell label="Actions" className={th} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-[#64748b]">
                  Loading linked colleges...
                </td>
              </tr>
            ) : !rows.length ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-[#64748b]">
                  No college-visit tasks here. Assign a task with linked colleges (or switch ownership tabs).
                </td>
              </tr>
            ) : (
              pageRows.map(({ key, task, college, collegeLoaded }, idx) => {
                const days = daysSince(college.last_follow_up_date);
                const due = isFollowUpDue(college);
                const globalIdx = (page - 1) * pageSize + idx + 1;
                const contacts = collegeContactsForRow(college);
                const selectedId = contactByRow[key] || contacts[0]?.id || "";
                const selectedContact = selectedCollegeContact(college, selectedId);
                const phone = anyCollegeOutreachPhone(college);
                const email = anyCollegeOutreachEmail(college);
                const person = selectedContact?.name?.trim() || college.connected_person_name || "-";
                const personRole = selectedContact?.role?.trim() || college.connected_person_role || "";
                return (
                  <tr key={key} className="border-t border-[#eef2f7] hover:bg-[#fafcff]">
                    {selection ? (
                      <td className={TABLE_CHECK_TD}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[#1e3a5f]"
                          checked={selection.isSelected(task.id)}
                          onChange={() => selection.onToggle(task.id)}
                          aria-label={`Select task ${task.title}`}
                        />
                      </td>
                    ) : (
                      <td className={TABLE_CHECK_TD} aria-hidden />
                    )}
                    <td className={TABLE_SNO_TD}>{globalIdx}</td>
                    <td
                      className={`${td} sticky-col sticky-col-after-check-2 min-w-[14rem] max-w-[18rem] truncate font-medium`}
                      title={collegeLoaded ? college.college_name : "College CRM row not loaded"}
                    >
                      {college.college_name}
                      {!collegeLoaded ? <span className="ml-1 text-[10px] text-amber-700">(limited)</span> : null}
                    </td>
                    <td className={`${td} min-w-[11rem] max-w-[14rem] truncate`} title={`${task.title} (${task.status})`}>
                      {task.title}
                    </td>
                    <td className={td}>{college.location || "-"}</td>
                    <td className={`${td} min-w-[5.5rem]`}>
                      <StudentOutreachButtons
                        mode="phone"
                        phone={phone}
                        phoneCalled={false}
                        onPhoneClick={() => {
                          if (!phone) return;
                          window.location.href = `tel:${phone}`;
                        }}
                      />
                    </td>
                    <td className={`${td} min-w-[5.5rem]`}>
                      <StudentOutreachButtons
                        mode="whatsapp"
                        phone={phone}
                        whatsapp={phone}
                        whatsappSent={false}
                        onWhatsAppClick={() => {
                          const wa = whatsAppHref(phone, "");
                          if (wa) window.open(wa, "_blank", "noopener,noreferrer");
                        }}
                      />
                    </td>
                    <td className={`${td} min-w-[5.5rem]`}>
                      <StudentOutreachButtons
                        mode="email"
                        email={email}
                        emailSent={false}
                        onEmailClick={() => {
                          if (!email) return;
                          window.location.href = `mailto:${email}`;
                        }}
                      />
                    </td>
                    <td className={`${td} min-w-[12rem]`}>{person}</td>
                    <td className={`${td} min-w-[14rem]`}>
                      {contacts.length > 1 ? (
                        <select
                          className="w-full max-w-[16rem] rounded-md border border-[#e2e8f0] bg-white px-2 py-1.5 text-xs text-[#0f172a] outline-none focus:border-[#c4a35a] focus:ring-1 focus:ring-[#c4a35a]/40"
                          value={selectedContact?.id || contacts[0]?.id || ""}
                          onChange={(e) => setContactByRow((prev) => ({ ...prev, [key]: e.target.value }))}
                          aria-label={`Select contact for ${college.college_name}`}
                        >
                          {contacts.map((c) => (
                            <option key={c.id} value={c.id}>
                              {contactRoleSelectLabel(c)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        personRole || "-"
                      )}
                    </td>
                    <td className={td}>{college.visit_status}</td>
                    <td className={`${td} min-w-[11rem]`}>{formatDisplayDate(college.visit_date)}</td>
                    <td className={`${td} min-w-[11rem]`}>{college.mou_signed_status}</td>
                    <td className={`${td} min-w-[11rem]`}>{college.follow_up_stage || "-"}</td>
                    <td className={`${td} min-w-[11rem]`}>{formatDisplayDate(college.last_follow_up_date)}</td>
                    <td className={`${td} min-w-[11rem]`}>{formatDisplayDate(college.next_follow_up_date)}</td>
                    <td className={td}>{college.priority}</td>
                    <td className={`${td} min-w-[11rem]`}>
                      {college.assigned_to ? ownerNameMap[college.assigned_to] || "-" : "-"}
                    </td>
                    <td className={`${td} min-w-[14rem] max-w-[18rem] truncate`} title={college.description ?? ""}>
                      {college.description || "-"}
                    </td>
                    <td
                      className={`${td} min-w-[14rem] max-w-[18rem] truncate`}
                      title={college.last_outcome_remarks ?? ""}
                    >
                      {college.last_outcome_remarks || "-"}
                    </td>
                    <td className={`${td} min-w-[12rem]`}>{days != null ? days : "-"}</td>
                    <td className={td}>
                      <span
                        className={
                          due
                            ? "inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700"
                            : "inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600"
                        }
                      >
                        {due ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className={td}>{college.lead_score}</td>
                    <td className={td}>{college.final_status}</td>
                    <td className={`${td} min-w-[11rem]`}>{college.source_reference || "-"}</td>
                    <td className={`${td} min-w-[14rem]`}>
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 rounded-full px-2 text-[11px]"
                          onClick={() => onViewCollege(task, college, collegeLoaded)}
                        >
                          View
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 rounded-full px-2 text-[11px]"
                          disabled={!collegeLoaded}
                          onClick={() => onActivityCollege(task, college)}
                        >
                          Activity
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 rounded-full px-2 text-[11px]"
                          disabled={!collegeLoaded}
                          onClick={() => onEditCollege(task, college, collegeLoaded)}
                        >
                          Edit
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <TablePagination
        page={page}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}
