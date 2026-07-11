import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffApiSession } from "@/lib/security";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;

  const { id } = await context.params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("college_visit_activities")
    .select("id,college_visit_id,activity_type,notes,old_value,new_value,created_by,created_at")
    .eq("college_visit_id", id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ activities: data ?? [] });
}

export async function POST(request: Request, context: RouteContext) {
  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const activity_type = typeof record.activity_type === "string" ? record.activity_type.trim() : "Note";
  const notes = typeof record.notes === "string" ? record.notes.trim() : "";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("college_visit_activities")
    .insert({
      college_visit_id: id,
      activity_type,
      notes: notes || null,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ activity: data });
}
