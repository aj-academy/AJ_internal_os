import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffApiSession } from "@/lib/security";

/** Read-only related-record search — does not update CRM rows. */
export async function GET(request: Request) {
  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;

  const url = new URL(request.url);
  const moduleName = url.searchParams.get("module") || "";
  const q = (url.searchParams.get("q") || "").trim();
  const supabase = await createClient();

  if (moduleName === "Student Master") {
    let query = supabase.from("clients").select("id,lead_name,name,phone").limit(25);
    if (q) query = query.or(`lead_name.ilike.%${q}%,name.ilike.%${q}%,phone.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ items: [], error: error.message });
    return NextResponse.json({
      items: (data ?? []).map((r) => ({
        id: r.id as string,
        label: String(r.lead_name || r.name || r.id).trim(),
      })),
    });
  }

  if (moduleName === "College Visits") {
    let query = supabase.from("college_visits").select("id,college_name,location").limit(25);
    if (q) query = query.or(`college_name.ilike.%${q}%,location.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ items: [], error: error.message });
    return NextResponse.json({
      items: (data ?? []).map((r) => ({
        id: r.id as string,
        label: [r.college_name, r.location].filter(Boolean).join(" · "),
      })),
    });
  }

  if (moduleName === "Project Master") {
    let query = supabase.from("projects").select("id,project_name,project_code").limit(25);
    if (q) query = query.or(`project_name.ilike.%${q}%,project_code.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ items: [], error: error.message });
    return NextResponse.json({
      items: (data ?? []).map((r) => ({
        id: r.id as string,
        label: [r.project_code, r.project_name].filter(Boolean).join(" · "),
      })),
    });
  }

  if (moduleName === "Employee/User Master") {
    let query = supabase
      .from("profiles")
      .select("id,full_name,email")
      .in("role", ["employee", "admin", "super_admin"])
      .limit(25);
    if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ items: [], error: error.message });
    return NextResponse.json({
      items: (data ?? []).map((r) => ({
        id: r.id as string,
        label: String(r.full_name || r.email || r.id),
      })),
    });
  }

  if (moduleName === "Task Assignment") {
    let query = supabase.from("tasks").select("id,title").order("updated_at", { ascending: false }).limit(25);
    if (q) query = query.ilike("title", `%${q}%`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ items: [], error: error.message });
    return NextResponse.json({
      items: (data ?? []).map((r) => ({
        id: r.id as string,
        label: String(r.title || r.id),
      })),
    });
  }

  return NextResponse.json({ items: [] });
}
