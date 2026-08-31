import {
  eachDateKey,
  isoEndOfDay,
  isoStartOfDay,
  isWeekendKeyIst,
  resolveDateRange,
  toDateKeyIst,
} from "@/lib/analytics/dateRanges";
import {
  computeProductivityScore,
  isAdmissionLead,
  isConnectedOutcome,
} from "@/lib/analytics/productivity";
import { asFilterList, type AnalyticsFilters, type AnalyticsSectionId, type DatePreset } from "@/lib/analytics/types";
import { parseCrmSettingsLists } from "@/lib/crmSettings";
import { ADMISSION_STATUSES } from "@/components/student-lead-master/studentMasterConfig";
import type { SupabaseClient } from "@supabase/supabase-js";

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  department: string | null;
  status: string | null;
};

const STAFF_ROLES = new Set(["employee", "admin", "super_admin", "mentor", "freelancer"]);

function nameOf(p: ProfileRow | undefined): string {
  return p?.full_name?.trim() || p?.email?.trim() || "Unknown";
}

function istDateKeyFromIso(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function istTimeFromIso(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatIstDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Inclusive range on IST calendar dates. Date-only values (due_date) stay as stored. */
function inRange(iso: string | null | undefined, from: string, to: string): boolean {
  if (!iso) return false;
  const raw = iso.trim();
  const key = raw.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : istDateKeyFromIso(raw);
  if (!key || key === "-") return false;
  return key >= from && key <= to;
}

function inList(value: string | null | undefined, selected: string[]): boolean {
  if (!selected.length) return true;
  return selected.includes((value || "").trim());
}

function courseInList(
  program: string | null | undefined,
  service: string | null | undefined,
  selected: string[],
): boolean {
  if (!selected.length) return true;
  const p = (program || "").trim();
  const s = (service || "").trim();
  return selected.includes(p) || selected.includes(s);
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

const FETCH_PAGE_SIZE = 1000;
/**
 * Upper bound per source. Reaching it means the report is showing partial data,
 * which is reported to the client instead of being silently truncated.
 */
const FETCH_CEILING = 30000;

type PagedQuery<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Pages through a source until it is exhausted, rather than taking the first N
 * rows. A fixed `.limit()` silently drops rows once a table outgrows it, which
 * makes totals wrong rather than merely incomplete.
 */
async function fetchAllRows<T>(
  label: string,
  truncated: Set<string>,
  build: (from: number, to: number) => PagedQuery<T>,
  ceiling: number = FETCH_CEILING,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < ceiling; from += FETCH_PAGE_SIZE) {
    const to = Math.min(from + FETCH_PAGE_SIZE, ceiling) - 1;
    const { data, error } = await build(from, to);
    if (error) {
      truncated.add(label);
      break;
    }
    const page = data ?? [];
    rows.push(...page);
    if (page.length < to - from + 1) return rows;
  }
  if (rows.length >= ceiling) truncated.add(label);
  return rows;
}

/**
 * Id lookups are chunked because a single `.in()` with thousands of UUIDs
 * exceeds the request URL length.
 */
const IN_CHUNK_SIZE = 400;

async function fetchByIds<T>(
  ids: string[],
  build: (chunk: string[]) => PagedQuery<T>,
): Promise<T[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const out: T[] = [];
  for (let i = 0; i < unique.length; i += IN_CHUNK_SIZE) {
    const { data } = await build(unique.slice(i, i + IN_CHUNK_SIZE));
    out.push(...(data ?? []));
  }
  return out;
}

/** Empty scope must not match every row. */
const NO_MATCH_ID = "00000000-0000-0000-0000-000000000000";

function scopeOr(scopeIds: string[]): string[] {
  return scopeIds.length ? scopeIds : [NO_MATCH_ID];
}

function partialPayload(truncated: Set<string>): { partial?: { tables: string[] } } {
  return truncated.size ? { partial: { tables: [...truncated].sort() } } : {};
}

export type AnalyticsQueryBody = {
  section: AnalyticsSectionId;
  preset?: DatePreset;
  from?: string;
  to?: string;
  employeeId?: string;
  employeeIds?: string[] | string;
  department?: string;
  departments?: string[] | string;
  role?: string;
  roles?: string[] | string;
  course?: string;
  courses?: string[] | string;
  leadSource?: string;
  leadSources?: string[] | string;
  leadStatus?: string;
  leadStatuses?: string[] | string;
  taskStatus?: string;
  taskStatuses?: string[] | string;
  admissionStatus?: string;
  admissionStatuses?: string[] | string;
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
  // Explicit Start/End dates are authoritative. `preset` is only honoured for
  // older callers that send it instead of a range.
  const preset: DatePreset = body.preset || (body.from || body.to ? "custom" : "today");
  const { from, to } = resolveDateRange(preset, body.from, body.to);

  const employeeIds = body.forceEmployeeId
    ? [body.forceEmployeeId]
    : asFilterList(body.employeeIds ?? body.employeeId);
  const departments = asFilterList(body.departments ?? body.department);
  const roles = asFilterList(body.roles ?? body.role);
  const courses = asFilterList(body.courses ?? body.course);
  const leadSources = asFilterList(body.leadSources ?? body.leadSource);
  const leadStatuses = asFilterList(body.leadStatuses ?? body.leadStatus);
  const taskStatuses = asFilterList(body.taskStatuses ?? body.taskStatus);
  const admissionStatuses = asFilterList(body.admissionStatuses ?? body.admissionStatus);

  const filters: AnalyticsFilters = {
    from,
    to,
    employeeIds,
    departments,
    roles,
    courses,
    leadSources,
    leadStatuses,
    taskStatuses,
    admissionStatuses,
    search: (body.search || "").trim().toLowerCase(),
    page: Math.max(1, body.page || 1),
    pageSize: Math.min(200, Math.max(10, body.pageSize || 50)),
  };

  const [{ data: profileRows }, { data: crmSetting }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,full_name,email,role,department,status")
      .in("role", ["employee", "admin", "super_admin", "mentor", "freelancer", "student"])
      .or("status.is.null,status.eq.active")
      .order("full_name", { ascending: true })
      .limit(2000),
    supabase.from("system_settings").select("setting_value").eq("setting_key", "crm").maybeSingle(),
  ]);

  const allProfiles = (profileRows ?? []) as ProfileRow[];
  // Full name map so assigner/assignee labels stay correct when a filter is applied.
  const profileMap = Object.fromEntries(allProfiles.map((p) => [p.id, p]));
  const crmLists = parseCrmSettingsLists(crmSetting?.setting_value);

  let profiles = allProfiles.filter((p) => {
    if (filters.roles.length) return filters.roles.includes(p.role || "");
    return STAFF_ROLES.has(p.role || "");
  });
  if (filters.departments.length) {
    profiles = profiles.filter((p) => filters.departments.includes(p.department || ""));
  }
  if (filters.employeeIds.length) {
    profiles = allProfiles.filter((p) => filters.employeeIds.includes(p.id));
  }

  const scopeIds = filters.employeeIds.length ? filters.employeeIds : profiles.map((p) => p.id);

  // A self-scoped viewer cannot filter by anyone else, so they must not receive
  // the staff roster as filter options.
  const optionProfiles = body.forceEmployeeId
    ? allProfiles.filter((p) => p.id === body.forceEmployeeId)
    : allProfiles;

  const filterOptions = {
    departments: [...new Set(optionProfiles.map((p) => p.department).filter(Boolean))] as string[],
    roles: [...new Set(optionProfiles.map((p) => p.role).filter(Boolean))] as string[],
    employees: optionProfiles
      .filter((p) => STAFF_ROLES.has(p.role || ""))
      .map((p) => ({ id: p.id, label: nameOf(p), department: p.department, role: p.role })),
    courses: crmLists.interestedPrograms,
    leadSources: crmLists.leadSources,
    leadStatuses: crmLists.leadStatuses,
    admissionStatuses: [...ADMISSION_STATUSES],
  };

  const meta = {
    from,
    to,
    preset,
    generatedAt: new Date().toISOString(),
    employeeCount: scopeIds.length,
  };

  const section = body.section;
  const withOpts = (data: Record<string, unknown>) => ({ ...data, filterOptions });

  if (section === "overview" || section === "team" || section === "productivity" || section === "daily") {
    return withOpts(await buildAggregates(supabase, filters, profiles, profileMap, scopeIds, meta, section));
  }
  if (section === "calls") return withOpts(await buildCalls(supabase, filters, profileMap, scopeIds, meta));
  if (section === "followups") return withOpts(await buildFollowups(supabase, filters, profileMap, scopeIds, meta));
  if (section === "tasks") return withOpts(await buildTasks(supabase, filters, profileMap, scopeIds, meta));
  if (section === "conversion") return withOpts(await buildConversion(supabase, filters, scopeIds, meta));
  if (section === "admissions" || section === "revenue") {
    return withOpts(await buildAdmissionsRevenue(supabase, filters, profileMap, scopeIds, meta, section));
  }
  if (section === "timeline") return withOpts(await buildTimeline(supabase, filters, profileMap, scopeIds, meta));
  if (section === "eod") return withOpts(await buildEod(supabase, filters, profileMap, scopeIds, meta));
  if (section === "download") {
    const [daily, calls, tasks, eod] = await Promise.all([
      buildAggregates(supabase, filters, profiles, profileMap, scopeIds, meta, "daily"),
      buildCalls(supabase, filters, profileMap, scopeIds, meta),
      buildTasks(supabase, filters, profileMap, scopeIds, meta),
      buildEod(supabase, filters, profileMap, scopeIds, meta),
    ]);
    return withOpts({ meta, daily, calls, tasks, eod });
  }

  return withOpts({ meta, error: "Unknown section" });
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
    days.filter((d) => !isWeekendKeyIst(d)).length || days.length,
  );

  const truncated = new Set<string>();
  const scope = scopeOr(scopeIds);

  const [
    attendance,
    leadCalls,
    collegePhoneCalls,
    allTasksRows,
    leadActivityRows,
    collegeActivityRows,
    followupRows,
    clientRows,
    completionActs,
  ] = await Promise.all([
    fetchAllRows("attendance", truncated, (f, t) =>
      supabase
        .from("attendance_records")
        .select("id,employee_id,attendance_date,check_in_time,check_out_time,status,total_working_minutes")
        .gte("attendance_date", filters.from)
        .lte("attendance_date", filters.to)
        .in("employee_id", scope)
        .order("attendance_date", { ascending: true })
        .order("id", { ascending: true })
        .range(f, t),
    ),
    fetchAllRows("calls", truncated, (f, t) =>
      supabase
        .from("lead_call_sessions")
        .select("id,employee_id,lead_id,phone_number,started_at,ended_at,approximate_duration_seconds,call_outcome,notes,session_status")
        .gte("started_at", fromTs)
        .lte("started_at", toTs)
        .in("employee_id", scope)
        .order("started_at", { ascending: true })
        .order("id", { ascending: true })
        .range(f, t),
    ),
    fetchAllRows("college calls", truncated, (f, t) =>
      supabase
        .from("college_visit_activities")
        .select("id,created_by,created_at,activity_type,notes,college_visit_id")
        .eq("activity_type", "Phone Call")
        .gte("created_at", fromTs)
        .lte("created_at", toTs)
        .in("created_by", scope)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(f, t),
    ),
    fetchAllRows("tasks", truncated, (f, t) =>
      supabase
        .from("tasks")
        .select("id,title,assigned_to,assigned_by,status,priority,progress,due_date,created_at,updated_at,completion_summary")
        .in("assigned_to", scope)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(f, t),
    ),
    fetchAllRows("CRM activity", truncated, (f, t) =>
      supabase
        .from("lead_activities")
        .select("id,client_id,activity_type,notes,created_at,created_by")
        .gte("created_at", fromTs)
        .lte("created_at", toTs)
        .in("created_by", scope)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(f, t),
    ),
    fetchAllRows("college activity", truncated, (f, t) =>
      supabase
        .from("college_visit_activities")
        .select("id,college_visit_id,activity_type,notes,created_at,created_by")
        .gte("created_at", fromTs)
        .lte("created_at", toTs)
        .in("created_by", scope)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(f, t),
    ),
    fetchAllRows("follow-ups", truncated, (f, t) =>
      supabase
        .from("lead_followups")
        .select("id,client_id,follow_up_date,follow_up_time,status,outcome,assigned_employee_id,completed_at")
        .gte("follow_up_date", filters.from)
        .lte("follow_up_date", filters.to)
        .order("follow_up_date", { ascending: true })
        .order("id", { ascending: true })
        .range(f, t),
    ),
    fetchAllRows("leads", truncated, (f, t) =>
      supabase
        .from("clients")
        .select(
          "id,lead_name,name,phone,assigned_to,status,source,interested_program,service_interest,admission_status,fee_quoted,final_fee,payment_status,follow_up_date,updated_at,created_at,last_call_outcome,total_call_attempts",
        )
        .in("assigned_to", scope)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(f, t),
    ),
    fetchAllRows("task completions", truncated, (f, t) =>
      supabase
        .from("task_activities")
        .select("id,task_id,actor_id,notes,created_at")
        .eq("activity_type", "task_completed")
        .gte("created_at", fromTs)
        .lte("created_at", toTs)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(f, t),
    ),
  ]);
  // Normalize college dialer logs into the same shape used for call KPIs.
  const calls = [
    ...leadCalls.map((c) => ({
      id: c.id,
      employee_id: c.employee_id,
      started_at: c.started_at,
      call_outcome: c.call_outcome,
    })),
    ...collegePhoneCalls.map((c) => ({
      id: `cv:${c.id}`,
      employee_id: c.created_by || "",
      started_at: c.created_at,
      call_outcome: "Phone Call",
    })),
  ];
  const allTasks = allTasksRows;
  const activities = [
    ...leadActivityRows,
    ...collegeActivityRows.map((a) => ({
      id: `cvact:${a.id}`,
      client_id: a.college_visit_id,
      activity_type: a.activity_type,
      notes: a.notes,
      created_at: a.created_at,
      created_by: a.created_by,
    })),
  ];
  const followups = followupRows.filter((f) => {
    const eid = f.assigned_employee_id;
    return !eid || scopeIds.includes(eid);
  });
  let clients = clientRows;
  if (filters.leadSources.length) clients = clients.filter((c) => inList(c.source, filters.leadSources));
  if (filters.leadStatuses.length) clients = clients.filter((c) => inList(c.status, filters.leadStatuses));
  if (filters.admissionStatuses.length) {
    clients = clients.filter((c) => inList(c.admission_status, filters.admissionStatuses));
  }
  if (filters.courses.length) {
    clients = clients.filter((c) => courseInList(c.interested_program, c.service_interest, filters.courses));
  }

  const completionTaskIds = [...new Set(completionActs.map((a) => a.task_id).filter(Boolean))];
  const knownTaskIds = new Set(allTasks.map((t) => t.id));
  const missingCompletionTaskIds = completionTaskIds.filter((id) => !knownTaskIds.has(id));
  let extraCompletedTasks = allTasks.slice(0, 0);
  if (missingCompletionTaskIds.length) {
    const extra = await supabase
      .from("tasks")
      .select("id,title,assigned_to,assigned_by,status,priority,progress,due_date,created_at,updated_at,completion_summary")
      .in("id", missingCompletionTaskIds.slice(0, 1000));
    extraCompletedTasks = extra.data ?? [];
  }
  const taskById = Object.fromEntries([...allTasks, ...extraCompletedTasks].map((t) => [t.id, t]));

  const matchesTaskScope = (assignedTo: string | null | undefined, assignedBy: string | null | undefined, actorId: string | null | undefined) => {
    if (filters.employeeIds.length) {
      return (
        filters.employeeIds.includes(assignedTo || "") ||
        filters.employeeIds.includes(assignedBy || "") ||
        filters.employeeIds.includes(actorId || "")
      );
    }
    if (filters.departments.length || filters.roles.length) {
      return scopeIds.includes(assignedTo || "") || scopeIds.includes(actorId || "");
    }
    return true;
  };

  const completionsInRange = completionActs.filter((a) => {
    const t = taskById[a.task_id];
    return matchesTaskScope(t?.assigned_to, t?.assigned_by, a.actor_id);
  });
  const completionTaskIdSet = new Set(completionsInRange.map((a) => a.task_id));
  const fallbackCompleted = allTasks.filter(
    (t) =>
      t.status === "Completed" &&
      inRange(t.updated_at, filters.from, filters.to) &&
      !completionTaskIdSet.has(t.id) &&
      matchesTaskScope(t.assigned_to, t.assigned_by, t.assigned_to),
  );

  const liveToday = toDateKeyIst();
  const attendanceTodayKey = filters.from <= liveToday && filters.to >= liveToday ? liveToday : filters.to;
  const presentEmployees = new Set(
    attendance
      .filter((a) =>
        (filters.from === filters.to ? a.attendance_date === filters.from : true) &&
        ["present", "completed", "late"].includes((a.status || "").toLowerCase()),
      )
      .map((a) => a.employee_id),
  );
  const workingEmployees = new Set(
    attendance
      .filter((a) => a.attendance_date === attendanceTodayKey && a.check_in_time && !a.check_out_time)
      .map((a) => a.employee_id),
  );
  const checkedOut = new Set(
    attendance
      .filter((a) => a.attendance_date === attendanceTodayKey && a.check_out_time)
      .map((a) => a.employee_id),
  );

  const connectedCalls = calls.filter((c) => isConnectedOutcome(c.call_outcome));
  const pendingFollowups = followups.filter((f) => {
    const st = (f.status || "Pending").toLowerCase();
    return st === "pending" || st === "missed" || (f.follow_up_date < attendanceTodayKey && st === "pending");
  });
  const admissionsLifetime = clients.filter((c) => isAdmissionLead(c));
  const admissions = admissionsLifetime.filter(
    (c) => inRange(c.updated_at, filters.from, filters.to) || inRange(c.created_at, filters.from, filters.to),
  );
  const revenue = admissions.reduce((s, c) => s + num(c.final_fee), 0);
  const pendingRevenue = clients
    .filter((c) => ["Partial", "Not Paid"].includes(c.payment_status || ""))
    .reduce((s, c) => s + Math.max(0, num(c.final_fee) || num(c.fee_quoted)), 0);
  const tasksCompleted = completionsInRange.length + fallbackCompleted.length;
  const tasksPending = allTasks.filter((t) => t.status !== "Completed").length;
  const todayKey = attendanceTodayKey;

  const perEmployee = scopeIds.map((id) => {
    const empCalls = calls.filter((c) => c.employee_id === id);
    const empTasks = allTasks.filter((t) => t.assigned_to === id);
    const empCompletions = [
      ...completionsInRange.filter((a) => {
        const t = taskById[a.task_id];
        return t?.assigned_to === id || a.actor_id === id;
      }),
      ...fallbackCompleted.filter((t) => t.assigned_to === id),
    ];
    const empActs = activities.filter((a) => a.created_by === id);
    const empFu = followups.filter((f) => f.assigned_employee_id === id);
    const empClients = clients.filter((c) => c.assigned_to === id);
    const empAtt = attendance.filter((a) => a.employee_id === id);
    const empAdmissions = empClients.filter(
      (c) =>
        isAdmissionLead(c) &&
        (inRange(c.updated_at, filters.from, filters.to) || inRange(c.created_at, filters.from, filters.to)),
    );
    const fuDone = empFu.filter((f) => (f.status || "").toLowerCase() === "completed").length;
    const fuDue = empFu.length;
    const presentDays = empAtt.filter((a) =>
      ["present", "completed", "late"].includes((a.status || "").toLowerCase()),
    ).length;
    const empTasksCompleted = empCompletions.length;
    const empTasksPending = empTasks.filter((t) => t.status !== "Completed").length;
    const prod = computeProductivityScore({
      callsAttempted: empCalls.length,
      callsConnected: empCalls.filter((c) => isConnectedOutcome(c.call_outcome)).length,
      crmUpdates: empActs.length,
      tasksCompleted: empTasksCompleted,
      tasksAssigned: empTasks.length || empTasksCompleted,
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

    const completedWork = empCompletions
      .map((item) => {
        if ("task_id" in item) {
          const t = taskById[item.task_id];
          return (t?.title || item.notes || "").trim();
        }
        return (item.title || "").trim();
      })
      .filter(Boolean)
      .slice(0, 4)
      .join("; ");

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
      tasksAssigned: empTasks.length,
      tasksCompleted: empTasksCompleted,
      tasksPending: empTasksPending,
      completedWork: completedWork || "-",
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
        noActivity: empCalls.length === 0 && empActs.length === 0 && empTasksCompleted === 0,
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
    calls: calls.filter((c) => istDateKeyFromIso(c.started_at) === d).length,
    connected: calls.filter(
      (c) => istDateKeyFromIso(c.started_at) === d && isConnectedOutcome(c.call_outcome),
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
    tasksOverdue: perEmployee.reduce((s, e) => s + num(e.overdueTasks), 0),
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
    ...partialPayload(truncated),
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
        completed:
          completionsInRange.filter((a) => inRange(a.created_at, d, d)).length +
          fallbackCompleted.filter((t) => inRange(t.updated_at, d, d)).length,
        pending: allTasks.filter((t) => t.status !== "Completed" && inRange(t.due_date || t.created_at, d, d)).length,
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
  };
}

function parsePhoneFromCallNotes(notes: string | null | undefined): string {
  const m = String(notes || "").match(/Called\s+(\d[\d\s-]{6,}\d)/i);
  return m?.[1]?.replace(/\s+/g, "") || "-";
}

type CallActivityRow = {
  id: string;
  employeeId: string;
  employee: string;
  leadName: string;
  mobile: string;
  date: string;
  time: string;
  durationSec: number | null;
  outcome: string;
  remarks: string;
  nextFollowUp: string;
  status: string;
  course: string;
  source: string;
  startedAt: string;
};

async function buildCalls(
  supabase: SupabaseClient,
  filters: AnalyticsFilters,
  profileMap: Record<string, ProfileRow>,
  scopeIds: string[],
  meta: Record<string, unknown>,
) {
  const fromTs = isoStartOfDay(filters.from);
  const toTs = isoEndOfDay(filters.to);
  const emptyScope = scopeOr(scopeIds);
  const truncated = new Set<string>();

  const [data, collegeCalls] = await Promise.all([
    fetchAllRows("calls", truncated, (f, t) =>
      supabase
        .from("lead_call_sessions")
        .select(
          "id,employee_id,lead_id,phone_number,started_at,ended_at,approximate_duration_seconds,call_outcome,notes,session_status,employee_name",
        )
        .gte("started_at", fromTs)
        .lte("started_at", toTs)
        .in("employee_id", emptyScope)
        .order("started_at", { ascending: false })
        .order("id", { ascending: true })
        .range(f, t),
    ),
    // College Visits dialer logs Phone Call into college_visit_activities (not lead_call_sessions).
    fetchAllRows("college calls", truncated, (f, t) =>
      supabase
        .from("college_visit_activities")
        .select("id,college_visit_id,activity_type,notes,created_by,created_at")
        .eq("activity_type", "Phone Call")
        .gte("created_at", fromTs)
        .lte("created_at", toTs)
        .in("created_by", emptyScope)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(f, t),
    ),
  ]);

  const leadIds = [...new Set(data.map((r) => r.lead_id).filter(Boolean))];
  const visitIds = [...new Set(collegeCalls.map((r) => r.college_visit_id).filter(Boolean))];

  const [leads, visits] = await Promise.all([
    fetchByIds(leadIds, (chunk) =>
      supabase
        .from("clients")
        .select("id,lead_name,name,phone,interested_program,follow_up_date,status,source")
        .in("id", chunk),
    ),
    fetchByIds(visitIds, (chunk) =>
      supabase
        .from("college_visits")
        .select("id,college_name,next_follow_up_date,visit_status,contact_number")
        .in("id", chunk),
    ),
  ]);

  const leadMap = Object.fromEntries(leads.map((l) => [l.id, l]));
  const visitMap = Object.fromEntries(visits.map((v) => [v.id, v]));

  const sessionRows: CallActivityRow[] = data.map((r) => {
    const lead = leadMap[r.lead_id];
    return {
      id: r.id,
      employeeId: r.employee_id,
      employee: r.employee_name || nameOf(profileMap[r.employee_id]),
      leadName: lead?.lead_name || lead?.name || "-",
      mobile: r.phone_number || lead?.phone || "-",
      date: istDateKeyFromIso(r.started_at),
      time: istTimeFromIso(r.started_at),
      durationSec: r.approximate_duration_seconds ?? null,
      outcome: r.call_outcome || "-",
      remarks: r.notes || "-",
      nextFollowUp: lead?.follow_up_date || "-",
      status: r.session_status || lead?.status || "-",
      course: lead?.interested_program || "-",
      source: "Student Lead",
      startedAt: r.started_at,
    };
  });

  const collegeRows: CallActivityRow[] = collegeCalls.map((r) => {
    const visit = visitMap[r.college_visit_id];
    const eid = r.created_by || "";
    return {
      id: `cv-call:${r.id}`,
      employeeId: eid,
      employee: nameOf(profileMap[eid]),
      leadName: visit?.college_name || "College visit",
      mobile: parsePhoneFromCallNotes(r.notes) || visit?.contact_number || "-",
      date: istDateKeyFromIso(r.created_at),
      time: istTimeFromIso(r.created_at),
      durationSec: null,
      outcome: "Phone Call",
      remarks: r.notes || "-",
      nextFollowUp: visit?.next_follow_up_date || "-",
      status: visit?.visit_status || "College Visit",
      course: "-",
      source: "College Visit",
      startedAt: r.created_at,
    };
  });

  let rows = [...sessionRows, ...collegeRows].sort((a, b) =>
    String(b.startedAt).localeCompare(String(a.startedAt)),
  );

  if (filters.search) {
    rows = rows.filter(
      (r) =>
        r.employee.toLowerCase().includes(filters.search) ||
        r.leadName.toLowerCase().includes(filters.search) ||
        r.mobile.toLowerCase().includes(filters.search) ||
        r.outcome.toLowerCase().includes(filters.search) ||
        r.source.toLowerCase().includes(filters.search),
    );
  }
  if (filters.courses.length) {
    rows = rows.filter((r) => inList(r.course, filters.courses));
  }

  // Strip technical fields before UI/export so PDF never receives id / employeeId / startedAt.
  const publicRows = rows.map(({ id: _id, employeeId: _eid, startedAt: _at, course: _course, durationSec, ...rest }) => ({
    ...rest,
    duration: durationSec == null ? "-" : `${durationSec}s`,
  }));

  const page = filters.page || 1;
  const pageSize = filters.pageSize || 50;
  const start = (page - 1) * pageSize;
  return {
    meta: {
      ...meta,
      note: "Includes Student Lead call sessions and College Visits dialer Phone Call logs.",
    },
    ...partialPayload(truncated),
    total: publicRows.length,
    page,
    pageSize,
    rows: publicRows.slice(start, start + pageSize),
    allRows: publicRows,
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
  const truncated = new Set<string>();

  const [fus, clientFu] = await Promise.all([
    fetchAllRows("follow-ups", truncated, (f, t) =>
      supabase
        .from("lead_followups")
        .select("id,client_id,follow_up_date,follow_up_time,follow_up_type,status,outcome,assigned_employee_id,completed_at,notes")
        .gte("follow_up_date", filters.from)
        .lte("follow_up_date", filters.to.length >= 10 ? filters.to : today)
        .order("follow_up_date", { ascending: true })
        .order("id", { ascending: true })
        .range(f, t),
    ),
    fetchAllRows("lead follow-up dates", truncated, (f, t) =>
      supabase
        .from("clients")
        .select("id,lead_name,name,phone,assigned_to,follow_up_date,status,interested_program")
        .in("assigned_to", scopeOr(scopeIds))
        .not("follow_up_date", "is", null)
        .gte("follow_up_date", filters.from)
        .lte("follow_up_date", filters.to)
        .order("follow_up_date", { ascending: true })
        .order("id", { ascending: true })
        .range(f, t),
    ),
  ]);

  const clientIds = [...new Set([...fus.map((f) => f.client_id), ...clientFu.map((c) => c.id)])];
  const clients = await fetchByIds(clientIds, (chunk) =>
    supabase.from("clients").select("id,lead_name,name,phone,assigned_to").in("id", chunk),
  );
  const cMap = Object.fromEntries(clients.map((c) => [c.id, c]));

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
  for (const f of fus) {
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

  for (const c of clientFu) {
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

  return { meta, ...partialPayload(truncated), summary, overdueByEmployee, rows, total: rows.length };
}

async function buildTasks(
  supabase: SupabaseClient,
  filters: AnalyticsFilters,
  profileMap: Record<string, ProfileRow>,
  scopeIds: string[],
  meta: Record<string, unknown>,
) {
  const fromTs = isoStartOfDay(filters.from);
  const toTs = isoEndOfDay(filters.to);
  const today = toDateKeyIst();
  const taskSelect =
    "id,title,assigned_to,assigned_by,status,priority,progress,due_date,start_date,created_at,updated_at,completion_summary,assignment_type";

  const matchesScope = (assignedTo?: string | null, assignedBy?: string | null, actorId?: string | null) => {
    if (filters.employeeIds.length) {
      return (
        filters.employeeIds.includes(assignedTo || "") ||
        filters.employeeIds.includes(assignedBy || "") ||
        filters.employeeIds.includes(actorId || "")
      );
    }
    if (filters.departments.length || filters.roles.length) {
      return scopeIds.includes(assignedTo || "") || scopeIds.includes(actorId || "");
    }
    return true;
  };

  const truncated = new Set<string>();

  const [acts, openTaskRows] = await Promise.all([
    fetchAllRows("task completions", truncated, (f, t) =>
      supabase
        .from("task_activities")
        .select("id,task_id,actor_id,notes,created_at")
        .eq("activity_type", "task_completed")
        .gte("created_at", fromTs)
        .lte("created_at", toTs)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(f, t),
    ),
    fetchAllRows("open tasks", truncated, (f, t) => {
      let q = supabase
        .from("tasks")
        .select(taskSelect)
        .neq("status", "Completed")
        .order("due_date", { ascending: true })
        .order("id", { ascending: true })
        .range(f, t);
      if (filters.employeeIds.length === 1) {
        q = q.or(`assigned_to.eq.${filters.employeeIds[0]},assigned_by.eq.${filters.employeeIds[0]}`);
      } else if (filters.employeeIds.length > 1) {
        q = q.in("assigned_to", filters.employeeIds);
      } else if ((filters.departments.length || filters.roles.length) && scopeIds.length) {
        q = q.in("assigned_to", scopeIds);
      }
      return q;
    }),
  ]);

  const completedIds = [...new Set(acts.map((a) => a.task_id).filter(Boolean))];
  const completedTasks = await fetchByIds(completedIds, (chunk) =>
    supabase.from("tasks").select(taskSelect).in("id", chunk),
  );
  const completedById = Object.fromEntries(completedTasks.map((t) => [t.id, t]));

  const fallbackRows = await fetchAllRows("completed tasks", truncated, (f, t) =>
    supabase
      .from("tasks")
      .select(taskSelect)
      .eq("status", "Completed")
      .gte("updated_at", fromTs)
      .lte("updated_at", toTs)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(f, t),
  );
  const fallbackCompleted = fallbackRows.filter((t) => !completedById[t.id]);

  type TaskRow = {
    id: string;
    task: string;
    assignedBy: string;
    assignedTo: string;
    assignedToId: string | null;
    completedBy: string;
    priority: string | null;
    deadline: string;
    status: string;
    progress: number;
    completionTime: string;
    completionSummary: string;
    type: string;
    overdue: boolean;
  };

  const completedRows: TaskRow[] = [];
  for (const a of acts) {
    const t = completedById[a.task_id];
    if (!t) continue;
    if (!matchesScope(t.assigned_to, t.assigned_by, a.actor_id)) continue;
    completedRows.push({
      id: `${t.id}:${a.id}`,
      task: t.title,
      assignedBy: nameOf(profileMap[t.assigned_by || ""]),
      assignedTo: nameOf(profileMap[t.assigned_to || ""]),
      assignedToId: t.assigned_to,
      completedBy: nameOf(profileMap[a.actor_id || t.assigned_to || ""]),
      priority: t.priority,
      deadline: t.due_date || "-",
      status: "Completed",
      progress: t.progress ?? 100,
      completionTime: formatIstDateTime(a.created_at),
      completionSummary: String(t.completion_summary || a.notes || "").trim() || "-",
      type: t.assignment_type || "-",
      overdue: Boolean(t.due_date && t.due_date < istDateKeyFromIso(a.created_at)),
    });
  }
  for (const t of fallbackCompleted) {
    if (!matchesScope(t.assigned_to, t.assigned_by, t.assigned_to)) continue;
    completedRows.push({
      id: t.id,
      task: t.title,
      assignedBy: nameOf(profileMap[t.assigned_by || ""]),
      assignedTo: nameOf(profileMap[t.assigned_to || ""]),
      assignedToId: t.assigned_to,
      completedBy: nameOf(profileMap[t.assigned_to || ""]),
      priority: t.priority,
      deadline: t.due_date || "-",
      status: "Completed",
      progress: t.progress ?? 100,
      completionTime: formatIstDateTime(t.updated_at),
      completionSummary: String(t.completion_summary || "").trim() || "-",
      type: t.assignment_type || "-",
      overdue: Boolean(t.due_date && t.due_date < today),
    });
  }

  const openRows: TaskRow[] = openTaskRows
    .filter(
      (t) =>
        inRange(t.due_date, filters.from, filters.to) ||
        inRange(t.created_at, filters.from, filters.to) ||
        Boolean(t.due_date && t.due_date < today),
    )
    .filter((t) => matchesScope(t.assigned_to, t.assigned_by, t.assigned_to))
    .map((t) => ({
      id: t.id,
      task: t.title,
      assignedBy: nameOf(profileMap[t.assigned_by || ""]),
      assignedTo: nameOf(profileMap[t.assigned_to || ""]),
      assignedToId: t.assigned_to,
      completedBy: "-",
      priority: t.priority,
      deadline: t.due_date || "-",
      status: t.status,
      progress: t.progress ?? 0,
      completionTime: "-",
      completionSummary: "-",
      type: t.assignment_type || "-",
      overdue: Boolean(t.status !== "Completed" && t.due_date && t.due_date < today),
    }));

  const statusFilter = filters.taskStatuses;
  let rows = !statusFilter.length
    ? [...completedRows, ...openRows]
    : [
        ...(statusFilter.includes("Completed") ? completedRows : []),
        ...openRows.filter((r) => statusFilter.includes(r.status)),
      ];

  if (filters.search) {
    const q = filters.search;
    rows = rows.filter(
      (r) =>
        r.task.toLowerCase().includes(q) ||
        r.assignedTo.toLowerCase().includes(q) ||
        r.assignedBy.toLowerCase().includes(q) ||
        r.completionSummary.toLowerCase().includes(q),
    );
  }

  return {
    meta,
    ...partialPayload(truncated),
    total: rows.length,
    completed: completedRows.length,
    pending: openRows.filter((r) => !r.overdue).length,
    overdue: openRows.filter((r) => r.overdue).length,
    rows,
    completedRows,
    openRows,
  };
}

async function buildConversion(
  supabase: SupabaseClient,
  filters: AnalyticsFilters,
  scopeIds: string[],
  meta: Record<string, unknown>,
) {
  const truncated = new Set<string>();
  const data = await fetchAllRows("leads", truncated, (f, t) =>
    supabase
      .from("clients")
      .select("id,source,status,admission_status,final_fee,fee_quoted,assigned_to,created_at,updated_at,interested_program")
      .in("assigned_to", scopeOr(scopeIds))
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(f, t),
  );

  let clients = data;
  if (filters.leadSources.length) clients = clients.filter((c) => inList(c.source, filters.leadSources));
  if (filters.courses.length) {
    clients = clients.filter((c) => courseInList(c.interested_program, null, filters.courses));
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

  return { meta, ...partialPayload(truncated), rows, totalLeads: clients.length };
}

async function buildAdmissionsRevenue(
  supabase: SupabaseClient,
  filters: AnalyticsFilters,
  profileMap: Record<string, ProfileRow>,
  scopeIds: string[],
  meta: Record<string, unknown>,
  section: AnalyticsSectionId,
) {
  const truncated = new Set<string>();
  const data = await fetchAllRows("leads", truncated, (f, t) =>
    supabase
      .from("clients")
      .select(
        "id,lead_name,name,assigned_to,interested_program,service_interest,admission_status,status,final_fee,fee_quoted,payment_status,updated_at,created_at",
      )
      .in("assigned_to", scopeOr(scopeIds))
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(f, t),
  );

  let clients = data.filter(
    (c) =>
      isAdmissionLead(c) ||
      ["Partial", "Paid", "Refunded"].includes(c.payment_status || "") ||
      num(c.final_fee) > 0,
  );
  if (filters.admissionStatuses.length) {
    clients = clients.filter((c) => inList(c.admission_status, filters.admissionStatuses));
  }
  if (filters.courses.length) {
    clients = clients.filter((c) => courseInList(c.interested_program, c.service_interest, filters.courses));
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
    ...partialPayload(truncated),
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
  scopeIds: string[],
  meta: Record<string, unknown>,
) {
  const employeeId = filters.employeeIds.length === 1 ? filters.employeeIds[0] : "";
  if (!employeeId) {
    return buildTeamTimeline(supabase, filters, profileMap, scopeIds, meta);
  }

  const fromTs = isoStartOfDay(filters.from);
  const toTs = isoEndOfDay(filters.to);

  const [att, calls, acts, collegeActs, tasks, fus, eod] = await Promise.all([
    supabase
      .from("attendance_records")
      .select("attendance_date,check_in_time,check_out_time,status,total_working_minutes")
      .eq("employee_id", employeeId)
      .gte("attendance_date", filters.from)
      .lte("attendance_date", filters.to),
    supabase
      .from("lead_call_sessions")
      .select("started_at,ended_at,call_outcome,phone_number,lead_id,notes")
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
      .from("college_visit_activities")
      .select("created_at,activity_type,notes,college_visit_id")
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
  const visitIds = [...new Set((collegeActs.data ?? []).map((a) => a.college_visit_id).filter(Boolean))];
  const [{ data: leadNames }, { data: visitNames }] = await Promise.all([
    leadIds.length
      ? supabase.from("clients").select("id,lead_name,name").in("id", leadIds)
      : Promise.resolve({ data: [] as { id: string; lead_name?: string | null; name?: string | null }[] }),
    visitIds.length
      ? supabase.from("college_visits").select("id,college_name").in("id", visitIds)
      : Promise.resolve({ data: [] as { id: string; college_name?: string | null }[] }),
  ]);
  const lmap = Object.fromEntries((leadNames ?? []).map((l) => [l.id, l.lead_name || l.name || "Lead"]));
  const vmap = Object.fromEntries((visitNames ?? []).map((v) => [v.id, v.college_name || "College"]));

  for (const c of calls.data ?? []) {
    events.push({
      at: c.started_at,
      kind: "call",
      title: `Called ${lmap[c.lead_id] || c.phone_number || "candidate"}`,
      detail: [c.call_outcome, c.notes].filter(Boolean).join(" · "),
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
  for (const a of collegeActs.data ?? []) {
    events.push({
      at: a.created_at,
      kind: "college",
      title: `${a.activity_type || "College update"} · ${vmap[a.college_visit_id] || "College"}`,
      detail: a.notes || undefined,
    });
  }
  const taskIds = [...new Set((tasks.data ?? []).map((t) => t.task_id).filter(Boolean))];
  const { data: taskNames } = taskIds.length
    ? await supabase.from("tasks").select("id,title").in("id", taskIds)
    : { data: [] as { id: string; title?: string | null }[] };
  const tmap = Object.fromEntries((taskNames ?? []).map((t) => [t.id, t.title || "Task"]));

  for (const t of tasks.data ?? []) {
    const label =
      t.activity_type === "task_completed"
        ? `Completed: ${tmap[t.task_id] || "Task"}`
        : `${t.activity_type || "Task activity"} · ${tmap[t.task_id] || "Task"}`;
    events.push({
      at: t.created_at,
      kind: "task",
      title: label,
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
    teamMode: false,
    events,
  };
}

async function buildTeamTimeline(
  supabase: SupabaseClient,
  filters: AnalyticsFilters,
  profileMap: Record<string, ProfileRow>,
  scopeIds: string[],
  meta: Record<string, unknown>,
) {
  const fromTs = isoStartOfDay(filters.from);
  const toTs = isoEndOfDay(filters.to);
  const emptyScope = scopeOr(scopeIds);

  const [calls, acts, collegeActs, taskActs, eod] = await Promise.all([
    supabase
      .from("lead_call_sessions")
      .select("started_at,call_outcome,phone_number,lead_id,notes,employee_id")
      .gte("started_at", fromTs)
      .lte("started_at", toTs)
      .in("employee_id", emptyScope)
      .order("started_at", { ascending: false })
      .limit(200),
    supabase
      .from("lead_activities")
      .select("created_at,activity_type,notes,client_id,created_by")
      .gte("created_at", fromTs)
      .lte("created_at", toTs)
      .in("created_by", emptyScope)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("college_visit_activities")
      .select("created_at,activity_type,notes,college_visit_id,created_by")
      .gte("created_at", fromTs)
      .lte("created_at", toTs)
      .in("created_by", emptyScope)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("task_activities")
      .select("created_at,activity_type,notes,task_id,actor_id")
      .eq("activity_type", "task_completed")
      .gte("created_at", fromTs)
      .lte("created_at", toTs)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("work_summaries")
      .select("summary_date,completed_work,status,created_at,employee_id")
      .gte("summary_date", filters.from)
      .lte("summary_date", filters.to)
      .in("employee_id", emptyScope)
      .limit(200),
  ]);

  const taskIds = [...new Set((taskActs.data ?? []).map((t) => t.task_id).filter(Boolean))];
  const leadIds = [
    ...new Set([
      ...(calls.data ?? []).map((c) => c.lead_id),
      ...(acts.data ?? []).map((a) => a.client_id),
    ].filter(Boolean)),
  ];
  const visitIds = [...new Set((collegeActs.data ?? []).map((a) => a.college_visit_id).filter(Boolean))];
  const [{ data: taskNames }, { data: leadNames }, { data: visitNames }] = await Promise.all([
    taskIds.length
      ? supabase.from("tasks").select("id,title,assigned_to").in("id", taskIds)
      : Promise.resolve({ data: [] as { id: string; title?: string | null; assigned_to?: string | null }[] }),
    leadIds.length
      ? supabase.from("clients").select("id,lead_name,name").in("id", leadIds)
      : Promise.resolve({ data: [] as { id: string; lead_name?: string | null; name?: string | null }[] }),
    visitIds.length
      ? supabase.from("college_visits").select("id,college_name").in("id", visitIds)
      : Promise.resolve({ data: [] as { id: string; college_name?: string | null }[] }),
  ]);
  const tmap = Object.fromEntries((taskNames ?? []).map((t) => [t.id, t.title || "Task"]));
  const lmap = Object.fromEntries((leadNames ?? []).map((l) => [l.id, l.lead_name || l.name || "Lead"]));
  const vmap = Object.fromEntries((visitNames ?? []).map((v) => [v.id, v.college_name || "College"]));

  type Ev = { at: string; kind: string; title: string; detail?: string; employee?: string };
  const events: Ev[] = [];
  const who = (id: string | null | undefined) => nameOf(profileMap[id || ""]);

  for (const c of calls.data ?? []) {
    events.push({
      at: c.started_at,
      kind: "call",
      employee: who(c.employee_id),
      title: `${who(c.employee_id)} called ${lmap[c.lead_id] || c.phone_number || "candidate"}`,
      detail: [c.call_outcome, c.notes].filter(Boolean).join(" · "),
    });
  }
  for (const a of acts.data ?? []) {
    events.push({
      at: a.created_at,
      kind: "crm",
      employee: who(a.created_by),
      title: `${who(a.created_by)} · ${a.activity_type || "CRM update"}`,
      detail: a.notes || lmap[a.client_id] || undefined,
    });
  }
  for (const a of collegeActs.data ?? []) {
    events.push({
      at: a.created_at,
      kind: "college",
      employee: who(a.created_by),
      title: `${who(a.created_by)} · ${a.activity_type || "College update"} · ${vmap[a.college_visit_id] || "College"}`,
      detail: a.notes || undefined,
    });
  }
  for (const t of taskActs.data ?? []) {
    events.push({
      at: t.created_at,
      kind: "task",
      employee: who(t.actor_id),
      title: `${who(t.actor_id)} completed ${tmap[t.task_id] || "a task"}`,
      detail: t.notes || undefined,
    });
  }
  for (const s of eod.data ?? []) {
    events.push({
      at: s.created_at || `${s.summary_date}T18:00:00`,
      kind: "eod",
      employee: who(s.employee_id),
      title: `${who(s.employee_id)} submitted End of Day`,
      detail: s.completed_work?.slice(0, 160) || s.status || undefined,
    });
  }

  events.sort((a, b) => b.at.localeCompare(a.at));

  return {
    meta,
    employeeId: null,
    employeeName: "Team",
    teamMode: true,
    events: events.slice(0, 250),
  };
}

async function buildEod(
  supabase: SupabaseClient,
  filters: AnalyticsFilters,
  profileMap: Record<string, ProfileRow>,
  scopeIds: string[],
  meta: Record<string, unknown>,
) {
  const truncated = new Set<string>();
  type WorkSummaryRow = {
    id: string;
    employee_id: string | null;
    summary_date: string;
    [key: string]: unknown;
  };
  const FULL_SELECT =
    "id,employee_id,summary_date,completed_work,pending_work,challenges,tomorrow_plan,support_required,additional_remarks,manager_remarks,status,reviewed_by,reviewed_at,created_at";
  const LEGACY_SELECT =
    "id,employee_id,summary_date,completed_work,pending_work,challenges,tomorrow_plan,manager_remarks,status,created_at";

  // Probe once so the extended-column fallback is decided before paging.
  const probe = await supabase.from("work_summaries").select(FULL_SELECT).limit(1);
  const useLegacy = Boolean(
    probe.error && /support_required|additional_remarks|reviewed_by|column/i.test(probe.error.message),
  );

  const eodSelect = useLegacy ? LEGACY_SELECT : FULL_SELECT;
  const eodRows = await fetchAllRows<WorkSummaryRow>("EOD summaries", truncated, (f, t) => {
    let q = supabase
      .from("work_summaries")
      .select(eodSelect)
      .gte("summary_date", filters.from)
      .lte("summary_date", filters.to)
      .order("summary_date", { ascending: false })
      .order("id", { ascending: true })
      .range(f, t);
    if (scopeIds.length) q = q.in("employee_id", scopeIds);
    // The select list is chosen at runtime, so the row shape cannot be inferred.
    return q as unknown as PagedQuery<WorkSummaryRow>;
  });

  const rows = eodRows.map((r) => ({
    ...r,
    employeeName: nameOf(profileMap[r.employee_id || ""]),
    ...(useLegacy
      ? { support_required: null, additional_remarks: null, reviewed_by: null, reviewed_at: null }
      : {}),
  }));

  const submittedIds = new Set(rows.map((r) => `${r.employee_id}:${r.summary_date}`));
  const missingEmployees: { employeeId: string; employeeName: string; date: string }[] = [];
  for (const id of scopeIds) {
    for (const d of eachDateKey(filters.from, filters.to)) {
      if (isWeekendKeyIst(d)) continue;
      if (!submittedIds.has(`${id}:${d}`)) {
        missingEmployees.push({
          employeeId: id,
          employeeName: nameOf(profileMap[id]),
          date: d,
        });
      }
    }
  }

  return {
    meta,
    ...partialPayload(truncated),
    ...(useLegacy
      ? {
          warning:
            "Run AJ_Academy_SB/analytics_reporting_schema.sql to enable support_required / review columns on work_summaries.",
        }
      : {}),
    rows,
    missingEmployees: missingEmployees.slice(0, 200),
  };
}
