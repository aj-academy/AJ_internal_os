import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { UserRole } from "@/types/profile";

export const runtime = "nodejs";

const STAFF = new Set<UserRole>(["mentor", "admin", "super_admin"]);

export async function GET() {
  const gate = await verifySessionRole(new Set<UserRole>(["mentor", "admin", "super_admin", "student"]));
  if (gate.response) return gate.response;
  const supabase = await createClient();
  const role = String(gate.profile?.role || "").toLowerCase();

  if (role === "student") {
    const { data, error } = await supabase
      .from("lms_test_recipients")
      .select("*, lms_tests(*)")
      .eq("student_id", gate.user!.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      return NextResponse.json(
        { error: error.message, hint: "Run AJ_Academy_SB/lms_07_tests_core.sql." },
        { status: 500 },
      );
    }
    return NextResponse.json({
      items: (data ?? []).map((r) => ({
        recipient: { id: r.id, status: r.status, attempts_used: r.attempts_used, test_id: r.test_id },
        test: r.lms_tests,
      })),
    });
  }

  const { data, error } = await supabase.from("lms_tests").select("*").order("updated_at", { ascending: false }).limit(500);
  if (error) {
    return NextResponse.json(
      { error: error.message, hint: "Run AJ_Academy_SB/lms_07_tests_core.sql." },
      { status: 500 },
    );
  }
  return NextResponse.json({ tests: data ?? [] });
}

export async function POST(request: Request) {
  const gate = await verifySessionRole(STAFF);
  if (gate.response || !gate.user) return gate.response!;

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    description?: string;
    instructions?: string;
    department_id?: string;
    course_id?: string | null;
    batch_id?: string | null;
    duration_minutes?: number;
    max_attempts?: number;
    passing_marks?: number;
    tab_switch_policy?: string;
    camera_required?: boolean;
    security_mode?: string;
    questions?: {
      question: string;
      question_type?: string;
      options?: string[];
      correct_index?: number;
      marks?: number;
    }[];
    student_ids?: string[];
    publish?: boolean;
  };

  const title = String(body.title || "").trim();
  const departmentId = String(body.department_id || "").trim();
  if (!title || !departmentId) {
    return NextResponse.json({ error: "Title and department are required." }, { status: 400 });
  }
  if (!body.questions?.length) {
    return NextResponse.json({ error: "Add at least one question." }, { status: 400 });
  }

  const supabase = await createClient();
  const role = String(gate.profile?.role || "").toLowerCase();
  if (role === "mentor") {
    const { data: allowed } = await supabase.rpc("lms_mentor_has_active_allocation", {
      p_mentor_id: gate.user.id,
      p_department_id: departmentId,
      p_course_id: body.course_id || null,
      p_batch_id: body.batch_id || null,
      p_module_id: null,
    });
    if (!allowed) {
      return NextResponse.json({ error: "No active mentor allocation for this scope." }, { status: 403 });
    }
  }

  const { data: test, error } = await supabase
    .from("lms_tests")
    .insert({
      title,
      description: body.description?.trim() || null,
      instructions: body.instructions?.trim() || null,
      department_id: departmentId,
      course_id: body.course_id || null,
      batch_id: body.batch_id || null,
      duration_minutes: body.duration_minutes ?? 30,
      max_attempts: body.max_attempts ?? 1,
      passing_marks: body.passing_marks ?? 40,
      tab_switch_policy: body.tab_switch_policy || "warn",
      camera_required: Boolean(body.camera_required),
      security_mode: body.security_mode || "normal",
      status: "draft",
      audience_type: body.student_ids?.length ? "selected_students" : "department",
      assigned_by: gate.user.id,
      created_by: gate.user.id,
      updated_by: gate.user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const questionRows = body.questions.map((q, idx) => {
    const options = (q.options || []).map((label, i) => ({ id: String(i), label }));
    const correct =
      q.correct_index != null && q.correct_index >= 0
        ? JSON.stringify(String(q.correct_index))
        : null;
    return {
      test_id: test.id,
      question: q.question,
      question_type: q.question_type || "single_mcq",
      options,
      correct_answer: correct ? JSON.parse(correct) : null,
      marks: q.marks ?? 1,
      sort_order: (idx + 1) * 10,
    };
  });

  // Store correct answer as the option id string matching correct_index
  const normalized = questionRows.map((q, idx) => ({
    ...q,
    correct_answer: body.questions![idx].correct_index != null ? String(body.questions![idx].correct_index) : null,
  }));

  const { error: qError } = await supabase.from("lms_test_questions").insert(normalized);
  if (qError) {
    return NextResponse.json({ error: qError.message, test }, { status: 500 });
  }

  if (body.publish) {
    const { data: pub, error: pubError } = await supabase.rpc("lms_publish_test", {
      p_test_id: test.id,
      p_student_ids: body.student_ids?.length ? body.student_ids : null,
      p_idempotency_key: `publish-test-${test.id}`,
    });
    if (pubError) {
      return NextResponse.json({ error: pubError.message, test, published: false }, { status: 500 });
    }
    const { data: refreshed } = await supabase.from("lms_tests").select("*").eq("id", test.id).single();
    return NextResponse.json({ test: refreshed ?? test, publish: pub }, { status: 201 });
  }

  return NextResponse.json({ test }, { status: 201 });
}
