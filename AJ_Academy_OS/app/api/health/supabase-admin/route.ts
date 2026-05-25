import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Verifies server-side Supabase Admin API (service role) over HTTPS. */
export async function GET() {
  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 503 },
      );
    }
    return NextResponse.json({
      ok: true,
      hint: "Server can reach Supabase Auth. Create Employee should work after restarting dev if you just pulled TLS fixes.",
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
