"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { TableHeaderCell } from "@/components/ui/TableHeaderFilter";
import { TablePagination } from "@/components/ui/TablePagination";
import { usePagination } from "@/lib/usePagination";
import { buildPageSelectionScope } from "@/lib/useRowSelection";
import { STUDENT_MASTER_CSV_HEADERS } from "@/components/student-lead-master/studentMasterCsv";
import { displayLeadName, type CrmClientRow } from "@/components/student-lead-master/studentMasterHelpers";
import { StudentOutreachButtons } from "@/components/student-lead-master/StudentOutreachButtons";
import { WhatsAppComposeModal } from "@/components/shared/WhatsAppComposeModal";
import { EmailComposeModal } from "@/components/shared/EmailComposeModal";
import type { EmailComposeSubmitPayload } from "@/components/shared/EmailComposeModal";
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
import { navigateWithoutAppPopup } from "@/lib/browser/sameWindowDownload";
import {
  logTaskLeadEmail,
  logTaskLeadPhoneCall,
  logTaskLeadWhatsApp,
  mapClientRowToTaskLinkedLead,
  type TaskLinkedLead,
} from "@/lib/taskLeadOutreach";
import {
  formatEmailActivityNotes,
  formatWhatsAppActivityNotes,
  MAX_EMAIL_MESSAGE_LENGTH,
  MAX_WHATSAPP_MESSAGE_LENGTH,
} from "@/lib/whatsappOutreach";
import { logTaskActivity } from "@/lib/taskActivities";
import { formatDisplayDate } from "@/lib/datetime";
import { isGenericRoleLabel } from "@/lib/profileDisplayName";
import { createClient } from "@/lib/supabase/client";
import type { TaskRecord } from "@/types/task";
import type { CSSProperties } from "react";

export type TaskLeadFlatRow = {
  key: string;
  task: TaskRecord;
  lead: CrmClientRow;
  leadLoaded: boolean;
};

type CollegeOutreachFlags = {
  phoneCalled?: boolean;
  whatsappSent?: boolean;
  emailSent?: boolean;
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
    visited_by: null,
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
  const byLeadId = new Map<string, TaskLeadFlatRow>();
  const unlinked: TaskLeadFlatRow[] = [];

  for (const task of tasks) {
    if ((task.assignment_type ?? "") !== "lead") continue;
    const ids = task.client_ids ?? [];
    if (!ids.length) {
      unlinked.push({
        key: `${task.id}:none`,
        task,
        lead: placeholderLead(task.id),
        leadLoaded: false,
      });
      continue;
    }
    for (const id of ids) {
      const lead = leadById[id];
      if (!lead) continue;
      const candidate: TaskLeadFlatRow = {
        key: id,
        task,
        lead,
        leadLoaded: true,
      };
      const prev = byLeadId.get(id);
      if (!prev || task.updated_at.localeCompare(prev.task.updated_at) > 0) {
        byLeadId.set(id, candidate);
      }
    }
  }

  return [...byLeadId.values(), ...unlinked];
}

