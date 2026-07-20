import { eachDateKey, isoEndOfDay, isoStartOfDay, resolveDateRange } from "@/lib/analytics/dateRanges";
import {
  computeProductivityScore,
  isAdmissionLead,
  isConnectedOutcome,
} from "@/lib/analytics/productivity";
import type { AnalyticsFilters, AnalyticsSectionId, DatePreset } from "@/lib/analytics/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  department: string | null;
  status: string | null;
};

function nameOf(p: ProfileRow | undefined): string {
  return p?.full_name?.trim() || p?.email?.trim() || "Unknown";
}

function inRange(iso: string | null | undefined, from: string, to: string): boolean {
  if (!iso) return false;
  const key = iso.slice(0, 10);
  return key >= from && key <= to;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type AnalyticsQueryBody = {
  section: AnalyticsSectionId;
  preset?: DatePreset;
  from?: string;
  to?: string;
  employeeId?: string;
  department?: string;
  role?: string;
  course?: string;
  leadSource?: string;
  leadStatus?: string;
  taskStatus?: string;
  admissionStatus?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  /** When set, force scope to this employee (employee self-view). */
  forceEmployeeId?: string | null;
};

export async function runAnalyticsQuery(
  supabase: SupabaseClient,
  body: AnalyticsQueryBody,
): Promise<Record<string, unknown>> {
  const { from, to } = resolveDateRange(
    body.preset || "today",
    body.from,
    body.to,
  );

  const filters: AnalyticsFilters = {
    preset: body.preset || "today",
    from,
    to,
    employeeId: body.forceEmployeeId || body.employeeId || "",
    department: body.department || "",
    role: body.role || "",
    course: body.course || "",
    leadSource: body.leadSource || "",
    leadStatus: body.leadStatus || "",
    taskStatus: body.taskStatus || "",
    admissionStatus: body.admissionStatus || "",
    search: (body.search || "").trim().toLowerCase(),
    page: Math.max(1, body.page || 1),
    pageSize: Math.min(200, Math.max(10, body.pageSize || 50)),
  };

  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id,full_name,email,role,department,status")
    .in("role", ["employee", "admin", "super_admin", "mentor", "freelancer"])
    .or("status.is.null,status.eq.active")
    .order("full_name", { ascending: true })
    .limit(800);

  let profiles = (profileRows ?? []) as ProfileRow[];
  if (filters.department) {
    profiles = profiles.filter((p) => (p.department || "") === filters.department);
  }
  if (filters.role) {
    profiles = profiles.filter((p) => (p.role || "") === filters.role);
  }
  if (filters.employeeId) {
    profiles = profiles.filter((p) => p.id === filters.employeeId);
  }

  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]));
  const employeeIds = profiles.filter((p) => p.role === "employee" || filters.employeeId).map((p) => p.id);
  const scopeIds = filters.employeeId ? [filters.employeeId] : employeeIds.length ? employeeIds : profiles.map((p) => p.id);

  const meta = {
    from,
    to,
    preset: filters.preset,
    generatedAt: new Date().toISOString(),
    employeeCount: scopeIds.length,
  };

  const section = body.section;

  if (section === "overview" || section === "team" || section === "productivity" || section === "daily") {
    return buildAggregates(supabase, filters, profiles, profileMap, scopeIds, meta, section);
  }
  if (section === "calls") return buildCalls(supabase, filters, profileMap, scopeIds, meta);
  if (section === "followups") return buildFollowups(supabase, filters, profileMap, scopeIds, meta);
  if (section === "tasks") return buildTasks(supabase, filters, profileMap, scopeIds, meta);
  if (section === "conversion") return buildConversion(supabase, filters, scopeIds, meta);
  if (section === "admissions" || section === "revenue") {
    return buildAdmissionsRevenue(supabase, filters, profileMap, scopeIds, meta, section);
  }
  if (section === "timeline") return buildTimeline(supabase, filters, profileMap, meta);
  if (section === "eod") return buildEod(supabase, filters, profileMap, scopeIds, meta);
  if (section === "download") {
    const [daily, calls, tasks, eod] = await Promise.all([
      buildAggregates(supabase, filters, profiles, profileMap, scopeIds, meta, "daily"),
      buildCalls(supabase, filters, profileMap, scopeIds, meta),
      buildTasks(supabase, filters, profileMap, scopeIds, meta),
      buildEod(supabase, filters, profileMap, scopeIds, meta),
    ]);
    return { meta, daily, calls, tasks, eod };
  }

  return { meta, error: "Unknown section" };
}

