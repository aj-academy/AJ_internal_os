import { NextResponse } from "next/server";
import { requireAdminApiSession, requireHrSelfServiceApiSession } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/hr/auditLog";
import { createPayslipSignedUrl, generatePayslipsForPeriod } from "@/lib/hr/payslipService";

export const dynamic = "force-dynamic";

function isAdminRole(role: string | null | undefined) {
  return role === "admin" || role === "super_admin";
}

// GET /api/hr/payslips?year=&month=&employeeId=
export async function GET(request: Request) {
  const { response, profile } = await requireHrSelfServiceApiSession();
  if (response || !profile) return response!;

  const url = new URL(request.url);
  const isAdmin = isAdminRole(profile.role);
  const year = url.searchParams.get("year");
  const month = url.searchParams.get("month");
  const employeeIdParam = url.searchParams.get("employeeId");
  const downloadId = url.searchParams.get("downloadId");

  const admin = createAdminClient();

  // Signed download
  if (downloadId) {
    const { data: slip, error } = await admin.from("payslips").select("*").eq("id", downloadId).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!slip) return NextResponse.json({ error: "Payslip not found" }, { status: 404 });

    const owns = slip.employee_id === profile.id;
    const employeeVisible =
      ["released", "regenerated"].includes(slip.status) && !!slip.released_at;
    if (!isAdmin && (!owns || !employeeVisible)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (slip.status === "failed") {
      return NextResponse.json({ error: "Payslip generation failed" }, { status: 400 });
    }

    try {
      const signedUrl = await createPayslipSignedUrl(admin, slip.storage_path, 120);
      await admin
        .from("payslips")
        .update({
          download_count: Number(slip.download_count || 0) + 1,
          last_downloaded_at: new Date().toISOString(),
          last_downloaded_by: profile.id,
        })
        .eq("id", slip.id);
      await writeAuditLog(admin, {
        actorId: profile.id,
        action: "payslip_downloaded",
        targetTable: "payslips",
        targetId: slip.id,
        newData: { employeeId: slip.employee_id, payslipNumber: slip.payslip_number },
      });
      return NextResponse.json({ signedUrl, expiresIn: 120, payslipNumber: slip.payslip_number });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Could not create download link" },
        { status: 500 },
      );
    }
  }

  let query = admin
    .from("payslips")
    .select(
      "id, employee_id, payslip_number, year, month, status, generated_at, released_at, download_count, generation_error, snapshot, payroll_period_id",
    )
    .order("year", { ascending: false })
    .order("month", { ascending: false });

  if (!isAdmin) {
    // Only slips that were actually released (regenerated still requires released_at)
    query = query
      .eq("employee_id", profile.id)
      .in("status", ["released", "regenerated"])
      .not("released_at", "is", null);
  } else if (employeeIdParam) {
    query = query.eq("employee_id", employeeIdParam);
  }
  if (year) query = query.eq("year", Number(year));
  if (month) query = query.eq("month", Number(month));

  const { data, error } = await query;
  if (error) {
    if (/does not exist/i.test(error.message)) {
      return NextResponse.json({
        payslips: [],
        migrationRequired: "hr_payroll_11_13_payslips_queries.sql",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Attach names for admin
  let payslips = data ?? [];
  if (isAdmin && payslips.length) {
    const ids = [...new Set(payslips.map((p) => p.employee_id))];
    const { data: profiles } = await admin.from("profiles").select("id, full_name").in("id", ids);
    const map = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    payslips = payslips.map((p) => ({ ...p, employee_name: map.get(p.employee_id) ?? null }));
  }

  return NextResponse.json({ payslips });
}

// POST — generate / release
export async function POST(request: Request) {
  const { response, profile } = await requireAdminApiSession();
  if (response || !profile) return response!;

  let body: {
    action?: "generate" | "release";
    year?: number;
    month?: number;
    periodId?: string;
    release?: boolean;
    payslipIds?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const action = body.action || "generate";

  if (action === "release") {
    let ids = [...(body.payslipIds ?? [])];
    if (!ids.length && body.periodId) {
      const { data } = await admin.from("payslips").select("id").eq("payroll_period_id", body.periodId);
      ids = (data ?? []).map((d) => d.id);
    }
    if (!ids.length) return NextResponse.json({ error: "No payslips to release" }, { status: 400 });

    const { data, error } = await admin
      .from("payslips")
      .update({
        status: "released",
        released_at: new Date().toISOString(),
        released_by: profile.id,
      })
      .in("id", ids)
      .in("status", ["generated", "regenerated", "released"])
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAuditLog(admin, {
      actorId: profile.id,
      action: "payslip_released",
      targetTable: "payslips",
      targetId: body.periodId ?? ids[0],
      newData: { count: data?.length ?? 0 },
    });

    // Notify employees (generic message; no amounts). Respect payroll settings.
    try {
      const releasedIds = (data ?? []).map((d) => d.id);
      if (releasedIds.length) {
        const { data: slips } = await admin
          .from("payslips")
          .select("id, employee_id, year, month, payroll_period_id")
          .in("id", releasedIds);
        const sample = slips?.[0];
        const settings = sample
          ? await import("@/lib/hr/payrollSettings").then(({ resolvePayrollSettingsForDate }) =>
              resolvePayrollSettingsForDate(
                admin,
                `${sample.year}-${String(sample.month).padStart(2, "0")}-15`,
              ),
            )
          : null;
        if (settings?.notify_employees_on_release !== false && slips?.length) {
          const { notifyPayslipReleased } = await import("@/lib/hr/payrollNotifications");
          for (const s of slips) {
            void notifyPayslipReleased({
              employeeId: s.employee_id,
              payslipId: s.id,
              year: s.year,
              month: s.month,
            });
          }
        }
      }
    } catch {
      /* notification must not block release */
    }

    return NextResponse.json({ ok: true, released: data?.length ?? 0 });
  }

  // generate
  let periodId = body.periodId?.trim() || "";
  if (!periodId) {
    const year = Number(body.year);
    const month = Number(body.month);
    if (!year || !month) {
      return NextResponse.json({ error: "periodId or year+month required" }, { status: 400 });
    }
    const { data: period } = await admin
      .from("payroll_periods")
      .select("id")
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();
    if (!period) return NextResponse.json({ error: "Payroll period not found. Approve/lock first." }, { status: 404 });
    periodId = period.id as string;
  }

  try {
    const result = await generatePayslipsForPeriod(admin, periodId, profile.id, {
      release: !!body.release,
    });
    await writeAuditLog(admin, {
      actorId: profile.id,
      action: "payslip_generated",
      targetTable: "payroll_periods",
      targetId: periodId,
      newData: {
        generated: result.generated,
        failed: result.failed,
        skipped: result.skipped,
        released: !!body.release,
      },
    });

    if (body.release && result.generated > 0) {
      try {
        const { data: periodRow } = await admin
          .from("payroll_periods")
          .select("year, month, period_end")
          .eq("id", periodId)
          .maybeSingle();
        const settings = periodRow
          ? await import("@/lib/hr/payrollSettings").then(({ resolvePayrollSettingsForDate }) =>
              resolvePayrollSettingsForDate(
                admin,
                periodRow.period_end ||
                  `${periodRow.year}-${String(periodRow.month).padStart(2, "0")}-15`,
              ),
            )
          : null;
        if (settings?.notify_employees_on_release !== false) {
          const { data: slips } = await admin
            .from("payslips")
            .select("id, employee_id, year, month, status, released_at")
            .eq("payroll_period_id", periodId)
            .not("released_at", "is", null);
          const { notifyPayslipReleased } = await import("@/lib/hr/payrollNotifications");
          for (const s of slips ?? []) {
            void notifyPayslipReleased({
              employeeId: s.employee_id,
              payslipId: s.id,
              year: s.year,
              month: s.month,
            });
          }
        }
      } catch {
        /* ignore */
      }
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Payslip generation failed" },
      { status: 400 },
    );
  }
}
