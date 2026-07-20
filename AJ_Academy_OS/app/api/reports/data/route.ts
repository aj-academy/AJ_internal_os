import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/security";
import { resolveReportDateRange, startOfDayIso, endOfDayIso, type ReportDatePreset } from "@/lib/reports/dateRange";
import type {
  ReportActivity,
  ReportCallSession,
  ReportClientLite,
  ReportFollowup,
  ReportsDataPayload,
  SchemaGap,
} from "@/lib/reports/types";
import { PROJECT_SELECT } from "@/components/project-master/projectHelpers";
import { TX_SELECT } from "@/components/finance/financeHelpers";

const CLIENT_SELECT_FULL =
  "id,name,company_name,status,source,service_interest,interested_program,proposal_status,budget,fee_quoted,final_fee,payment_status,admission_status,lead_stage,assigned_to,converted_at,lost_reason,created_at";
const CLIENT_SELECT_BASE =
  "id,name,company_name,status,source,service_interest,proposal_status,budget,converted_at,lost_reason,created_at";

function isMissingRelation(msg: string, hint: string) {
  const m = msg.toLowerCase();
  const h = hint.toLowerCase();
  return (
    (m.includes("could not find the table") && m.includes(h)) ||
    (m.includes("relation") && m.includes(h) && m.includes("does not exist")) ||
    (m.includes("pgrst205") && m.includes(h)) ||
    (m.includes("schema cache") && m.includes(h))
  );
}

function isMissingColumn(msg: string) {
  const m = msg.toLowerCase();
  return m.includes("column") && (m.includes("does not exist") || m.includes("could not find"));
}

async function safeSelect<T>(
  label: string,
  fn: () => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  gaps: SchemaGap[],
  migration?: string,
): Promise<T[]> {
  try {
    const { data, error } = await fn();
    if (error) {
      if (isMissingRelation(error.message, label)) {
        gaps.push({
          kind: "missing_table",
          object: label,
          reason: error.message,
          migration,
        });
        return [];
      }
      if (isMissingColumn(error.message)) {
        gaps.push({
          kind: "missing_column",
          object: label,
          reason: error.message,
          migration,
        });
        return [];
      }
      throw new Error(`${label}: ${error.message}`);
    }
    return data ?? [];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isMissingRelation(msg, label) || isMissingColumn(msg)) {
      gaps.push({
        kind: isMissingColumn(msg) ? "missing_column" : "missing_table",
        object: label,
        reason: msg,
        migration,
      });
      return [];
    }
    throw e;
  }
}

