import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffApiSession } from "@/lib/security";
import { actorCanAccessCollegeVisit } from "@/lib/college-visits/access";
import { COLLEGE_FILE_VISIBILITY, isAdminRole } from "@/lib/college-visits/fileVisibility";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { response, user, profile } = await requireStaffApiSession();
  if (response || !user) return response!;

  const { id } = await context.params;
  const admin = createAdminClient();
  const isAdmin = isAdminRole(profile?.role);
  const allowed = await actorCanAccessCollegeVisit(admin, user.id, isAdmin, id);
  if (!allowed) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let query = admin
    .from("college_visit_activities")
    .select("id,college_visit_id,activity_type,notes,old_value,new_value,created_by,created_at")
    .eq("college_visit_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (!isAdmin) {
    query = query.eq("visibility_scope", COLLEGE_FILE_VISIBILITY.ADMIN_EMPLOYEE);
  }
  const { data, error } = await query;

  if (error && error.message.toLowerCase().includes("visibility_scope")) {
    const retry = await admin
      .from("college_visit_activities")
      .select("id,college_visit_id,activity_type,notes,old_value,new_value,created_by,created_at")
      .eq("college_visit_id", id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 400 });
    return NextResponse.json({ activities: retry.data ?? [] });
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ activities: data ?? [] });
}

export async function POST(request: Request, context: RouteContext) {
  const { response, user, profile } = await requireStaffApiSession();
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

  const admin = createAdminClient();
  const isAdmin = isAdminRole(profile?.role);
  const allowed = await actorCanAccessCollegeVisit(admin, user.id, isAdmin, id);
  if (!allowed) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { data, error } = await admin
    .from("college_visit_activities")
    .insert({
      college_visit_id: id,
      activity_type,
      notes: notes || null,
      created_by: user.id,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not save activity." }, { status: 400 });
  }
  return NextResponse.json({ activity: data });
}