export function flattenTaskColleges(
  tasks: TaskRecord[],
  collegeById: Record<string, CollegeVisitRow>,
): TaskCollegeFlatRow[] {
  const byCollegeId = new Map<string, TaskCollegeFlatRow>();
  const unlinked: TaskCollegeFlatRow[] = [];

  for (const task of tasks) {
    if ((task.assignment_type ?? "") !== "college") continue;
    const ids = task.college_visit_ids ?? [];
    if (!ids.length) {
      unlinked.push({
        key: `${task.id}:none`,
        task,
        college: placeholderCollege(task.id),
        collegeLoaded: false,
      });
      continue;
    }
    for (const id of ids) {
      const college = collegeById[id];
      if (!college) continue;
      const candidate: TaskCollegeFlatRow = {
        key: id,
        task,
        college,
        collegeLoaded: true,
      };
      const prev = byCollegeId.get(id);
      if (!prev || task.updated_at.localeCompare(prev.task.updated_at) > 0) {
        byCollegeId.set(id, candidate);
      }
    }
  }

  return [...byCollegeId.values(), ...unlinked];
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
  isSelected: (rowKey: string) => boolean;
  onToggle: (rowKey: string) => void;
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
  const [emailComposeProvider, setEmailComposeProvider] = useState<"zoho" | "gmail">("zoho");
  const [emailProviderPicker, setEmailProviderPicker] = useState<{ taskId: string; lead: TaskLinkedLead } | null>(
    null,
  );
  const [outreachBusy, setOutreachBusy] = useState(false);

  const pageRowKeys = useMemo(() => pageRows.map(({ key }) => key), [pageRows]);
  const pageSelection = useMemo(
    () =>
      selection
        ? buildPageSelectionScope(selection.isSelected, selection.onToggle, pageRowKeys)
        : null,
    [selection, pageRowKeys],
  );

  const th =
    "min-w-[10.5rem] whitespace-nowrap px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-[#64748b]";
  const td = "whitespace-nowrap px-4 py-3 text-center text-xs text-[#334155]";
  const tdTrunc = `${td} max-w-[160px] truncate`;
  const colSpan = STUDENT_MASTER_CSV_HEADERS.length + 6 + (selection ? 1 : 0);

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
              {selection && pageSelection ? (
                <th className={`${th} w-10 min-w-[2.5rem]`}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#1e3a5f]"
                    checked={pageSelection.allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = pageSelection.someSelected && !pageSelection.allSelected;
                    }}
                    onChange={pageSelection.onToggleAll}
                    aria-label="Select all tasks on this page"
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
              <TableHeaderCell label="Assigned To" className={th} />
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
                        checked={selection.isSelected(key)}
                        onChange={() => selection.onToggle(key)}
                        aria-label={`Select row for ${task.title}`}
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
                  <td className={`${td} font-medium text-[#0f172a]`}>
                    {(task.assigned_to && employeeNameMap[task.assigned_to]) ||
                      (!isGenericRoleLabel(task.assignee_name) ? task.assignee_name : null) ||
                      task.assignee_email ||
                      "-"}
                  </td>
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
                          outreachOk && linked ? () => setEmailProviderPicker({ taskId: task.id, lead: linked }) : undefined
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
              navigateWithoutAppPopup(wa);
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
        advanced
        providerOptions={["zoho", "gmail"]}
        defaultProvider={emailComposeProvider}
        defaultSubject={emailTarget ? `AJ Academy follow-up for ${emailTarget.lead.name}` : ""}
        submitting={outreachBusy}
        onClose={() => {
          if (!outreachBusy) {
            setEmailTarget(null);
            setEmailComposeProvider("zoho");
          }
        }}
        onSend={() => undefined}
        onSendDetailed={(payload) => {
          void (async () => {
            if (!emailTarget || !currentUserId || !supabase) return;
            const trimmed = payload.message.trim();
            if (!trimmed) {
              onOutreachError?.("Enter a message.");
              return;
            }
            if (trimmed.length > MAX_EMAIL_MESSAGE_LENGTH) {
              onOutreachError?.(`Message is too long (max ${MAX_EMAIL_MESSAGE_LENGTH} characters).`);
              return;
            }
            const to = (payload.to || emailTarget.lead.email || "").trim();
            if (!to) {
              onOutreachError?.("No email address.");
              return;
            }
            setOutreachBusy(true);
            try {
              const subject = payload.subject.trim() || `AJ Academy follow-up for ${emailTarget.lead.name}`;
              const res = await fetch("/api/outreach/send-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  provider: payload.provider,
                  to,
                  cc: payload.cc,
                  subject,
                  body: trimmed,
                  attachments: payload.attachments,
                }),
              });
              const json = (await res.json()) as { error?: string; from?: string };
              if (!res.ok) throw new Error(json.error ?? "Email failed.");

              const notes = formatEmailActivityNotes(trimmed, {
                provider: payload.provider,
                from: json.from,
                to,
                cc: payload.cc,
                subject,
              });
              await logTaskLeadEmail(supabase, {
                taskId: emailTarget.taskId,
                lead: emailTarget.lead,
                userId: currentUserId,
                subject,
                notes,
              });
              onOutreachSuccess?.(
                `Email sent via ${payload.provider === "zoho" ? "Zoho" : "Gmail"} and logged on lead & task activity.`,
              );
              onOutreachUpdated?.();
              setEmailTarget(null);
            } catch (e) {
              onOutreachError?.(e instanceof Error ? e.message : "Could not send email.");
            } finally {
              setOutreachBusy(false);
            }
          })();
        }}
      />

      {emailProviderPicker ? (
        <>
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-[60] bg-slate-900/40"
            onClick={() => setEmailProviderPicker(null)}
          />
          <div className="fixed left-1/2 top-1/2 z-[70] w-[min(100vw-2rem,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#e8dcc8] bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold text-[#3d3428]">Choose mail provider</h3>
            <p className="mt-1 text-xs text-[#6b5d4d]">
              {emailProviderPicker.lead.name} · select how you want to send this email.
            </p>
            <div className="mt-4 grid gap-2">
              <Button
                type="button"
                className="h-10 rounded-xl bg-[#0ea5e9] text-white hover:bg-[#0284c7]"
                onClick={() => {
                  setEmailComposeProvider("zoho");
                  setEmailTarget(emailProviderPicker);
                  setEmailProviderPicker(null);
                }}
              >
                Zoho Mail
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl border-[#e8dcc8]"
                onClick={() => {
                  setEmailComposeProvider("gmail");
                  setEmailTarget(emailProviderPicker);
                  setEmailProviderPicker(null);
                }}
              >
                Gmail
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full rounded-xl border-[#e8dcc8]"
              onClick={() => setEmailProviderPicker(null)}
            >
              Cancel
            </Button>
          </div>
        </>
      ) : null}
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
  currentUserId,
  supabase,
  onOutreachUpdated,
  onOutreachError,
  onOutreachSuccess,
}: {
  rows: TaskCollegeFlatRow[];
  ownerNameMap: Record<string, string>;
  loading?: boolean;
  onViewCollege: (task: TaskRecord, college: CollegeVisitRow, collegeLoaded: boolean) => void;
  onActivityCollege: (task: TaskRecord, college: CollegeVisitRow) => void;
  onEditCollege: (task: TaskRecord, college: CollegeVisitRow, collegeLoaded: boolean) => void;
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

  const pageRowKeys = useMemo(() => pageRows.map(({ key }) => key), [pageRows]);
  const pageSelection = useMemo(
    () =>
      selection
        ? buildPageSelectionScope(selection.isSelected, selection.onToggle, pageRowKeys)
        : null,
    [selection, pageRowKeys],
  );

  const [contactByRow, setContactByRow] = useState<Record<string, string>>({});
  const [emailTarget, setEmailTarget] = useState<{
    taskId: string;
    college: CollegeVisitRow;
    email: string;
  } | null>(null);
  const [emailComposeProvider, setEmailComposeProvider] = useState<"zoho" | "gmail">("zoho");
  const [emailProviderPicker, setEmailProviderPicker] = useState<{
    taskId: string;
    college: CollegeVisitRow;
    email: string;
  } | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [waTarget, setWaTarget] = useState<{
    taskId: string;
    college: CollegeVisitRow;
    phone: string;
  } | null>(null);
  const [waBusy, setWaBusy] = useState(false);
  const [outreachFlags, setOutreachFlags] = useState<Record<string, CollegeOutreachFlags>>({});
  const th = TABLE_DATA_TH;
  const td = TABLE_DATA_TD;
  const colSpan = 26 + (selection ? 1 : 0);
  const canEmail = Boolean(currentUserId);

  const markOutreach = (collegeId: string, patch: CollegeOutreachFlags) => {
    setOutreachFlags((prev) => ({ ...prev, [collegeId]: { ...prev[collegeId], ...patch } }));
  };

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
              {selection && pageSelection ? (
                <th className={TABLE_CHECK_TH}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#1e3a5f]"
                    checked={pageSelection.allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = pageSelection.someSelected && !pageSelection.allSelected;
                    }}
                    onChange={pageSelection.onToggleAll}
                    aria-label="Select all tasks on this page"
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
              <TableHeaderCell label="Assigned To" className={`${th} min-w-[10rem]`} />
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
                const flags = outreachFlags[college.id] ?? {};
                const person = selectedContact?.name?.trim() || college.connected_person_name || "-";
                const personRole = selectedContact?.role?.trim() || college.connected_person_role || "";
                return (
                  <tr key={key} className="border-t border-[#eef2f7] hover:bg-[#fafcff]">
                    {selection ? (
                      <td className={TABLE_CHECK_TD}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[#1e3a5f]"
                          checked={selection.isSelected(key)}
                          onChange={() => selection.onToggle(key)}
                          aria-label={`Select row for ${task.title}`}
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
                    <td className={`${td} min-w-[10rem] font-medium text-[#0f172a]`}>
                      {(task.assigned_to && ownerNameMap[task.assigned_to]) ||
                        (!isGenericRoleLabel(task.assignee_name) ? task.assignee_name : null) ||
                        task.assignee_email ||
                        "-"}
                    </td>
                    <td className={td}>{college.location || "-"}</td>
                    <td className={`${td} min-w-[5.5rem]`}>
                      <StudentOutreachButtons
                        mode="phone"
                        phone={phone}
                        phoneCalled={flags.phoneCalled}
                        onPhoneClick={() => {
                          if (!phone) return;
                          markOutreach(college.id, { phoneCalled: true });
                          window.location.href = `tel:${phone}`;
                        }}
                      />
                    </td>
                    <td className={`${td} min-w-[5.5rem]`}>
                      <StudentOutreachButtons
                        mode="whatsapp"
                        phone={phone}
                        whatsapp={phone}
                        whatsappSent={flags.whatsappSent}
                        onWhatsAppClick={() => {
                          if (!whatsAppHref(phone)) {
                            onOutreachError?.("No WhatsApp number on this college.");
                            return;
                          }
                          setWaTarget({ taskId: task.id, college, phone });
                        }}
                      />
                    </td>
                    <td className={`${td} min-w-[5.5rem]`}>
                      <StudentOutreachButtons
                        mode="email"
                        email={email}
                        emailSent={flags.emailSent}
                        onEmailClick={() => {
                          if (!email || !canEmail) {
                            if (!email) onOutreachError?.("No email address on this college.");
                            return;
                          }
                          const contactEmail =
                            selectedContact?.email?.trim() ||
                            college.email?.trim() ||
                            email;
                          setEmailProviderPicker({
                            taskId: task.id,
                            college,
                            email: contactEmail,
                          });
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

      {waTarget ? (
        <WhatsAppComposeModal
          open={Boolean(waTarget)}
          leadName={waTarget.college.college_name}
          phone={waTarget.phone}
          templates={[]}
          submitting={waBusy}
          onClose={() => {
            if (!waBusy) setWaTarget(null);
          }}
          onSend={(message) => {
            void (async () => {
              if (!waTarget) return;
              const trimmed = message.trim();
              if (!trimmed) {
                onOutreachError?.("Enter a message before opening WhatsApp.");
                return;
              }
              if (trimmed.length > MAX_WHATSAPP_MESSAGE_LENGTH) {
                onOutreachError?.(`Message is too long (max ${MAX_WHATSAPP_MESSAGE_LENGTH} characters).`);
                return;
              }
              const wa = whatsAppHref(waTarget.phone, trimmed);
              if (!wa) {
                onOutreachError?.("No WhatsApp number on this college.");
                return;
              }

              setWaBusy(true);
              markOutreach(waTarget.college.id, { whatsappSent: true });
              navigateWithoutAppPopup(wa);

              try {
                const actRes = await fetch(`/api/college-visits/${waTarget.college.id}/activities`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    activity_type: "WhatsApp Message",
                    notes: formatWhatsAppActivityNotes(trimmed),
                  }),
                });
                if (!actRes.ok) {
                  const actJson = (await actRes.json().catch(() => ({}))) as { error?: string };
                  throw new Error(actJson.error || "WhatsApp opened but could not log college activity.");
                }

                if (supabase && currentUserId) {
                  await logTaskActivity(supabase, {
                    taskId: waTarget.taskId,
                    actorId: currentUserId,
                    activityType: "college_whatsapp",
                    notes: `WhatsApp to ${waTarget.college.college_name}`,
                    metadata: { college_visit_id: waTarget.college.id },
                  });
                }

                onOutreachSuccess?.("WhatsApp opened and logged for admin & employee tracking.");
                onOutreachUpdated?.();
                setWaTarget(null);
              } catch (e) {
                onOutreachError?.(e instanceof Error ? e.message : "Could not log WhatsApp.");
              } finally {
                setWaBusy(false);
              }
            })();
          }}
        />
      ) : null}

      {emailTarget ? (
        <EmailComposeModal
          open={Boolean(emailTarget)}
          leadName={emailTarget.college.college_name}
          email={emailTarget.email}
          templates={[]}
          advanced
          providerOptions={["zoho", "gmail"]}
          defaultProvider={emailComposeProvider}
          defaultSubject={`AJ Academy follow-up for ${emailTarget.college.college_name}`}
          submitting={emailBusy}
          onClose={() => {
            if (!emailBusy) {
              setEmailTarget(null);
              setEmailComposeProvider("zoho");
            }
          }}
          onSend={() => undefined}
          onSendDetailed={(payload: EmailComposeSubmitPayload) => {
            void (async () => {
              if (!emailTarget || !currentUserId) return;
              const trimmed = payload.message.trim();
              if (!trimmed) {
                onOutreachError?.("Enter a message.");
                return;
              }
              if (trimmed.length > MAX_EMAIL_MESSAGE_LENGTH) {
                onOutreachError?.(`Message is too long (max ${MAX_EMAIL_MESSAGE_LENGTH} characters).`);
                return;
              }
              const to = (payload.to || emailTarget.email || "").trim();
              if (!to) {
                onOutreachError?.("No email address.");
                return;
              }
              setEmailBusy(true);
              try {
                const subject =
                  payload.subject.trim() || `AJ Academy follow-up for ${emailTarget.college.college_name}`;
                const res = await fetch("/api/outreach/send-email", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    provider: payload.provider,
                    to,
                    cc: payload.cc,
                    subject,
                    body: trimmed,
                    attachments: payload.attachments,
                  }),
                });
                const json = (await res.json()) as { error?: string; from?: string };
                if (!res.ok) throw new Error(json.error ?? "Email failed.");

                const notes = formatEmailActivityNotes(trimmed, {
                  provider: payload.provider,
                  from: json.from,
                  to,
                  cc: payload.cc,
                  subject,
                });

                const actRes = await fetch(`/api/college-visits/${emailTarget.college.id}/activities`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ activity_type: "Email", notes }),
                });
                if (!actRes.ok) {
                  const actJson = (await actRes.json().catch(() => ({}))) as { error?: string };
                  throw new Error(actJson.error || "Email sent but could not log college activity.");
                }

                if (supabase) {
                  await logTaskActivity(supabase, {
                    taskId: emailTarget.taskId,
                    actorId: currentUserId,
                    activityType: "college_email",
                    notes: `Email to ${emailTarget.college.college_name}: ${subject}`,
                    metadata: { college_visit_id: emailTarget.college.id },
                  });
                }

                markOutreach(emailTarget.college.id, { emailSent: true });
                onOutreachSuccess?.(
                  `Email sent via ${payload.provider === "zoho" ? "Zoho" : "Gmail"} and logged for admin & employee tracking.`,
                );
                onOutreachUpdated?.();
                setEmailTarget(null);
              } catch (e) {
                onOutreachError?.(e instanceof Error ? e.message : "Could not send email.");
              } finally {
                setEmailBusy(false);
              }
            })();
          }}
        />
      ) : null}

      {emailProviderPicker ? (
        <>
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-[60] bg-slate-900/40"
            onClick={() => setEmailProviderPicker(null)}
          />
          <div className="fixed left-1/2 top-1/2 z-[70] w-[min(100vw-2rem,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#e8dcc8] bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold text-[#3d3428]">Choose mail provider</h3>
            <p className="mt-1 text-xs text-[#6b5d4d]">
              {emailProviderPicker.college.college_name} · select how you want to send this email.
            </p>
            <div className="mt-4 grid gap-2">
              <Button
                type="button"
                className="h-10 rounded-xl bg-[#0ea5e9] text-white hover:bg-[#0284c7]"
                onClick={() => {
                  setEmailComposeProvider("zoho");
                  setEmailTarget(emailProviderPicker);
                  setEmailProviderPicker(null);
                }}
              >
                Zoho Mail
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl border-[#e8dcc8]"
                onClick={() => {
                  setEmailComposeProvider("gmail");
                  setEmailTarget(emailProviderPicker);
                  setEmailProviderPicker(null);
                }}
              >
                Gmail
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full rounded-xl border-[#e8dcc8]"
              onClick={() => setEmailProviderPicker(null)}
            >
              Cancel
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