export async function GET(request: Request) {
  const { response, user, profile } = await requireAdminApiSession();
  if (response || !user) return response!;

  const url = new URL(request.url);
  const preset = (url.searchParams.get("preset") || "this_month") as ReportDatePreset;
  const customFrom = url.searchParams.get("from") || undefined;
  const customTo = url.searchParams.get("to") || undefined;
  const employeeId = url.searchParams.get("employeeId") || "";
  const department = url.searchParams.get("department") || "";
  const leadSource = url.searchParams.get("leadSource") || "";
  const course = url.searchParams.get("course") || "";
  const status = url.searchParams.get("status") || "";

  const range = resolveReportDateRange(preset, customFrom, customTo);
  const fromTs = startOfDayIso(range.from);
  const toTs = endOfDayIso(range.to);
  const gaps: SchemaGap[] = [];

  gaps.push({
    kind: "missing_column",
    object: "profiles.branch / clients.branch",
    reason: "No organizational branch column exists on profiles or clients. Branch filter cannot be applied in SQL.",
    migration: "Add org branch dimension if needed (not present in current AJ OS schema).",
  });

  try {
    const admin = createAdminClient();

    // Probe schema RPC if available
    try {
      const { data: statusJson, error: statusErr } = await admin.rpc("reports_schema_status");
      if (!statusErr && statusJson && typeof statusJson === "object") {
        const tables = (statusJson as { tables?: Record<string, boolean> }).tables || {};
        const cols = (statusJson as { columns?: Record<string, boolean> }).columns || {};
        for (const [k, ok] of Object.entries(tables)) {
          if (!ok) {
            gaps.push({
              kind: "missing_table",
              object: k,
              reason: `Table ${k} is not installed.`,
              migration:
                k.startsWith("lead_")
                  ? "lead_call_workflow_schema.sql / student_lead_master_aux_schema.sql"
                  : k.startsWith("finance")
                    ? "finance_schema.sql"
                    : undefined,
            });
          }
        }
        if (cols["org_branch"] === false) {
          // already noted
        }
        if (cols["clients.admission_status"] === false) {
          gaps.push({
            kind: "required_migration",
            object: "clients.admission_status",
            reason: "Admission KPIs require Student Master counselling columns.",
            migration: "student_master_columns_patch.sql",
          });
        }
      }
    } catch {
      gaps.push({
        kind: "required_migration",
        object: "reports_schema_status",
        reason: "RPC reports_schema_status not found — report views/indexes may be missing.",
        migration: "reports_analytics_schema.sql",
      });
    }

    let profileQuery = admin
      .from("profiles")
      .select("id,full_name,email,role,department,status")
      .order("full_name")
      .limit(800);
    if (department) profileQuery = profileQuery.eq("department", department);
    if (employeeId) profileQuery = profileQuery.eq("id", employeeId);

    const profiles = await safeSelect<{
      id: string;
      full_name: string | null;
      email: string | null;
      role: string | null;
      department: string | null;
      status: string | null;
    }>("profiles", async () => await profileQuery, gaps);

    const deptEmployeeIds =
      department && !employeeId
        ? new Set(profiles.map((p) => p.id))
        : null;

    // Clients — try full select, fallback to base if columns missing
    let clients = await safeSelect<ReportClientLite>(
      "clients",
      async () => {
        let q = admin.from("clients").select(CLIENT_SELECT_FULL).order("updated_at", { ascending: false }).limit(5000);
        if (leadSource) q = q.eq("source", leadSource);
        if (status) q = q.eq("status", status);
        if (course) q = q.or(`interested_program.eq.${course},service_interest.eq.${course}`);
        if (employeeId) q = q.eq("assigned_to", employeeId);
        return await q;
      },
      gaps,
      "student_lead_master_schema.sql + student_master_columns_patch.sql",
    );

    if (!clients.length && gaps.some((g) => g.object === "clients" && g.kind === "missing_column")) {
      // remove column gap and retry base
      const idx = gaps.findIndex((g) => g.object === "clients" && g.kind === "missing_column");
      if (idx >= 0) gaps.splice(idx, 1);
      gaps.push({
        kind: "missing_column",
        object: "clients.admission_status / final_fee / interested_program",
        reason: "Extended Student Master columns missing; loading base client fields only.",
        migration: "student_master_columns_patch.sql",
      });
      const baseClients = await safeSelect<{
        id: string;
        name: string;
        company_name: string | null;
        status: string | null;
        source: string | null;
        service_interest: string | null;
        proposal_status: string | null;
        budget: number | null;
        converted_at: string | null;
        lost_reason: string | null;
        created_at: string;
        assigned_to?: string | null;
      }>(
        "clients",
        async () => {
          let q = admin.from("clients").select(CLIENT_SELECT_BASE).order("updated_at", { ascending: false }).limit(5000);
          if (leadSource) q = q.eq("source", leadSource);
          if (status) q = q.eq("status", status);
          if (employeeId) q = q.eq("assigned_to", employeeId);
          return await q;
        },
        gaps,
        "student_lead_master_schema.sql",
      );
      clients = baseClients.map((c) => ({
        id: c.id,
        name: c.name,
        company_name: c.company_name,
        status: c.status,
        source: c.source,
        service_interest: c.service_interest,
        interested_program: null,
        proposal_status: c.proposal_status,
        budget: c.budget,
        fee_quoted: null,
        final_fee: null,
        payment_status: null,
        admission_status: null,
        lead_stage: null,
        assigned_to: c.assigned_to ?? null,
        converted_at: c.converted_at,
        lost_reason: c.lost_reason,
        created_at: c.created_at,
      }));
    }

    if (deptEmployeeIds) {
      clients = clients.filter((c) => !c.assigned_to || deptEmployeeIds.has(c.assigned_to));
    }

    const projects = await safeSelect(
      "projects",
      async () => await admin.from("projects").select(PROJECT_SELECT).order("updated_at", { ascending: false }).limit(600),
      gaps,
      "project_master_schema.sql",
    );

    let taskQuery = admin
      .from("tasks")
      .select("id,assigned_to,status,priority,due_date,project_id,updated_at")
      .gte("updated_at", fromTs)
      .lte("updated_at", toTs)
      .limit(8000);
    if (employeeId) taskQuery = taskQuery.eq("assigned_to", employeeId);
    if (status) {
      // status filter is shared; only apply when it looks like a task status
      const taskStatuses = new Set(["Pending", "In Progress", "Completed", "Cancelled"]);
      if (taskStatuses.has(status)) taskQuery = taskQuery.eq("status", status);
    }
    let tasks = await safeSelect("tasks", async () => await taskQuery, gaps, "task_schema.sql");
    if (deptEmployeeIds) tasks = tasks.filter((t) => deptEmployeeIds.has(t.assigned_to));

    let attQuery = admin
      .from("attendance_records")
      .select("id,employee_id,attendance_date,check_in_time,check_out_time,status,total_working_minutes,check_in_address")
      .gte("attendance_date", range.from)
      .lte("attendance_date", range.to)
      .order("attendance_date", { ascending: false })
      .limit(8000);
    if (employeeId) attQuery = attQuery.eq("employee_id", employeeId);
    let attendance = await safeSelect("attendance_records", async () => await attQuery, gaps, "attendance_module.sql");
    if (deptEmployeeIds) {
      attendance = attendance.filter((a) => a.employee_id && deptEmployeeIds.has(a.employee_id));
    }

    let financeTx = await safeSelect(
      "finance_transactions",
      async () => {
        // Extend lookback for MoM / trend charts while still returning rows in a usable window
        const lookback = new Date(range.from);
        lookback.setDate(lookback.getDate() - 90);
        const lookbackFrom = lookback.toISOString().slice(0, 10);
        let q = admin
          .from("finance_transactions")
          .select(TX_SELECT)
          .gte("transaction_date", lookbackFrom)
          .lte("transaction_date", range.to)
          .order("transaction_date", { ascending: false })
          .limit(5000);
        return await q;
      },
      gaps,
      "finance_schema.sql",
    );

    const projectPayments = await safeSelect(
      "project_payments",
      async () => await admin.from("project_payments").select("amount,payment_status,project_id").limit(5000),
      gaps,
      "finance_schema.sql",
    );

    const teamMembers = await safeSelect(
      "project_team_members",
      async () => await admin.from("project_team_members").select("project_id,profile_id").limit(8000),
      gaps,
      "project_master_schema.sql",
    );

    // Prefer report views; fall back to base tables
    let callSessions: ReportCallSession[] = await safeSelect(
      "v_report_call_sessions",
      async () => {
        let q = admin
          .from("v_report_call_sessions")
          .select(
            "id,lead_id,employee_id,employee_name,phone_number,started_at,ended_at,approximate_duration_seconds,session_status,call_outcome,notes,next_action,lead_name,lead_source",
          )
          .gte("started_at", fromTs)
          .lte("started_at", toTs)
          .order("started_at", { ascending: false })
          .limit(5000);
        if (employeeId) q = q.eq("employee_id", employeeId);
        if (leadSource) q = q.eq("lead_source", leadSource);
        return await q;
      },
      gaps,
      "reports_analytics_schema.sql",
    );

    if (!callSessions.length && gaps.some((g) => g.object === "v_report_call_sessions")) {
      // try base table
      const viewGapIdx = gaps.findIndex((g) => g.object === "v_report_call_sessions");
      // keep the view gap as informational
      callSessions = await safeSelect(
        "lead_call_sessions",
        async () => {
          let q = admin
            .from("lead_call_sessions")
            .select(
              "id,lead_id,employee_id,employee_name,phone_number,started_at,ended_at,approximate_duration_seconds,session_status,call_outcome,notes,next_action",
            )
            .gte("started_at", fromTs)
            .lte("started_at", toTs)
            .order("started_at", { ascending: false })
            .limit(5000);
          if (employeeId) q = q.eq("employee_id", employeeId);
          return await q;
        },
        gaps,
        "lead_call_workflow_schema.sql",
      );
      if (viewGapIdx >= 0 && callSessions.length) {
        // view missing but table works — soft note only
      }
    }
    if (deptEmployeeIds) {
      callSessions = callSessions.filter((c) => deptEmployeeIds.has(c.employee_id));
    }

    let followups: ReportFollowup[] = await safeSelect(
      "v_report_followups",
      async () => {
        let q = admin
          .from("v_report_followups")
          .select(
            "id,client_id,follow_up_date,follow_up_time,follow_up_type,status,notes,reason,outcome,completed_at,assigned_employee_id,call_session_id,lead_name,assigned_employee_name,followup_bucket",
          )
          .gte("follow_up_date", range.from)
          .lte("follow_up_date", range.to)
          .order("follow_up_date", { ascending: false })
          .limit(5000);
        if (employeeId) q = q.eq("assigned_employee_id", employeeId);
        return await q;
      },
      gaps,
      "reports_analytics_schema.sql + student_lead_master_aux_schema.sql",
    );

    if (!followups.length && gaps.some((g) => g.object === "v_report_followups")) {
      followups = await safeSelect(
        "lead_followups",
        async () => {
          let q = admin
            .from("lead_followups")
            .select(
              "id,client_id,follow_up_date,follow_up_time,follow_up_type,status,notes,reason,outcome,completed_at,assigned_employee_id,call_session_id",
            )
            .gte("follow_up_date", range.from)
            .lte("follow_up_date", range.to)
            .order("follow_up_date", { ascending: false })
            .limit(5000);
          if (employeeId) q = q.eq("assigned_employee_id", employeeId);
          return await q;
        },
        gaps,
        "student_lead_master_aux_schema.sql",
      );
    }
    if (deptEmployeeIds) {
      followups = followups.filter((f) => !f.assigned_employee_id || deptEmployeeIds.has(f.assigned_employee_id));
    }

    // Timeline from multiple activity sources (SQL filtered)
    const timeline: ReportActivity[] = [];
    const nameById: Record<string, string> = {};
    profiles.forEach((p) => {
      nameById[p.id] = p.full_name || p.email || p.id.slice(0, 8);
    });

    let leadActs = await safeSelect<{
      id: string;
      client_id: string;
      activity_type: string;
      notes: string | null;
      created_by: string | null;
      created_at: string;
      title?: string | null;
      lead_name?: string | null;
      actor_name?: string | null;
    }>(
      "v_report_lead_activities",
      async () => {
        let q = admin
          .from("v_report_lead_activities")
          .select("id,client_id,activity_type,notes,created_by,created_at,title,lead_name,actor_name")
          .gte("created_at", fromTs)
          .lte("created_at", toTs)
          .order("created_at", { ascending: false })
          .limit(2000);
        if (employeeId) q = q.eq("created_by", employeeId);
        return await q;
      },
      gaps,
      "reports_analytics_schema.sql",
    );
    if (!leadActs.length) {
      leadActs = await safeSelect(
        "lead_activities",
        async () => {
          let q = admin
            .from("lead_activities")
            .select("id,client_id,activity_type,notes,created_by,created_at")
            .gte("created_at", fromTs)
            .lte("created_at", toTs)
            .order("created_at", { ascending: false })
            .limit(2000);
          if (employeeId) q = q.eq("created_by", employeeId);
          return await q;
        },
        gaps,
        "student_lead_master_aux_schema.sql",
      );
    }

    leadActs.forEach((a) => {
      if (employeeId && a.created_by && a.created_by !== employeeId) return;
      if (deptEmployeeIds && a.created_by && !deptEmployeeIds.has(a.created_by)) return;
      timeline.push({
        id: `lead:${a.id}`,
        source: "lead",
        occurred_at: a.created_at,
        actor_id: a.created_by,
        actor_name: a.actor_name || (a.created_by ? nameById[a.created_by] : null) || null,
        title: a.title || a.activity_type || "Lead update",
        detail: a.notes,
        entity_label: a.lead_name || a.client_id,
        entity_id: a.client_id,
      });
    });

    const taskActs = await safeSelect<{
      id: string;
      task_id: string;
      activity_type: string;
      created_by: string | null;
      created_at: string;
      metadata: unknown;
    }>(
      "task_activities",
      async () => {
        let q = admin
          .from("task_activities")
          .select("id,task_id,activity_type,created_by,created_at,metadata")
          .gte("created_at", fromTs)
          .lte("created_at", toTs)
          .order("created_at", { ascending: false })
          .limit(1500);
        if (employeeId) q = q.eq("created_by", employeeId);
        return await q;
      },
      gaps,
      "tasks_assignment_link_patch.sql",
    );
    taskActs.forEach((a) => {
      if (deptEmployeeIds && a.created_by && !deptEmployeeIds.has(a.created_by)) return;
      timeline.push({
        id: `task:${a.id}`,
        source: "task",
        occurred_at: a.created_at,
        actor_id: a.created_by,
        actor_name: a.created_by ? nameById[a.created_by] || null : null,
        title: a.activity_type || "Task update",
        detail: a.metadata ? JSON.stringify(a.metadata).slice(0, 200) : null,
        entity_label: a.task_id,
        entity_id: a.task_id,
      });
    });

    // Attendance as timeline events
    attendance.forEach((a) => {
      if (!a.check_in_time && !a.check_out_time) return;
      timeline.push({
        id: `att:${a.id}`,
        source: "attendance",
        occurred_at: a.check_in_time || `${a.attendance_date}T00:00:00.000Z`,
        actor_id: a.employee_id,
        actor_name: a.employee_id ? nameById[a.employee_id] || null : null,
        title: a.check_out_time ? "Checked out" : "Checked in",
        detail: a.status || null,
        entity_label: a.attendance_date,
        entity_id: a.id,
      });
    });

    // Call sessions as timeline
    callSessions.forEach((c) => {
      timeline.push({
        id: `call:${c.id}`,
        source: "lead",
        occurred_at: c.started_at,
        actor_id: c.employee_id,
        actor_name: c.employee_name || nameById[c.employee_id] || null,
        title: `Call — ${c.call_outcome || c.session_status || "session"}`,
        detail: c.notes,
        entity_label: c.lead_name || c.lead_id,
        entity_id: c.lead_id,
      });
    });

    timeline.sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));

    if (!timeline.length) {
      gaps.push({
        kind: "missing_activity",
        object: "employee_timeline",
        reason:
          "No activity rows in the selected date range from lead_activities, task_activities, attendance, or call sessions.",
      });
    }

    // Deduplicate branch gap if already added multiple times
    const seen = new Set<string>();
    const uniqueGaps = gaps.filter((g) => {
      const k = `${g.kind}:${g.object}:${g.reason}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const payload: ReportsDataPayload = {
      profiles,
      clients,
      projects,
      tasks,
      attendance,
      financeTx,
      projectPayments,
      teamMembers,
      callSessions,
      followups,
      timeline: timeline.slice(0, 2000),
      gaps: uniqueGaps,
      meta: {
        from: range.from,
        to: range.to,
        generatedAt: new Date().toISOString(),
        generatedBy: profile?.full_name || profile?.email || user.email || user.id,
        companyName: "AJ Academy",
        durationNote:
          "Call duration uses approximate_duration_seconds from lead_call_sessions (estimate). Exact telephony duration is not stored.",
        branchFilterAvailable: false,
      },
    };

    return NextResponse.json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load reports data.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
