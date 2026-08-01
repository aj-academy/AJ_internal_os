import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { UserRole } from "@/types/profile";

export const runtime = "nodejs";

export async function GET() {
  const gate = await verifySessionRole(new Set<UserRole>(["student"]));
  if (gate.response) return gate.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lms_proctoring_policies")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message, hint: "Run AJ_Academy_SB/lms_submissions_proctoring.sql." },
      { status: 500 },
    );
  }
  return NextResponse.json({ policy: data });
}

export async function POST(request: Request) {
  const gate = await verifySessionRole(new Set<UserRole>(["student"]));
  if (gate.response) return gate.response;

  const body = (await request.json().catch(() => ({}))) as {
    test_id?: string;
    policy_version?: string;
    attempt_id?: string;
    event_type?: string;
    severity?: string;
    browser_state?: Record<string, unknown>;
    action?: "consent" | "event";
  };

  const supabase = await createClient();

  if (body.action === "consent") {
    if (!body.test_id || !body.policy_version) {
      return NextResponse.json({ error: "test_id and policy_version required." }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("lms_record_proctoring_consent", {
      p_test_id: body.test_id,
      p_policy_version: body.policy_version,
      p_client_meta: {
        userAgent: typeof body.browser_state?.userAgent === "string" ? body.browser_state.userAgent : null,
      },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ consentId: data });
  }

  if (!body.attempt_id || !body.event_type) {
    return NextResponse.json({ error: "attempt_id and event_type required." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("lms_log_proctoring_event", {
    p_attempt_id: body.attempt_id,
    p_event_type: body.event_type,
    p_severity: body.severity || "warn",
    p_browser_state: body.browser_state ?? {},
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ eventId: data });
}
