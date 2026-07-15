import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffApiSession } from "@/lib/security";

export async function POST(request: Request) {
  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;
  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string }; userAgent?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const endpoint = String(body.endpoint ?? "");
  const p256dh = String(body.keys?.p256dh ?? "");
  const auth = String(body.keys?.auth ?? "");
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }
  const supabase = await createClient();
  const { error } = await supabase.from("aj_reminder_push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: body.userAgent ?? null,
      is_active: true,
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    return NextResponse.json(
      {
        error: /aj_reminder_push|does not exist|schema cache/i.test(error.message)
          ? "Run AJ_Academy_SB/aj_reminders_schema.sql first."
          : error.message,
      },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;
  let body: { endpoint?: string };
  try {
    body = (await request.json()) as { endpoint?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const endpoint = String(body.endpoint ?? "");
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  const supabase = await createClient();
  await supabase
    .from("aj_reminder_push_subscriptions")
    .update({ is_active: false })
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
