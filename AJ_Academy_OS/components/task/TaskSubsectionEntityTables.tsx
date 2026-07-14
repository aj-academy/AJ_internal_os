"use client";

import { TableHeaderCell } from "@/components/ui/TableHeaderFilter";
import { STUDENT_MASTER_CSV_HEADERS } from "@/components/student-lead-master/studentMasterCsv";
import { displayLeadName, type CrmClientRow } from "@/components/student-lead-master/studentMasterHelpers";
import { COLLEGE_VISIT_CSV_HEADERS } from "@/components/college-visits/collegeVisitsCsv";
import { daysSince, isFollowUpDue, type CollegeVisitRow } from "@/components/college-visits/collegeVisitsHelpers";
import { formatDisplayDate } from "@/lib/datetime";
import type { TaskRecord } from "@/types/task";

export type TaskLeadFlatRow = {
  key: string;
  task: TaskRecord;
  lead: CrmClientRow;
};

export type TaskCollegeFlatRow = {
  key: string;
  task: TaskRecord;
  college: CollegeVisitRow;
};

export function flattenTaskLeads(
  tasks: TaskRecord[],
  leadById: Record<string, CrmClientRow>,
): TaskLeadFlatRow[] {
  const out: TaskLeadFlatRow[] = [];
  for (const task of tasks) {
    if ((task.assignment_type ?? "") !== "lead") continue;
    for (const id of task.client_ids ?? []) {
      const lead = leadById[id];
      if (!lead) continue;
      out.push({ key: `${task.id}:${id}`, task, lead });
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
    for (const id of task.college_visit_ids ?? []) {
      const college = collegeById[id];
      if (!college) continue;
      out.push({ key: `${task.id}:${id}`, task, college });
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

/** Student Master–shaped grid for My Tasks → Student Lead subsection. */
export function TaskSubsectionLeadsTable({
  rows,
  employeeNameMap,
  loading,
}: {
  rows: TaskLeadFlatRow[];
  employeeNameMap: Record<string, string>;
  loading?: boolean;
}) {
  const th = "min-w-[10.5rem] whitespace-nowrap px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-[#64748b]";
  const td = "whitespace-nowrap px-4 py-3 text-center text-xs text-[#334155]";
  const tdTrunc = `${td} max-w-[160px] truncate`;

  return (
    <div className="overflow-hidden rounded-[20px] border border-[#dbe6f3] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="table-freeze-cols w-full min-w-[5200px] text-sm" style={{ ["--sticky-col-2" as string]: "11rem" }}>
          <thead className="bg-[#f1f6fc]">
            <tr>
              <TableHeaderCell label="Task" className={`${th} sticky-col sticky-col-1 min-w-[12rem]`} />
              <TableHeaderCell label="Task Status" className={`${th} sticky-col sticky-col-2 min-w-[9rem]`} />
              {STUDENT_MASTER_CSV_HEADERS.map((h) => (
                <TableHeaderCell key={h} label={h} className={th} />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e8edf5]">
            {loading ? (
              <tr>
                <td colSpan={STUDENT_MASTER_CSV_HEADERS.length + 2} className="px-4 py-8 text-center text-sm text-[#64748b]">
                  Loading linked leads…
                </td>
              </tr>
            ) : !rows.length ? (
              <tr>
                <td colSpan={STUDENT_MASTER_CSV_HEADERS.length + 2} className="px-4 py-8 text-center text-sm text-[#64748b]">
                  No student leads linked on these tasks yet.
                </td>
              </tr>
            ) : (
              rows.map(({ key, task, lead }) => (
                <tr key={key} className="hover:bg-[#fafcff]">
                  <td className={`${tdTrunc} sticky-col sticky-col-1 font-medium text-[#0f172a]`} title={task.title}>
                    {task.title}
                  </td>
                  <td className={`${td} sticky-col sticky-col-2`}>{task.status}</td>
                  <td className={`${td} font-semibold`}>{displayLeadName(lead)}</td>
                  <td className={td}>{lead.phone || "—"}</td>
                  <td className={td}>{lead.whatsapp || "—"}</td>
                  <td className={tdTrunc}>{lead.email || "—"}</td>
                  <td className={td}>{lead.city || "—"}</td>
                  <td className={tdTrunc}>{lead.current_profile || "—"}</td>
                  <td className={td}>{lead.degree || "—"}</td>
                  <td className={tdTrunc}>{lead.college_company || lead.company_name || "—"}</td>
                  <td className={td}>{lead.year_of_passing || "—"}</td>
                  <td className={td}>{lead.employment_status || "—"}</td>
                  <td className={td}>{lead.current_salary != null ? String(lead.current_salary) : "—"}</td>
                  <td className={tdTrunc}>{lead.interested_program || lead.service_interest || "—"}</td>
                  <td className={tdTrunc}>{lead.career_goal || "—"}</td>
                  <td className={tdTrunc}>{lead.preferred_job_role || "—"}</td>
                  <td className={td}>{lead.target_salary != null ? String(lead.target_salary) : "—"}</td>
                  <td className={td}>{lead.current_skill_level || "—"}</td>
                  <td className={tdTrunc}>{lead.main_career_problem || "—"}</td>
                  <td className={td}>{lead.joining_timeline || "—"}</td>
                  <td className={td}>{lead.budget != null ? String(lead.budget) : "—"}</td>
                  <td className={td}>{lead.payment_plan || "—"}</td>
                  <td className={td}>{lead.parent_approval_required || "—"}</td>
                  <td className={td}>{lead.decision_maker || "—"}</td>
                  <td className={td}>{lead.preferred_batch || "—"}</td>
                  <td className={td}>{lead.laptop_availability || "—"}</td>
                  <td className={td}>{lead.source || "—"}</td>
                  <td className={td}>{lead.assigned_to ? employeeNameMap[lead.assigned_to] || "—" : "—"}</td>
                  <td className={td}>{lead.lead_stage || "—"}</td>
                  <td className={td}>
                    <LeadStatusBadge status={lead.status} />
                  </td>
                  <td className={td}>{lead.priority || "—"}</td>
                  <td className={tdTrunc}>{lead.primary_objection || "—"}</td>
                  <td className={td}>{formatDisplayDate(lead.follow_up_date)}</td>
                  <td className={td}>{lead.fee_quoted != null ? String(lead.fee_quoted) : "—"}</td>
                  <td className={td}>{lead.final_fee != null ? String(lead.final_fee) : "—"}</td>
                  <td className={td}>{lead.payment_status || "—"}</td>
                  <td className={td}>{lead.admission_status || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** College Visits–shaped grid for My Tasks → College Visit subsection. */
export function TaskSubsectionCollegesTable({
  rows,
  ownerNameMap,
  loading,
}: {
  rows: TaskCollegeFlatRow[];
  ownerNameMap: Record<string, string>;
  loading?: boolean;
}) {
  const th =
    "min-w-[10.5rem] whitespace-nowrap px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-[#64748b]";
  const td = "whitespace-nowrap px-4 py-3 text-center text-xs text-[#334155]";

  return (
    <div className="overflow-hidden rounded-[20px] border border-[#dbe6f3] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="table-freeze-cols w-full min-w-[3800px] text-sm" style={{ ["--sticky-col-2" as string]: "14rem" }}>
          <thead className="cv-head bg-[#f8fbff]">
            <tr>
              <TableHeaderCell label="Task" className={`${th} sticky-col sticky-col-1 min-w-[12rem]`} />
              <TableHeaderCell label="Task Status" className={`${th} sticky-col sticky-col-2 min-w-[9rem]`} />
              {COLLEGE_VISIT_CSV_HEADERS.map((h) => (
                <TableHeaderCell key={h} label={h} className={th} />
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={COLLEGE_VISIT_CSV_HEADERS.length + 2} className="px-4 py-8 text-center text-sm text-[#64748b]">
                  Loading linked colleges…
                </td>
              </tr>
            ) : !rows.length ? (
              <tr>
                <td colSpan={COLLEGE_VISIT_CSV_HEADERS.length + 2} className="px-4 py-8 text-center text-sm text-[#64748b]">
                  No colleges linked on these tasks yet.
                </td>
              </tr>
            ) : (
              rows.map(({ key, task, college }, idx) => {
                const days = daysSince(college.last_follow_up_date);
                const due = isFollowUpDue(college);
                return (
                  <tr key={key} className="border-t border-[#eef2f7] hover:bg-[#fafcff]">
                    <td className={`${td} sticky-col sticky-col-1 max-w-[12rem] truncate font-medium`} title={task.title}>
                      {task.title}
                    </td>
                    <td className={`${td} sticky-col sticky-col-2`}>{task.status}</td>
                    <td className={td}>{idx + 1}</td>
                    <td className={`${td} max-w-[14rem] truncate font-medium`} title={college.college_name}>
                      {college.college_name}
                    </td>
                    <td className={td}>{college.location || "—"}</td>
                    <td className={td}>{college.contact_number || "—"}</td>
                    <td className={td}>{college.email || "—"}</td>
                    <td className={td}>{college.connected_person_name || "—"}</td>
                    <td className={td}>{college.connected_person_role || "—"}</td>
                    <td className={td}>{college.visit_status}</td>
                    <td className={td}>{formatDisplayDate(college.visit_date)}</td>
                    <td className={td}>{college.mou_signed_status}</td>
                    <td className={td}>{college.follow_up_stage || "—"}</td>
                    <td className={td}>{formatDisplayDate(college.last_follow_up_date)}</td>
                    <td className={td}>{formatDisplayDate(college.next_follow_up_date)}</td>
                    <td className={td}>{college.priority}</td>
                    <td className={td}>{college.assigned_to ? ownerNameMap[college.assigned_to] || "—" : "—"}</td>
                    <td className={`${td} max-w-[14rem] truncate`}>{college.description || "—"}</td>
                    <td className={`${td} max-w-[14rem] truncate`}>{college.last_outcome_remarks || "—"}</td>
                    <td className={td}>{days != null ? days : "—"}</td>
                    <td className={td}>{due ? "Yes" : "No"}</td>
                    <td className={td}>{college.lead_score}</td>
                    <td className={td}>{college.final_status}</td>
                    <td className={td}>{college.source_reference || "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
