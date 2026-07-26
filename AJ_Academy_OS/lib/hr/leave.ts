import type { SupabaseClient } from "@supabase/supabase-js";
import { isWeeklyOffDay } from "@/lib/hr/attendanceStatus";
import { resolveAttendancePolicyForDate } from "@/lib/hr/attendancePolicy";

export type LeaveTypeRow = {
  id: string;
  code: string;
  name: string;
  is_paid: boolean;
  annual_entitlement: number;
  monthly_accrual: number;
  carry_forward_allowed: boolean;
  max_carry_forward: number;
  max_balance: number | null;
  min_notice_days: number;
  requires_document: boolean;
  allows_half_day: boolean;
  allow_negative_balance: boolean;
  counts_as_presence: boolean;
  is_active: boolean;
  effective_from: string;
  sort_order: number;
};

export type LeaveApplicationRow = {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  is_half_day: boolean;
  half_day_session: "first_half" | "second_half" | null;
  total_days: number;
  reason: string;
  contact_info: string | null;
  attachment_url: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  applied_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_remarks: string | null;
};

export type LeaveBalanceView = {
  leaveTypeId: string;
  code: string;
  name: string;
  isPaid: boolean;
  countsAsPresence: boolean;
  year: number;
  opening: number;
  accrued: number;
  used: number;
  adjusted: number;
  available: number;
  entitlementConfigured: boolean;
};

export function eachDateInRange(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const start = new Date(`${startIso}T12:00:00Z`);
  const end = new Date(`${endIso}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return out;
  const cursor = new Date(start);
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * Count chargeable leave days in a range, excluding weekly offs (per the policy
 * effective on each date) and holidays. Half-day = 0.5 (single date only).
 */
export async function countChargeableLeaveDays(
  admin: SupabaseClient,
  startIso: string,
  endIso: string,
  isHalfDay: boolean,
): Promise<{ totalDays: number; skipped: { weeklyOffs: string[]; holidays: string[] } }> {
  const dates = eachDateInRange(startIso, endIso);
  if (!dates.length) return { totalDays: 0, skipped: { weeklyOffs: [], holidays: [] } };

  if (isHalfDay) {
    return { totalDays: 0.5, skipped: { weeklyOffs: [], holidays: [] } };
  }

  const { data: holidayRows } = await admin
    .from("holidays")
    .select("holiday_date")
    .gte("holiday_date", startIso)
    .lte("holiday_date", endIso);
  const holidaySet = new Set((holidayRows ?? []).map((h: { holiday_date: string }) => h.holiday_date));

  const weeklyOffs: string[] = [];
  const holidays: string[] = [];
  let total = 0;

  // Policies rarely change mid-range; cache by date resolution result.
  const policyCache = new Map<string, number[]>();

  for (const date of dates) {
    let weeklyOffDays = policyCache.get(date);
    if (!weeklyOffDays) {
      const { policy } = await resolveAttendancePolicyForDate(admin, date);
      weeklyOffDays = policy.weeklyOffDays;
      policyCache.set(date, weeklyOffDays);
    }
    if (holidaySet.has(date)) {
      holidays.push(date);
      continue;
    }
    if (isWeeklyOffDay(date, weeklyOffDays)) {
      weeklyOffs.push(date);
      continue;
    }
    total += 1;
  }

  return { totalDays: total, skipped: { weeklyOffs, holidays } };
}

/**
 * Compute balances for an employee/year by joining leave_types with any
 * leave_balances rows. No rows are invented: if the company has not configured
 * an entitlement, `entitlementConfigured` is false and available stays 0
 * (unless an explicit balance row exists).
 */
export async function loadLeaveBalances(
  admin: SupabaseClient,
  employeeId: string,
  year: number,
): Promise<LeaveBalanceView[]> {
  const [{ data: types, error: typesErr }, { data: balances, error: balErr }] = await Promise.all([
    admin.from("leave_types").select("*").eq("is_active", true).order("sort_order"),
    admin.from("leave_balances").select("*").eq("employee_id", employeeId).eq("year", year),
  ]);
  if (typesErr) throw new Error(typesErr.message);
  if (balErr) throw new Error(balErr.message);

  const balanceByType = new Map(
    (balances ?? []).map((b: { leave_type_id: string } & Record<string, unknown>) => [b.leave_type_id, b]),
  );

  return ((types ?? []) as LeaveTypeRow[]).map((t) => {
    const b = balanceByType.get(t.id) as
      | { opening_balance: number; accrued: number; used: number; adjusted: number }
      | undefined;
    const opening = Number(b?.opening_balance ?? 0);
    // Until a balance row exists, the annual entitlement acts as the accrued grant.
    const accrued = b ? Number(b.accrued) : Number(t.annual_entitlement);
    const used = Number(b?.used ?? 0);
    const adjusted = Number(b?.adjusted ?? 0);
    return {
      leaveTypeId: t.id,
      code: t.code,
      name: t.name,
      isPaid: t.is_paid,
      countsAsPresence: t.counts_as_presence,
      year,
      opening,
      accrued,
      used,
      adjusted,
      available: opening + accrued + adjusted - used,
      entitlementConfigured: Number(t.annual_entitlement) > 0 || !!b,
    };
  });
}

/**
 * Record consumed leave on approval. Upserts the (employee, type, year) row,
 * initializing accrued from the type's annual entitlement on first use.
 */
export async function consumeLeaveBalance(
  admin: SupabaseClient,
  employeeId: string,
  leaveType: LeaveTypeRow,
  year: number,
  days: number,
  actorId: string | null,
): Promise<void> {
  if (leaveType.counts_as_presence) return; // e.g. WFH does not burn a balance

  const { data: existing } = await admin
    .from("leave_balances")
    .select("id, used, accrued")
    .eq("employee_id", employeeId)
    .eq("leave_type_id", leaveType.id)
    .eq("year", year)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("leave_balances")
      .update({ used: Number(existing.used) + days, updated_by: actorId })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from("leave_balances").insert({
      employee_id: employeeId,
      leave_type_id: leaveType.id,
      year,
      accrued: Number(leaveType.annual_entitlement),
      used: days,
      updated_by: actorId,
    });
    if (error) throw new Error(error.message);
  }
}

/** Reverse a previously consumed balance (e.g. approved leave later cancelled by admin). */
export async function restoreLeaveBalance(
  admin: SupabaseClient,
  employeeId: string,
  leaveType: LeaveTypeRow,
  year: number,
  days: number,
  actorId: string | null,
): Promise<void> {
  if (leaveType.counts_as_presence) return;
  const { data: existing } = await admin
    .from("leave_balances")
    .select("id, used")
    .eq("employee_id", employeeId)
    .eq("leave_type_id", leaveType.id)
    .eq("year", year)
    .maybeSingle();
  if (!existing) return;
  const { error } = await admin
    .from("leave_balances")
    .update({ used: Math.max(0, Number(existing.used) - days), updated_by: actorId })
    .eq("id", existing.id);
  if (error) throw new Error(error.message);
}
