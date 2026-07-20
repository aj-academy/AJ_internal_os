export type SchemaGapKind = "missing_table" | "missing_column" | "missing_relation" | "missing_activity" | "required_migration";

export type SchemaGap = {
  kind: SchemaGapKind;
  object: string;
  reason: string;
  migration?: string;
};

export type ReportCallSession = {
  id: string;
  lead_id: string;
  employee_id: string;
  employee_name: string | null;
  phone_number: string | null;
  started_at: string;
  ended_at: string | null;
  approximate_duration_seconds: number | null;
  session_status: string | null;
  call_outcome: string | null;
  notes: string | null;
  next_action: string | null;
  lead_name?: string | null;
  lead_source?: string | null;
};

export type ReportFollowup = {
  id: string;
  client_id: string;
  follow_up_date: string | null;
  follow_up_time: string | null;
  follow_up_type: string | null;
  status: string | null;
  notes: string | null;
  reason: string | null;
  outcome: string | null;
  completed_at: string | null;
  assigned_employee_id: string | null;
  call_session_id: string | null;
  lead_name?: string | null;
  assigned_employee_name?: string | null;
  followup_bucket?: string | null;
};

export type ReportActivity = {
  id: string;
  source: "lead" | "task" | "attendance" | "finance" | "audit";
  occurred_at: string;
  actor_id: string | null;
  actor_name: string | null;
  title: string;
  detail: string | null;
  entity_label: string | null;
  entity_id: string | null;
};

export type ReportClientLite = {
  id: string;
  name: string;
  company_name: string | null;
  status: string | null;
  source: string | null;
  service_interest: string | null;
  interested_program: string | null;
  proposal_status: string | null;
  budget: number | null;
  fee_quoted: number | null;
  final_fee: number | null;
  payment_status: string | null;
  admission_status: string | null;
  lead_stage: string | null;
  assigned_to: string | null;
  converted_at: string | null;
  lost_reason: string | null;
  created_at: string;
};

export type ReportsDataPayload = {
  profiles: {
    id: string;
    full_name: string | null;
    email: string | null;
    role: string | null;
    department: string | null;
    status: string | null;
  }[];
  clients: ReportClientLite[];
  projects: unknown[];
  tasks: {
    id: string;
    assigned_to: string;
    status: string;
    priority: string;
    due_date: string | null;
    project_id: string | null;
    updated_at?: string | null;
  }[];
  attendance: {
    id: string;
    employee_id: string | null;
    attendance_date: string;
    check_in_time: string | null;
    check_out_time: string | null;
    status: string | null;
    total_working_minutes: number | null;
    check_in_address: string | null;
  }[];
  financeTx: unknown[];
  projectPayments: { amount: number; payment_status: string; project_id: string }[];
  teamMembers: { project_id: string; profile_id: string }[];
  callSessions: ReportCallSession[];
  followups: ReportFollowup[];
  timeline: ReportActivity[];
  gaps: SchemaGap[];
  meta: {
    from: string;
    to: string;
    generatedAt: string;
    generatedBy: string | null;
    companyName: string;
    durationNote: string;
    branchFilterAvailable: false;
  };
};
