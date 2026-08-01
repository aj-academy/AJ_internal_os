import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { UserRole } from "@/types/profile";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const gate = await verifySessionRole(
    new Set<UserRole>(["student", "mentor", "admin", "super_admin"]),
  );
  if (gate.response || !gate.user) return gate.response!;

  const supabase = await createClient();
  const role = String(gate.profile?.role || "").toLowerCase();
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  let query = supabase
    .from("lms_academic_events")
    .select("*")
    .order("starts_at", { ascending: true })
    .limit(200);

  if (from) query = query.gte("starts_at", from);
  if (to) query = query.lte("starts_at", to);

  const { data: events, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: error.message, hint: "Run AJ_Academy_SB/lms_10_calendar_reports.sql." },
      { status: 500 },
    );
  }

  let summary: unknown = null;
  if (role !== "student") {
    const { data, error: summaryError } = await supabase.rpc("lms_report_summary");
    if (summaryError) {
      return NextResponse.json(
        {
          events: events ?? [],
          summary: null,
          warning: summaryError.message,
          hint: "Run AJ_Academy_SB/lms_10_calendar_reports.sql.",
        },
        { status: 200 },
      );
    }
    summary = data;
  }

  return NextResponse.json({ events: events ?? [], summary });
}

export async function POST(request: Request) {
  const gate = await verifySessionRole(new Set<UserRole>(["mentor", "admin", "super_admin"]));
  if (gate.response || !gate.user) return gate.response!;

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    description?: string;
    event_type?: string;
    starts_at?: string;
    ends_at?: string | null;
    all_day?: boolean;
    department_id?: string | null;
    course_id?: string | null;
    batch_id?: string | null;
    visibility?: string;
  };

  const title = String(body.title || "").trim();
  const startsAt = String(body.starts_at || "").trim();
  if (!title || !startsAt) {
    return NextResponse.json({ error: "title and starts_at are required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lms_academic_events")
    .insert({
      title,
      description: body.description?.trim() || null,
      event_type: body.event_type || "general",
      starts_at: startsAt,
      ends_at: body.ends_at || null,
      all_day: Boolean(body.all_day),
      department_id: body.department_id || null,
      course_id: body.course_id || null,
      batch_id: body.batch_id || null,
      visibility: body.visibility || "scoped",
      created_by: gate.user.id,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message, hint: "Run AJ_Academy_SB/lms_10_calendar_reports.sql." },
      { status: 500 },
    );
  }
  return NextResponse.json({ event: data }, { status: 201 });
}
