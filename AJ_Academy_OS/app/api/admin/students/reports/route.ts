import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/security/auth/requireAdminApi";
import { buildCsv } from "@/lib/csv";
import * as XLSX from "xlsx";
import { getMentorWorkload } from "@/lib/students/mentorAssignments";

export const runtime = "nodejs";

type ReportKind =
  | "import_summary"
  | "students_without_mentor"
  | "students_with_multiple_mentors"
  | "mentor_workload"
  | "expiring_allocations"
  | "temporary_allocations"
  | "allocation_history";

/**
 * GET /api/admin/students/reports?kind=...&format=json|csv|xlsx|pdf
 */
export async function GET(request: Request) {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;

  const url = new URL(request.url);
  const kind = (url.searchParams.get("kind") || "import_summary") as ReportKind;
  const format = (url.searchParams.get("format") || "json").toLowerCase();
  const admin = createAdminClient();

  try {
    await admin.rpc("expire_student_mentor_assignments");
  } catch {
    /* optional */
  }

  let title = "Report";
  let headers: string[] = [];
  let rows: (string | number | null)[][] = [];

  if (kind === "import_summary") {
    title = "Student Import Summary";
    headers = [
      "Batch",
      "File",
      "Status",
      "Mode",
      "Rows",
      "Created",
      "Updated",
      "Skipped",
      "Failed",
      "Uploaded At",
    ];
    const { data, error } = await admin
      .from("student_import_batches")
      .select(
        "batch_number,file_name,status,import_mode,data_row_count,created_count,updated_count,skipped_count,failed_count,uploaded_at",
      )
      .order("uploaded_at", { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows = (data ?? []).map((b) => [
      b.batch_number,
      b.file_name,
      b.status,
      b.import_mode,
      b.data_row_count,
      b.created_count,
      b.updated_count,
      b.skipped_count,
      b.failed_count,
      b.uploaded_at,
    ]);
  } else if (kind === "students_without_mentor") {
    title = "Students Without Primary Mentor";
    headers = ["Name", "Email", "Registration", "Department", "Course"];
    const [{ data: students }, { data: primary }] = await Promise.all([
      admin
        .from("profiles")
        .select("id,full_name,email,registration_number,department,course,assigned_mentor_id")
        .eq("role", "student")
        .eq("status", "active")
        .limit(5000),
      admin
        .from("student_mentor_assignments")
        .select("student_id")
        .eq("status", "active")
        .eq("is_primary", true)
        .limit(10000),
    ]);
    const has = new Set((primary ?? []).map((p) => p.student_id));
    rows = (students ?? [])
      .filter((s) => !has.has(s.id) && !s.assigned_mentor_id)
      .map((s) => [s.full_name, s.email, s.registration_number, s.department, s.course]);
  } else if (kind === "students_with_multiple_mentors") {
    title = "Students With Multiple Active Mentors";
    headers = ["Student ID", "Active Mentors"];
    const { data } = await admin
      .from("student_mentor_assignments")
      .select("student_id")
      .eq("status", "active")
      .limit(10000);
    const counts = new Map<string, number>();
    for (const a of data ?? []) counts.set(a.student_id, (counts.get(a.student_id) || 0) + 1);
    rows = Array.from(counts.entries())
      .filter(([, n]) => n > 1)
      .map(([id, n]) => [id, n]);
  } else if (kind === "mentor_workload") {
    title = "Mentor Capacity / Workload";
    headers = ["Mentor", "Email", "Primary", "Secondary", "Total", "Max", "Pct", "Status"];
    const { data: mentors } = await admin
      .from("profiles")
      .select("id,full_name,email")
      .eq("role", "mentor")
      .limit(200);
    for (const m of mentors ?? []) {
      const w = await getMentorWorkload(admin, m.id);
      rows.push([
        m.full_name,
        m.email,
        w.primary,
        w.secondary,
        w.total,
        w.caps.max_total_students,
        w.pct,
        w.status,
      ]);
    }
  } else if (kind === "expiring_allocations" || kind === "temporary_allocations") {
    title = kind === "temporary_allocations" ? "Temporary Allocations" : "Expiring Allocations";
    headers = ["Student", "Mentor", "Role", "Start", "End", "Temporary", "Status"];
    const today = new Date().toISOString().slice(0, 10);
    const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    let q = admin
      .from("student_mentor_assignments")
      .select("student_id,mentor_id,mentor_role,start_date,end_date,is_temporary,status")
      .eq("status", "active")
      .not("end_date", "is", null)
      .limit(2000);
    if (kind === "temporary_allocations") q = q.eq("is_temporary", true);
    else q = q.gte("end_date", today).lte("end_date", in14);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const ids = Array.from(
      new Set((data ?? []).flatMap((a) => [a.student_id, a.mentor_id])),
    );
    const { data: profiles } = ids.length
      ? await admin.from("profiles").select("id,full_name,email").in("id", ids)
      : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
    const map = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || p.id]));
    rows = (data ?? []).map((a) => [
      map.get(a.student_id) || a.student_id,
      map.get(a.mentor_id) || a.mentor_id,
      a.mentor_role,
      a.start_date,
      a.end_date,
      a.is_temporary ? "yes" : "no",
      a.status,
    ]);
  } else if (kind === "allocation_history") {
    title = "Mentor Allocation History";
    headers = ["Student", "Mentor", "Role", "Primary", "Status", "Start", "End", "Assigned At"];
    const { data, error } = await admin
      .from("student_mentor_assignments")
      .select("student_id,mentor_id,mentor_role,is_primary,status,start_date,end_date,assigned_at")
      .order("assigned_at", { ascending: false })
      .limit(1000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const ids = Array.from(new Set((data ?? []).flatMap((a) => [a.student_id, a.mentor_id])));
    const { data: profiles } = ids.length
      ? await admin.from("profiles").select("id,full_name,email").in("id", ids)
      : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
    const map = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || p.id]));
    rows = (data ?? []).map((a) => [
      map.get(a.student_id) || a.student_id,
      map.get(a.mentor_id) || a.mentor_id,
      a.mentor_role,
      a.is_primary ? "yes" : "no",
      a.status,
      a.start_date,
      a.end_date,
      a.assigned_at,
    ]);
  } else {
    return NextResponse.json({ error: "Unknown report kind." }, { status: 400 });
  }

  if (format === "json") {
    return NextResponse.json({ title, headers, rows, count: rows.length });
  }

  const safeName = title.replace(/[^\w\-]+/g, "_").slice(0, 60);
  if (format === "csv") {
    const csv = buildCsv(headers, rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}.csv"`,
      },
    });
  }

  if (format === "xlsx") {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), "Report");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new NextResponse(new Uint8Array(Buffer.isBuffer(buf) ? buf : Buffer.from(buf)), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeName}.xlsx"`,
      },
    });
  }

  if (format === "pdf") {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text(title, 14, 16);
    autoTable(doc, {
      startY: 22,
      head: [headers],
      body: rows.map((r) => r.map((c) => (c == null ? "" : String(c)))),
      styles: { fontSize: 8 },
    });
    const ab = doc.output("arraybuffer");
    return new NextResponse(ab, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
      },
    });
  }

  return NextResponse.json({ error: "format must be json|csv|xlsx|pdf" }, { status: 400 });
}