async function buildAggregates(
  supabase: SupabaseClient,
  filters: AnalyticsFilters,
  profiles: ProfileRow[],
  profileMap: Record<string, ProfileRow>,
  scopeIds: string[],
  meta: Record<string, unknown>,
  section: AnalyticsSectionId,
) {
  const fromTs = isoStartOfDay(filters.from);
  const toTs = isoEndOfDay(filters.to);
  const days = eachDateKey(filters.from, filters.to);
  const expectedWorkDays = Math.max(
    1,
    days.filter((d) => {
      const dt = new Date(d);
      const day = dt.getDay();
      return day !== 0 && day !== 6;
    }).length || days.length,
  );

  const [
    attendanceRes,
    callsRes,
    tasksRes,
    activitiesRes,
    followupsRes,
    clientsRes,
  ] = await Promise.all([
    supabase
      .from("attendance_records")
      .select("id,employee_id,attendance_date,check_in_time,check_out_time,status,total_working_minutes")
      .gte("attendance_date", filters.from)
      .lte("attendance_date", filters.to)
      .in("employee_id", scopeIds.length ? scopeIds : ["00000000-0000-0000-0000-000000000000"])
      .limit(5000),
    supabase
      .from("lead_call_sessions")
      .select("id,employee_id,lead_id,phone_number,started_at,ended_at,approximate_duration_seconds,call_outcome,remarks,session_status")
      .gte("started_at", fromTs)
      .lte("started_at", toTs)
      .in("employee_id", scopeIds.length ? scopeIds : ["00000000-0000-0000-0000-000000000000"])
      .limit(8000),
    supabase
      .from("tasks")
      .select("id,title,assigned_to,assigned_by,status,priority,progress,due_date,created_at,updated_at")
      .in("assigned_to", scopeIds.length ? scopeIds : ["00000000-0000-0000-0000-000000000000"])
      .limit(5000),
    supabase
      .from("lead_activities")
      .select("id,client_id,activity_type,notes,created_at,created_by")
      .gte("created_at", fromTs)
      .lte("created_at", toTs)
      .in("created_by", scopeIds.length ? scopeIds : ["00000000-0000-0000-0000-000000000000"])
      .limit(8000),
    supabase
      .from("lead_followups")
      .select("id,client_id,follow_up_date,follow_up_time,status,outcome,assigned_employee_id,completed_at")
      .gte("follow_up_date", filters.from)
      .lte("follow_up_date", filters.to)
      .limit(5000),
    supabase
      .from("clients")
      .select(
        "id,lead_name,name,phone,assigned_to,status,source,interested_program,service_interest,admission_status,fee_quoted,final_fee,payment_status,follow_up_date,updated_at,created_at,last_call_outcome,total_call_attempts",
      )
      .in("assigned_to", scopeIds.length ? scopeIds : ["00000000-0000-0000-0000-000000000000"])
      .limit(8000),
  ]);

  const attendance = attendanceRes.data ?? [];
  const calls = callsRes.data ?? [];
  const allTasks = tasksRes.data ?? [];
  const activities = activitiesRes.data ?? [];
  const followups = (followupsRes.data ?? []).filter((f) => {
    const eid = f.assigned_employee_id;
    return !eid || scopeIds.includes(eid);
  });
  let clients = clientsRes.data ?? [];
  if (filters.leadSource) clients = clients.filter((c) => (c.source || "") === filters.leadSource);
  if (filters.leadStatus) clients = clients.filter((c) => (c.status || "") === filters.leadStatus);
  if (filters.admissionStatus) {
    clients = clients.filter((c) => (c.admission_status || "") === filters.admissionStatus);
  }
  if (filters.course) {
    clients = clients.filter(
      (c) =>
        (c.interested_program || "").toLowerCase().includes(filters.course.toLowerCase()) ||
        (c.service_interest || "").toLowerCase().includes(filters.course.toLowerCase()),
    );
  }

  const tasksInRange = allTasks.filter(
    (t) =>
      inRange(t.updated_at, filters.from, filters.to) ||
      inRange(t.created_at, filters.from, filters.to) ||
      inRange(t.due_date, filters.from, filters.to),
  );
  const tasks = filters.taskStatus
    ? tasksInRange.filter((t) => t.status === filters.taskStatus)
    : tasksInRange;

  const todayKey = filters.to;
  const presentEmployees = new Set(
    attendance
      .filter((a) => a.attendance_date === todayKey && ["present", "completed", "late"].includes((a.status || "").toLowerCase()))
      .map((a) => a.employee_id),
  );
  const workingEmployees = new Set(
    attendance
      .filter((a) => a.attendance_date === todayKey && a.check_in_time && !a.check_out_time)
      .map((a) => a.employee_id),
  );
  const checkedOut = new Set(
    attendance
      .filter((a) => a.attendance_date === todayKey && a.check_out_time)
      .map((a) => a.employee_id),
  );

  const connectedCalls = calls.filter((c) => isConnectedOutcome(c.call_outcome));
  const pendingFollowups = followups.filter((f) => {
    const st = (f.status || "Pending").toLowerCase();
    return st === "pending" || st === "missed" || (f.follow_up_date < todayKey && st === "pending");
  });
  const admissions = clients.filter((c) => isAdmissionLead(c));
  const revenue = admissions.reduce((s, c) => s + num(c.final_fee), 0);
  const pendingRevenue = clients
    .filter((c) => ["Partial", "Not Paid"].includes(c.payment_status || ""))
    .reduce((s, c) => s + Math.max(0, num(c.final_fee) || num(c.fee_quoted)), 0);
  const tasksCompleted = tasks.filter((t) => t.status === "Completed").length;
  const tasksPending = tasks.filter((t) => t.status !== "Completed").length;

  const perEmployee = scopeIds.map((id) => {
    const empCalls = calls.filter((c) => c.employee_id === id);
    const empTasks = allTasks.filter((t) => t.assigned_to === id);
    const empTasksRange = tasks.filter((t) => t.assigned_to === id);
    const empActs = activities.filter((a) => a.created_by === id);
    const empFu = followups.filter((f) => f.assigned_employee_id === id);
    const empClients = clients.filter((c) => c.assigned_to === id);
    const empAtt = attendance.filter((a) => a.employee_id === id);
    const empAdmissions = empClients.filter((c) => isAdmissionLead(c));
    const fuDone = empFu.filter((f) => (f.status || "").toLowerCase() === "completed").length;
    const fuDue = empFu.length;
    const presentDays = empAtt.filter((a) =>
      ["present", "completed", "late"].includes((a.status || "").toLowerCase()),
    ).length;
    const prod = computeProductivityScore({
      callsAttempted: empCalls.length,
      callsConnected: empCalls.filter((c) => isConnectedOutcome(c.call_outcome)).length,
      crmUpdates: empActs.length,
      tasksCompleted: empTasksRange.filter((t) => t.status === "Completed").length,
      tasksAssigned: empTasksRange.length || empTasks.length,
      followupsCompleted: fuDone,
      followupsDue: fuDue,
      admissions: empAdmissions.length,
      presentDays,
      expectedWorkDays,
    });

    const checkIn = empAtt.find((a) => a.attendance_date === todayKey)?.check_in_time ?? null;
    const checkOut = empAtt.find((a) => a.attendance_date === todayKey)?.check_out_time ?? null;
    const workingMinutes = empAtt.reduce((s, a) => s + num(a.total_working_minutes), 0);

    const outcomeCounts: Record<string, number> = {};
    for (const c of empCalls) {
      const key = c.call_outcome || "No Outcome";
      outcomeCounts[key] = (outcomeCounts[key] || 0) + 1;
    }

    return {
      employeeId: id,
      employeeName: nameOf(profileMap[id]),
      department: profileMap[id]?.department || "-",
      role: profileMap[id]?.role || "-",
      attendanceStatus: checkIn ? (checkOut ? "Checked Out" : "Working") : presentDays ? "Present (range)" : "Absent / No check-in",
      checkIn,
      checkOut,
      workingHours: Math.round((workingMinutes / 60) * 10) / 10,
      assignedLeads: empClients.length,
      callsAttempted: empCalls.length,
      callsConnected: empCalls.filter((c) => isConnectedOutcome(c.call_outcome)).length,
      outcomeCounts,
      admissions: empAdmissions.length,
      revenue: empAdmissions.reduce((s, c) => s + num(c.final_fee), 0),
      pendingRevenue: empClients
        .filter((c) => ["Partial", "Not Paid"].includes(c.payment_status || ""))
        .reduce((s, c) => s + Math.max(0, num(c.final_fee) || num(c.fee_quoted)), 0),
      tasksAssigned: empTasksRange.length,
      tasksCompleted: empTasksRange.filter((t) => t.status === "Completed").length,
      tasksPending: empTasksRange.filter((t) => t.status !== "Completed").length,
      overdueTasks: empTasks.filter(
        (t) => t.status !== "Completed" && t.due_date && t.due_date < todayKey,
      ).length,
      crmUpdates: empActs.length,
      followupsPending: empFu.filter((f) => (f.status || "Pending").toLowerCase() !== "completed").length,
      followupsCompleted: fuDone,
      productivityScore: prod.score,
      productivityBand: prod.band,
      productivityParts: prod.parts,
      flags: {
        noCalls: empCalls.length === 0 && empClients.length > 0,
        overdueFollowups: empFu.some(
          (f) => f.follow_up_date < todayKey && (f.status || "Pending").toLowerCase() === "pending",
        ),
        overdueTasks: empTasks.some(
          (t) => t.status !== "Completed" && t.due_date && t.due_date < todayKey,
        ),
        noAdmissions: empAdmissions.length === 0,
        noActivity: empCalls.length === 0 && empActs.length === 0 && empTasksRange.length === 0,
        lowProductivity: prod.score < 60,
      },
    };
  });

  perEmployee.sort((a, b) => b.productivityScore - a.productivityScore);

  const avgProductivity =
    perEmployee.length > 0
      ? Math.round(perEmployee.reduce((s, e) => s + e.productivityScore, 0) / perEmployee.length)
      : 0;

  const callsByDay = days.map((d) => ({
    date: d,
    calls: calls.filter((c) => (c.started_at || "").slice(0, 10) === d).length,
    connected: calls.filter(
      (c) => (c.started_at || "").slice(0, 10) === d && isConnectedOutcome(c.call_outcome),
    ).length,
  }));

  const admissionsByDay = days.map((d) => ({
    date: d,
    admissions: admissions.filter((c) => inRange(c.updated_at || c.created_at, d, d)).length,
    revenue: admissions
      .filter((c) => inRange(c.updated_at || c.created_at, d, d))
      .reduce((s, c) => s + num(c.final_fee), 0),
  }));

  const funnel = {
    generated: clients.length,
    contacted: clients.filter((c) => ["Contacted", "Interested", "Follow-up", "Counselling Scheduled", "Fee Discussed", "Admitted"].includes(c.status || "")).length,
    interested: clients.filter((c) => ["Interested", "Follow-up", "Counselling Scheduled", "Fee Discussed", "Admitted"].includes(c.status || "")).length,
    admission: admissions.length,
  };

  const kpis = {
    totalEmployees: scopeIds.length,
    employeesPresent: presentEmployees.size,
    employeesWorking: workingEmployees.size,
    employeesCheckedOut: checkedOut.size,
    totalLeadsAssigned: clients.length,
    totalCalls: calls.length,
    connectedCalls: connectedCalls.length,
    pendingFollowups: pendingFollowups.length,
    admissions: admissions.length,
    revenueGenerated: revenue,
    pendingRevenue,
    tasksCompleted,
    tasksPending,
    averageProductivity: avgProductivity,
  };

  const accountability = perEmployee
    .filter(
      (e) =>
        e.flags.noCalls ||
        e.flags.overdueFollowups ||
        e.flags.overdueTasks ||
        e.flags.lowProductivity ||
        e.flags.noActivity,
    )
    .map((e) => ({
      employeeId: e.employeeId,
      employeeName: e.employeeName,
      issues: [
        e.flags.noCalls ? "No calls on assigned leads" : null,
        e.flags.overdueFollowups ? "Overdue follow-ups" : null,
        e.flags.overdueTasks ? "Overdue tasks" : null,
        e.flags.lowProductivity ? "Productivity below 60%" : null,
        e.flags.noAdmissions ? "No admissions in range" : null,
        e.flags.noActivity ? "No activity logged" : null,
      ].filter(Boolean),
      productivityScore: e.productivityScore,
    }));

  const top = perEmployee[0] || null;
  const least = [...perEmployee].sort((a, b) => a.productivityScore - b.productivityScore)[0] || null;
  const mostRevenue = [...perEmployee].sort((a, b) => b.revenue - a.revenue)[0] || null;
  const mostAdmissions = [...perEmployee].sort((a, b) => b.admissions - a.admissions)[0] || null;
  const mostCalls = [...perEmployee].sort((a, b) => b.callsAttempted - a.callsAttempted)[0] || null;

  return {
    meta,
    section,
    kpis,
    charts: {
      callsByDay,
      admissionsByDay,
      funnel,
      ranking: perEmployee.slice(0, 15).map((e) => ({
        name: e.employeeName,
        score: e.productivityScore,
        band: e.productivityBand,
        calls: e.callsAttempted,
        admissions: e.admissions,
        revenue: e.revenue,
      })),
      taskTrend: days.map((d) => ({
        date: d,
        completed: tasks.filter((t) => t.status === "Completed" && inRange(t.updated_at, d, d)).length,
        pending: tasks.filter((t) => t.status !== "Completed" && inRange(t.updated_at || t.created_at, d, d)).length,
      })),
    },
    employees: perEmployee,
    team: {
      totalEmployees: scopeIds.length,
      totalCalls: calls.length,
      connectedCalls: connectedCalls.length,
      admissions: admissions.length,
      revenue,
      pendingFollowups: pendingFollowups.length,
      pendingTasks: tasksPending,
      averageProductivity: avgProductivity,
      topPerformer: top,
      leastActive: least,
      mostRevenue,
      mostAdmissions,
      mostCalls,
    },
    accountability,
    filterOptions: {
      departments: [...new Set(profiles.map((p) => p.department).filter(Boolean))] as string[],
      roles: [...new Set(profiles.map((p) => p.role).filter(Boolean))] as string[],
      employees: profiles.map((p) => ({ id: p.id, label: nameOf(p), department: p.department, role: p.role })),
    },
  };
}

