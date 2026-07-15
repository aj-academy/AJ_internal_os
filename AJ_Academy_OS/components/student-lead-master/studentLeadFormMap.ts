import { displayLeadName, normalizeStatus, type CrmClientRow } from "@/components/student-lead-master/studentMasterHelpers";
import {
  CRM_SOURCES,
  type CrmProposalStatus,
} from "@/components/student-lead-master/studentMasterConfig";
import type { StudentLeadFormValue } from "@/components/student-lead-master/StudentLeadFormPanel";

function servicesFromCsv(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function numOrNull(raw: string) {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(String(t).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function emptyStudentLeadForm(assignedFallback = ""): StudentLeadFormValue {
  return {
    lead_name: "",
    phone: "",
    whatsapp: "",
    email: "",
    city: "",
    current_profile: "",
    degree: "",
    college_company: "",
    year_of_passing: "",
    employment_status: "",
    current_salary: "",
    interested_program: "",
    new_program_name: "",
    career_goal: "",
    preferred_job_role: "",
    target_salary: "",
    current_skill_level: "",
    main_career_problem: "",
    joining_timeline: "",
    budget: "",
    payment_plan: "",
    parent_approval_required: "",
    decision_maker: "",
    preferred_batch: "",
    laptop_availability: "",
    source: CRM_SOURCES[0],
    assigned_to: assignedFallback,
    lead_stage: "",
    status: "New",
    priority: "Warm",
    follow_up_date: "",
    follow_up_time: "",
    follow_up_type: "",
    fee_quoted: "",
    final_fee: "",
    payment_status: "",
    admission_status: "",
    notes: "",
    company_name: "",
    industry: "",
    requirement: "",
    expected_start_date: "",
    lead_score: "0",
    service_interests: new Set(),
    proposal_status: "Not Sent",
    proposal_amount: "",
    proposal_sent_date: "",
    proposal_link: "",
    quotation_link: "",
    agreement_link: "",
  };
}

export function crmClientRowToStudentForm(lead: CrmClientRow): StudentLeadFormValue {
  const interests = servicesFromCsv(String(lead.service_interest ?? ""));
  return {
    ...emptyStudentLeadForm(),
    lead_name: displayLeadName(lead) || String(lead.name ?? ""),
    phone: lead.phone ?? "",
    whatsapp: lead.whatsapp ?? "",
    email: lead.email ?? "",
    city: lead.city ?? "",
    current_profile: lead.current_profile ?? "",
    degree: lead.degree ?? "",
    college_company: lead.college_company ?? lead.company_name ?? "",
    year_of_passing: lead.year_of_passing ?? "",
    employment_status: lead.employment_status ?? "",
    current_salary: lead.current_salary != null ? String(lead.current_salary) : "",
    interested_program: lead.interested_program ?? interests[0] ?? "",
    career_goal: lead.career_goal ?? "",
    preferred_job_role: lead.preferred_job_role ?? "",
    target_salary: lead.target_salary != null ? String(lead.target_salary) : "",
    current_skill_level: lead.current_skill_level ?? "",
    main_career_problem: lead.main_career_problem ?? lead.requirement ?? "",
    joining_timeline: lead.joining_timeline ?? "",
    budget: lead.budget != null ? String(lead.budget) : "",
    payment_plan: lead.payment_plan ?? "",
    parent_approval_required: lead.parent_approval_required ?? "",
    decision_maker: lead.decision_maker ?? "",
    preferred_batch: lead.preferred_batch ?? "",
    laptop_availability: lead.laptop_availability ?? "",
    source: (lead.source as string) || CRM_SOURCES[0],
    assigned_to: lead.assigned_to ?? "",
    lead_stage: lead.lead_stage ?? "",
    status: normalizeStatus(String(lead.status)),
    priority: lead.priority ?? "Warm",
    follow_up_date: lead.follow_up_date ? String(lead.follow_up_date).slice(0, 10) : "",
    follow_up_time: lead.follow_up_time ? String(lead.follow_up_time).slice(0, 5) : "",
    follow_up_type: lead.follow_up_type ?? "",
    fee_quoted:
      lead.fee_quoted != null
        ? String(lead.fee_quoted)
        : lead.proposal_amount != null
          ? String(lead.proposal_amount)
          : "",
    final_fee: lead.final_fee != null ? String(lead.final_fee) : "",
    payment_status: lead.payment_status ?? "",
    admission_status: lead.admission_status ?? "",
    notes: lead.notes ?? "",
    company_name: lead.company_name ?? "",
    industry: lead.industry ?? "",
    requirement: lead.requirement ?? "",
    expected_start_date: lead.expected_start_date ?? "",
    lead_score: lead.lead_score != null ? String(lead.lead_score) : "0",
    service_interests: new Set(interests),
    proposal_status: (lead.proposal_status as CrmProposalStatus) ?? "Not Sent",
    proposal_amount: lead.proposal_amount != null ? String(lead.proposal_amount) : "",
    proposal_sent_date: lead.proposal_sent_date ?? "",
    proposal_link: lead.proposal_link ?? "",
    quotation_link: lead.quotation_link ?? "",
    agreement_link: lead.agreement_link ?? "",
  };
}

/** Employee-editable columns (ownership stays with admin / original assignee). */
export function buildEmployeeLeadUpdatePayload(v: StudentLeadFormValue): Record<string, unknown> {
  const program = v.interested_program.trim() || null;
  const base: Record<string, unknown> = {
    requirement: v.main_career_problem.trim() || v.requirement.trim() || null,
    budget: numOrNull(v.budget),
    expected_start_date: v.expected_start_date || null,
    notes: v.notes.trim() || null,
    follow_up_date: v.follow_up_date || null,
    follow_up_time: v.follow_up_time || null,
    follow_up_type: v.follow_up_type || null,
    status: v.status.trim() || null,
    priority: v.priority.trim() || null,
    proposal_status: v.proposal_status || "Not Sent",
    proposal_amount: numOrNull(v.proposal_amount) ?? numOrNull(v.fee_quoted),
    proposal_sent_date: v.proposal_sent_date || null,
    proposal_link: v.proposal_link.trim() || null,
    quotation_link: v.quotation_link.trim() || null,
    agreement_link: v.agreement_link.trim() || null,
    service_interest: program,
    interested_program: program,
    current_profile: v.current_profile.trim() || null,
    degree: v.degree.trim() || null,
    college_company: v.college_company.trim() || null,
    year_of_passing: v.year_of_passing.trim() || null,
    employment_status: v.employment_status.trim() || null,
    current_salary: numOrNull(v.current_salary),
    career_goal: v.career_goal.trim() || null,
    preferred_job_role: v.preferred_job_role.trim() || null,
    target_salary: numOrNull(v.target_salary),
    current_skill_level: v.current_skill_level.trim() || null,
    main_career_problem: v.main_career_problem.trim() || null,
    joining_timeline: v.joining_timeline.trim() || null,
    payment_plan: v.payment_plan.trim() || null,
    parent_approval_required: v.parent_approval_required.trim() || null,
    decision_maker: v.decision_maker.trim() || null,
    preferred_batch: v.preferred_batch.trim() || null,
    laptop_availability: v.laptop_availability.trim() || null,
    lead_stage: v.lead_stage.trim() || null,
    fee_quoted: numOrNull(v.fee_quoted),
    final_fee: numOrNull(v.final_fee),
    payment_status: v.payment_status.trim() || null,
    admission_status: v.admission_status.trim() || null,
    phone: v.phone.trim() || null,
    whatsapp: v.whatsapp.trim() || null,
    email: v.email.trim() || null,
    city: v.city.trim() || null,
  };
  return base;
}
