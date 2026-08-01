import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { UserRole } from "@/types/profile";

export const runtime = "nodejs";

const SENSITIVE = new Set(["harassment_sensitive", "faculty_concern"]);

export async function GET() {
  const gate = await verifySessionRole(
    new Set<UserRole>(["student", "mentor", "admin", "super_admin"]),
  );
  if (gate.response) return gate.response;

  const supabase = await createClient();
  const role = String(gate.profile?.role || "").toLowerCase();

  let query = supabase.from("lms_student_tickets").select("*").order("created_at", { ascending: false }).limit(300);

  if (role === "student") {
    query = query.eq("student_id", gate.user!.id);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: error.message, hint: "Run AJ_Academy_SB/lms_tickets.sql after lms_projects.sql and lms_study_materials.sql." },
      { status: 500 },
    );
  }
  return NextResponse.json({ tickets: data ?? [] });
}

export async function POST(request: Request) {
  const gate = await verifySessionRole(new Set<UserRole>(["student", "admin", "super_admin"]));
  if (gate.response || !gate.user) return gate.response!;

  const body = (await request.json().catch(() => ({}))) as {
    category?: string;
    subcategory?: string;
    subject?: string;
    description?: string;
    priority?: string;
    department_id?: string | null;
    course_id?: string | null;
    anonymous_to_mentor?: boolean;
  };

  const subject = String(body.subject || "").trim();
  const description = String(body.description || "").trim();
  const category = String(body.category || "other").trim();
  if (!subject || !description) {
    return NextResponse.json({ error: "Subject and description are required." }, { status: 400 });
  }

  const isSensitive = SENSITIVE.has(category) || category === "harassment_sensitive";
  const supabase = await createClient();

  const { data: ticketNumber, error: numError } = await supabase.rpc("lms_next_ticket_number");
  if (numError) {
    return NextResponse.json({ error: numError.message }, { status: 500 });
  }

  const studentId =
    String(gate.profile?.role || "").toLowerCase() === "student" ? gate.user.id : gate.user.id;

  const { data, error } = await supabase
    .from("lms_student_tickets")
    .insert({
      ticket_number: ticketNumber,
      student_id: studentId,
      category,
      subcategory: body.subcategory?.trim() || null,
      subject,
      description,
      priority: body.priority || "medium",
      department_id: body.department_id || null,
      course_id: body.course_id || null,
      is_confidential: isSensitive,
      is_sensitive: isSensitive,
      anonymous_to_mentor: Boolean(body.anonymous_to_mentor) || isSensitive,
      status: "open",
      created_by: gate.user.id,
      updated_by: gate.user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("lms_ticket_messages").insert({
    ticket_id: data.id,
    author_id: gate.user.id,
    body: description,
    is_internal_note: false,
  });

  return NextResponse.json({ ticket: data }, { status: 201 });
}