async function buildCalls(
  supabase: SupabaseClient,
  filters: AnalyticsFilters,
  profileMap: Record<string, ProfileRow>,
  scopeIds: string[],
  meta: Record<string, unknown>,
) {
  const { data } = await supabase
    .from("lead_call_sessions")
    .select(
      "id,employee_id,lead_id,phone_number,started_at,ended_at,approximate_duration_seconds,call_outcome,remarks,session_status,employee_name",
    )
    .gte("started_at", isoStartOfDay(filters.from))
    .lte("started_at", isoEndOfDay(filters.to))
    .in("employee_id", scopeIds.length ? scopeIds : ["00000000-0000-0000-0000-000000000000"])
    .order("started_at", { ascending: false })
    .limit(2000);

  const leadIds = [...new Set((data ?? []).map((r) => r.lead_id).filter(Boolean))];
  const { data: leads } = leadIds.length
    ? await supabase
        .from("clients")
        .select("id,lead_name,name,phone,interested_program,follow_up_date,status,source")
        .in("id", leadIds)
    : { data: [] as { id: string; lead_name?: string | null; name?: string | null; phone?: string | null; interested_program?: string | null; follow_up_date?: string | null; status?: string | null; source?: string | null }[] };

  const leadMap = Object.fromEntries((leads ?? []).map((l) => [l.id, l]));

  let rows = (data ?? []).map((r) => {
    const lead = leadMap[r.lead_id];
    return {
      id: r.id,
      employeeId: r.employee_id,
      employee: r.employee_name || nameOf(profileMap[r.employee_id]),
      leadName: lead?.lead_name || lead?.name || "-",
      mobile: r.phone_number || lead?.phone || "-",
      date: (r.started_at || "").slice(0, 10),
      time: r.started_at ? new Date(r.started_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "-",
      durationSec: r.approximate_duration_seconds ?? null,
      outcome: r.call_outcome || "-",
      remarks: r.remarks || "-",
      nextFollowUp: lead?.follow_up_date || "-",
      status: r.session_status || lead?.status || "-",
      course: lead?.interested_program || "-",
      source: lead?.source || "-",
    };
  });

  if (filters.search) {
    rows = rows.filter(
      (r) =>
        r.employee.toLowerCase().includes(filters.search) ||
        r.leadName.toLowerCase().includes(filters.search) ||
        r.mobile.toLowerCase().includes(filters.search) ||
        r.outcome.toLowerCase().includes(filters.search),
    );
  }
  if (filters.course) {
    rows = rows.filter((r) => r.course.toLowerCase().includes(filters.course.toLowerCase()));
  }

  const page = filters.page || 1;
  const pageSize = filters.pageSize || 50;
  const start = (page - 1) * pageSize;
  return {
    meta,
    total: rows.length,
    page,
    pageSize,
    rows: rows.slice(start, start + pageSize),
    allRows: rows,
  };
}

async function buildFollowups(
  supabase: SupabaseClient,
  filters: AnalyticsFilters,
  profileMap: Record<string, ProfileRow>,
  scopeIds: string[],
  meta: Record<string, unknown>,
) {
  const today = filters.to;
  const { data: fus } = await supabase
    .from("lead_followups")
    .select("id,client_id,follow_up_date,follow_up_time,follow_up_type,status,outcome,assigned_employee_id,completed_at,notes")
    .gte("follow_up_date", filters.from)
    .lte("follow_up_date", filters.to.length >= 10 ? filters.to : today)
    .limit(3000);

  const { data: clientFu } = await supabase
    .from("clients")
    .select("id,lead_name,name,phone,assigned_to,follow_up_date,status,interested_program")
    .in("assigned_to", scopeIds.length ? scopeIds : ["00000000-0000-0000-0000-000000000000"])
    .not("follow_up_date", "is", null)
    .gte("follow_up_date", filters.from)
    .lte("follow_up_date", filters.to)
    .limit(3000);

  const clientIds = [
    ...new Set([
      ...(fus ?? []).map((f) => f.client_id),
      ...(clientFu ?? []).map((c) => c.id),
    ]),
  ];
  const { data: clients } = clientIds.length
    ? await supabase.from("clients").select("id,lead_name,name,phone,assigned_to").in("id", clientIds)
    : { data: [] as { id: string; lead_name?: string | null; name?: string | null; phone?: string | null; assigned_to?: string | null }[] };
  const cMap = Object.fromEntries((clients ?? []).map((c) => [c.id, c]));

  type FuRow = {
    id: string;
    employeeId: string;
    employee: string;
    leadName: string;
    mobile: string;
    date: string;
    time: string;
    type: string;
    status: string;
    outcome: string;
    bucket: string;
  };

  const rows: FuRow[] = [];
  for (const f of fus ?? []) {
    const c = cMap[f.client_id];
    const eid = f.assigned_employee_id || c?.assigned_to || "";
    if (scopeIds.length && eid && !scopeIds.includes(eid)) continue;
    const st = (f.status || "Pending").toLowerCase();
    let bucket = "Upcoming";
    if (st === "completed") bucket = "Completed";
    else if (st === "missed" || (f.follow_up_date < today && st === "pending")) bucket = "Overdue";
    else if (st === "rescheduled") bucket = "Rescheduled";
    else if (f.follow_up_date === today) bucket = st === "pending" ? "Pending" : "Today";
    else if (f.follow_up_date > today) bucket = "Upcoming";
    else bucket = "Pending";

    rows.push({
      id: f.id,
      employeeId: eid,
      employee: nameOf(profileMap[eid]),
      leadName: c?.lead_name || c?.name || "-",
      mobile: c?.phone || "-",
      date: f.follow_up_date,
      time: f.follow_up_time || "-",
      type: f.follow_up_type || "-",
      status: f.status || "Pending",
      outcome: f.outcome || "-",
      bucket,
    });
  }

  for (const c of clientFu ?? []) {
    if (!c.follow_up_date) continue;
    const already = rows.some((r) => r.date === c.follow_up_date && r.leadName === (c.lead_name || c.name));
    if (already) continue;
    const eid = c.assigned_to || "";
    let bucket = "Upcoming";
    if (c.follow_up_date < today) bucket = "Overdue";
    else if (c.follow_up_date === today) bucket = "Today";
    rows.push({
      id: `client-${c.id}`,
      employeeId: eid,
      employee: nameOf(profileMap[eid]),
      leadName: c.lead_name || c.name || "-",
      mobile: c.phone || "-",
      date: c.follow_up_date,
      time: "-",
      type: "Lead follow-up",
      status: "Pending",
      outcome: "-",
      bucket,
    });
  }

  const summary = {
    today: rows.filter((r) => r.date === today).length,
    completed: rows.filter((r) => r.bucket === "Completed").length,
    pending: rows.filter((r) => r.bucket === "Pending" || r.bucket === "Today").length,
    missed: rows.filter((r) => r.status.toLowerCase() === "missed").length,
    rescheduled: rows.filter((r) => r.bucket === "Rescheduled").length,
    overdue: rows.filter((r) => r.bucket === "Overdue").length,
    upcoming: rows.filter((r) => r.bucket === "Upcoming").length,
  };

  const overdueByEmployee: Record<string, number> = {};
  for (const r of rows.filter((x) => x.bucket === "Overdue")) {
    overdueByEmployee[r.employee] = (overdueByEmployee[r.employee] || 0) + 1;
  }

  return { meta, summary, overdueByEmployee, rows, total: rows.length };
}

async function buildTasks(
  supabase: SupabaseClient,
  filters: AnalyticsFilters,
  profileMap: Record<string, ProfileRow>,
  scopeIds: string[],
  meta: Record<string, unknown>,
) {
  let q = supabase
    .from("tasks")
    .select(
      "id,title,assigned_to,assigned_by,status,priority,progress,due_date,start_date,created_at,updated_at,completion_summary,assignment_type",
    )
    .order("updated_at", { ascending: false })
    .limit(2000);

  if (scopeIds.length) q = q.in("assigned_to", scopeIds);
  if (filters.taskStatus) q = q.eq("status", filters.taskStatus);

  const { data } = await q;
  const today = filters.to;
  let rows = (data ?? [])
    .filter(
      (t) =>
        inRange(t.updated_at, filters.from, filters.to) ||
        inRange(t.created_at, filters.from, filters.to) ||
        inRange(t.due_date, filters.from, filters.to),
    )
    .map((t) => ({
      id: t.id,
      task: t.title,
      assignedBy: nameOf(profileMap[t.assigned_by || ""]),
      assignedTo: nameOf(profileMap[t.assigned_to || ""]),
      assignedToId: t.assigned_to,
      priority: t.priority,
      deadline: t.due_date || "-",
      status: t.status,
      progress: t.progress ?? 0,
      completionTime: t.status === "Completed" ? (t.updated_at || "").slice(0, 16).replace("T", " ") : "-",
      type: t.assignment_type || "-",
      overdue: t.status !== "Completed" && t.due_date && t.due_date < today,
    }));

  if (filters.search) {
    rows = rows.filter(
      (r) =>
        r.task.toLowerCase().includes(filters.search) ||
        r.assignedTo.toLowerCase().includes(filters.search),
    );
  }

  return {
    meta,
    total: rows.length,
    completed: rows.filter((r) => r.status === "Completed").length,
    pending: rows.filter((r) => r.status !== "Completed").length,
    overdue: rows.filter((r) => r.overdue).length,
    rows,
  };
}

async function buildConversion(
  supabase: SupabaseClient,
  filters: AnalyticsFilters,
  scopeIds: string[],
  meta: Record<string, unknown>,
) {
  const { data } = await supabase
    .from("clients")
    .select("id,source,status,admission_status,final_fee,fee_quoted,assigned_to,created_at,updated_at,interested_program")
    .in("assigned_to", scopeIds.length ? scopeIds : ["00000000-0000-0000-0000-000000000000"])
    .limit(8000);

  let clients = data ?? [];
  if (filters.leadSource) clients = clients.filter((c) => (c.source || "") === filters.leadSource);
  if (filters.course) {
    clients = clients.filter((c) =>
      (c.interested_program || "").toLowerCase().includes(filters.course.toLowerCase()),
    );
  }

  const bySource: Record<
    string,
    { source: string; generated: number; qualified: number; interested: number; admission: number; revenue: number }
  > = {};

  for (const c of clients) {
    const source = (c.source || "Unknown").trim() || "Unknown";
    if (!bySource[source]) {
      bySource[source] = { source, generated: 0, qualified: 0, interested: 0, admission: 0, revenue: 0 };
    }
    const row = bySource[source];
    row.generated += 1;
    const st = c.status || "";
    if (["Contacted", "Interested", "Follow-up", "Counselling Scheduled", "Fee Discussed", "Admitted"].includes(st)) {
      row.qualified += 1;
    }
    if (["Interested", "Follow-up", "Counselling Scheduled", "Fee Discussed", "Admitted"].includes(st)) {
      row.interested += 1;
    }
    if (isAdmissionLead(c)) {
      row.admission += 1;
      row.revenue += num(c.final_fee);
    }
  }

  const rows = Object.values(bySource)
    .map((r) => ({
      ...r,
      conversionPct: r.generated > 0 ? Math.round((r.admission / r.generated) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.generated - a.generated);

  return { meta, rows, totalLeads: clients.length };
}

async function buildAdmissionsRevenue(
  supabase: SupabaseClient,
  filters: AnalyticsFilters,
  profileMap: Record<string, ProfileRow>,
  scopeIds: string[],
  meta: Record<string, unknown>,
  section: AnalyticsSectionId,
) {
  const { data } = await supabase
    .from("clients")
    .select(
      "id,lead_name,name,assigned_to,interested_program,service_interest,admission_status,status,final_fee,fee_quoted,payment_status,updated_at,created_at",
    )
    .in("assigned_to", scopeIds.length ? scopeIds : ["00000000-0000-0000-0000-000000000000"])
    .limit(8000);

  let clients = (data ?? []).filter(
    (c) =>
      isAdmissionLead(c) ||
      ["Partial", "Paid", "Refunded"].includes(c.payment_status || "") ||
      num(c.final_fee) > 0,
  );
  if (filters.admissionStatus) {
    clients = clients.filter((c) => (c.admission_status || "") === filters.admissionStatus);
  }
  if (filters.course) {
    clients = clients.filter(
      (c) =>
        (c.interested_program || "").toLowerCase().includes(filters.course.toLowerCase()) ||
        (c.service_interest || "").toLowerCase().includes(filters.course.toLowerCase()),
    );
  }

  const byCourse: Record<string, { course: string; admissions: number; revenue: number; pending: number; cancelled: number; refund: number }> = {};
  for (const c of clients) {
    const course = (c.interested_program || c.service_interest || "Unspecified").trim() || "Unspecified";
    if (!byCourse[course]) {
      byCourse[course] = { course, admissions: 0, revenue: 0, pending: 0, cancelled: 0, refund: 0 };
    }
    const row = byCourse[course];
    if (isAdmissionLead(c)) row.admissions += 1;
    if ((c.admission_status || "").toLowerCase().includes("cancel")) row.cancelled += 1;
    if ((c.payment_status || "") === "Refunded") row.refund += num(c.final_fee);
    if (["Partial", "Not Paid"].includes(c.payment_status || "")) row.pending += Math.max(0, num(c.final_fee) || num(c.fee_quoted));
    if (["Paid", "Partial"].includes(c.payment_status || "") || isAdmissionLead(c)) row.revenue += num(c.final_fee);
  }

  const byEmployee: Record<
    string,
    { employeeId: string; employee: string; admissions: number; revenue: number; pendingFees: number }
  > = {};
  for (const c of clients) {
    const eid = c.assigned_to || "";
    if (!byEmployee[eid]) {
      byEmployee[eid] = {
        employeeId: eid,
        employee: nameOf(profileMap[eid]),
        admissions: 0,
        revenue: 0,
        pendingFees: 0,
      };
    }
    const row = byEmployee[eid];
    if (isAdmissionLead(c)) row.admissions += 1;
    row.revenue += num(c.final_fee);
    if (["Partial", "Not Paid"].includes(c.payment_status || "")) {
      row.pendingFees += Math.max(0, num(c.final_fee) || num(c.fee_quoted));
    }
  }

  const employeeRows = Object.values(byEmployee)
    .map((r) => ({
      ...r,
      avgRevenuePerAdmission: r.admissions > 0 ? Math.round((r.revenue / r.admissions) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    meta,
    section,
    byCourse: Object.values(byCourse).sort((a, b) => b.admissions - a.admissions),
    byEmployee: employeeRows,
    detailRows: clients.map((c) => ({
      lead: c.lead_name || c.name || "-",
      employee: nameOf(profileMap[c.assigned_to || ""]),
      course: c.interested_program || c.service_interest || "-",
      admissionStatus: c.admission_status || "-",
      paymentStatus: c.payment_status || "-",
      feeQuoted: num(c.fee_quoted),
      finalFee: num(c.final_fee),
    })),
  };
}

async function buildTimeline(
  supabase: SupabaseClient,
  filters: AnalyticsFilters,
  profileMap: Record<string, ProfileRow>,
  meta: Record<string, unknown>,
) {
  const employeeId = filters.employeeId;
  if (!employeeId) {
    return {
      meta,
      error: "Select an employee to view their timeline.",
      events: [],
      employeeName: null,
    };
  }

  const fromTs = isoStartOfDay(filters.from);
  const toTs = isoEndOfDay(filters.to);

  const [att, calls, acts, tasks, fus, eod] = await Promise.all([
    supabase
      .from("attendance_records")
      .select("attendance_date,check_in_time,check_out_time,status,total_working_minutes")
      .eq("employee_id", employeeId)
      .gte("attendance_date", filters.from)
      .lte("attendance_date", filters.to),
    supabase
      .from("lead_call_sessions")
      .select("started_at,ended_at,call_outcome,phone_number,lead_id,remarks")
      .eq("employee_id", employeeId)
      .gte("started_at", fromTs)
      .lte("started_at", toTs)
      .order("started_at", { ascending: true })
      .limit(500),
    supabase
      .from("lead_activities")
      .select("created_at,activity_type,notes,client_id")
      .eq("created_by", employeeId)
      .gte("created_at", fromTs)
      .lte("created_at", toTs)
      .order("created_at", { ascending: true })
      .limit(500),
    supabase
      .from("task_activities")
      .select("created_at,activity_type,notes,task_id")
      .eq("actor_id", employeeId)
      .gte("created_at", fromTs)
      .lte("created_at", toTs)
      .order("created_at", { ascending: true })
      .limit(300),
    supabase
      .from("lead_followups")
      .select("created_at,follow_up_date,status,outcome,client_id")
      .eq("assigned_employee_id", employeeId)
      .gte("follow_up_date", filters.from)
      .lte("follow_up_date", filters.to)
      .limit(300),
    supabase
      .from("work_summaries")
      .select("summary_date,completed_work,pending_work,challenges,tomorrow_plan,support_required,additional_remarks,status,created_at")
      .eq("employee_id", employeeId)
      .gte("summary_date", filters.from)
      .lte("summary_date", filters.to),
  ]);

  type Ev = { at: string; kind: string; title: string; detail?: string };
  const events: Ev[] = [];

  for (const a of att.data ?? []) {
    if (a.check_in_time) {
      events.push({
        at: a.check_in_time,
        kind: "attendance",
        title: "Check In",
        detail: `Status: ${a.status || "present"}`,
      });
    }
    if (a.check_out_time) {
      events.push({
        at: a.check_out_time,
        kind: "attendance",
        title: "Check Out",
        detail: a.total_working_minutes != null ? `Worked ${Math.round(a.total_working_minutes / 60)}h` : undefined,
      });
    }
  }

  const leadIds = [...new Set((calls.data ?? []).map((c) => c.lead_id).filter(Boolean))];
  const { data: leadNames } = leadIds.length
    ? await supabase.from("clients").select("id,lead_name,name").in("id", leadIds)
    : { data: [] as { id: string; lead_name?: string | null; name?: string | null }[] };
  const lmap = Object.fromEntries((leadNames ?? []).map((l) => [l.id, l.lead_name || l.name || "Lead"]));

  for (const c of calls.data ?? []) {
    events.push({
      at: c.started_at,
      kind: "call",
      title: `Called ${lmap[c.lead_id] || c.phone_number || "candidate"}`,
      detail: [c.call_outcome, c.remarks].filter(Boolean).join(" · "),
    });
  }
  for (const a of acts.data ?? []) {
    events.push({
      at: a.created_at,
      kind: "crm",
      title: a.activity_type || "CRM update",
      detail: a.notes || undefined,
    });
  }
  for (const t of tasks.data ?? []) {
    events.push({
      at: t.created_at,
      kind: "task",
      title: t.activity_type || "Task activity",
      detail: t.notes || undefined,
    });
  }
  for (const f of fus.data ?? []) {
    events.push({
      at: f.created_at || `${f.follow_up_date}T12:00:00`,
      kind: "followup",
      title: `Follow-up ${f.status || ""}`.trim(),
      detail: f.outcome || `Scheduled ${f.follow_up_date}`,
    });
  }
  for (const s of eod.data ?? []) {
    events.push({
      at: s.created_at || `${s.summary_date}T18:00:00`,
      kind: "eod",
      title: "End of Day submitted",
      detail: s.completed_work?.slice(0, 120) || s.status || undefined,
    });
  }

  events.sort((a, b) => a.at.localeCompare(b.at));

  return {
    meta,
    employeeId,
    employeeName: nameOf(profileMap[employeeId]),
    events,
  };
}

async function buildEod(
  supabase: SupabaseClient,
  filters: AnalyticsFilters,
  profileMap: Record<string, ProfileRow>,
  scopeIds: string[],
  meta: Record<string, unknown>,
) {
  let q = supabase
    .from("work_summaries")
    .select(
      "id,employee_id,summary_date,completed_work,pending_work,challenges,tomorrow_plan,support_required,additional_remarks,manager_remarks,status,reviewed_by,reviewed_at,created_at",
    )
    .gte("summary_date", filters.from)
    .lte("summary_date", filters.to)
    .order("summary_date", { ascending: false })
    .limit(1000);
  if (scopeIds.length) q = q.in("employee_id", scopeIds);

  const { data, error } = await q;
  if (error && /support_required|additional_remarks|reviewed_by|column/i.test(error.message)) {
    const fb = await supabase
      .from("work_summaries")
      .select(
        "id,employee_id,summary_date,completed_work,pending_work,challenges,tomorrow_plan,manager_remarks,status,created_at",
      )
      .gte("summary_date", filters.from)
      .lte("summary_date", filters.to)
      .order("summary_date", { ascending: false })
      .limit(1000);
    const rows = ((scopeIds.length
      ? (fb.data ?? []).filter((r) => scopeIds.includes(r.employee_id || ""))
      : fb.data) ?? []
    ).map((r) => ({
      ...r,
      employeeName: nameOf(profileMap[r.employee_id || ""]),
      support_required: null,
      additional_remarks: null,
      reviewed_by: null,
      reviewed_at: null,
    }));
    return {
      meta,
      warning:
        "Run AJ_Academy_SB/analytics_reporting_schema.sql to enable support_required / review columns on work_summaries.",
      rows,
      missingEmployees: [],
    };
  }

  const rows = (data ?? []).map((r) => ({
    ...r,
    employeeName: nameOf(profileMap[r.employee_id || ""]),
  }));

  const submittedIds = new Set(rows.map((r) => `${r.employee_id}:${r.summary_date}`));
  const missingEmployees: { employeeId: string; employeeName: string; date: string }[] = [];
  for (const id of scopeIds) {
    for (const d of eachDateKey(filters.from, filters.to)) {
      const dt = new Date(d);
      if (dt.getDay() === 0 || dt.getDay() === 6) continue;
      if (!submittedIds.has(`${id}:${d}`)) {
        missingEmployees.push({
          employeeId: id,
          employeeName: nameOf(profileMap[id]),
          date: d,
        });
      }
    }
  }

  return { meta, rows, missingEmployees: missingEmployees.slice(0, 200) };
}
