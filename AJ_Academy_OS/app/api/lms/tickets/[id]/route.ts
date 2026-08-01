import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { UserRole } from "@/types/profile";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const gate = await verifySessionRole(
    new Set<UserRole>(["student", "mentor", "admin", "super_admin"]),
  );
  if (gate.response) return gate.response;

  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: ticket, error } = await supabase.from("lms_student_tickets").select("*").eq("id", id).maybeSingle();
  if (error || !ticket) {
    return NextResponse.json({ error: error?.message || "Ticket not found." }, { status: error ? 500 : 404 });
  }

  const { data: messages, error: msgError } = await supabase
    .from("lms_ticket_messages")
    .select("*")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });

  if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 });
  return NextResponse.json({ ticket, messages: messages ?? [] });
}

export async function POST(request: Request, ctx: Ctx) {
  const gate = await verifySessionRole(
    new Set<UserRole>(["student", "mentor", "admin", "super_admin"]),
  );
  if (gate.response || !gate.user) return gate.response!;

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    body?: string;
    is_internal_note?: boolean;
    status?: string;
  };

  const text = String(body.body || "").trim();
  if (!text) return NextResponse.json({ error: "Message body is required." }, { status: 400 });

  const supabase = await createClient();
  const role = String(gate.profile?.role || "").toLowerCase();

  const { data: message, error } = await supabase
    .from("lms_ticket_messages")
    .insert({
      ticket_id: id,
      author_id: gate.user.id,
      body: text,
      is_internal_note: Boolean(body.is_internal_note) && role !== "student",
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const patch: Record<string, unknown> = {
    updated_by: gate.user.id,
    first_response_at: role !== "student" ? new Date().toISOString() : undefined,
  };
  if (body.status) patch.status = body.status;
  if (role !== "student" && !body.status) patch.status = "in_review";

  // Clear undefined keys
  Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);

  await supabase.from("lms_student_tickets").update(patch).eq("id", id);

  return NextResponse.json({ message });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const gate = await verifySessionRole(new Set<UserRole>(["mentor", "admin", "super_admin", "student"]));
  if (gate.response || !gate.user) return gate.response!;

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    status?: string;
    assigned_to?: string | null;
    satisfaction_rating?: number;
  };

  const supabase = await createClient();
  const role = String(gate.profile?.role || "").toLowerCase();
  const patch: Record<string, unknown> = { updated_by: gate.user.id };

  if (body.status) {
    patch.status = body.status;
    if (["resolved", "closed"].includes(body.status)) {
      patch.resolution_at = new Date().toISOString();
    }
  }
  if (body.assigned_to !== undefined && role !== "student") {
    patch.assigned_to = body.assigned_to;
    if (body.assigned_to) patch.status = patch.status || "assigned";
  }
  if (body.satisfaction_rating != null && role === "student") {
    patch.satisfaction_rating = body.satisfaction_rating;
  }

  const { data, error } = await supabase.from("lms_student_tickets").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ticket: data });
}
