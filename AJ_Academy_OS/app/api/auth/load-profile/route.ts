import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClientWithAccessToken } from "@/lib/supabase/access-token-client";
import { lookupProfileByUser } from "@/lib/auth/lookupProfile";
import { enforceRateLimit } from "@/lib/security";

type LoadProfileBody = {
  userId?: string;
  email?: string;
  accessToken?: string;
};

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "auth:load-profile", {
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: LoadProfileBody;
  try {
    body = (await request.json()) as LoadProfileBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const accessToken =
    typeof body.accessToken === "string" ? body.accessToken.trim() : "";

  try {
    if (accessToken) {
      const tokenClient = createClientWithAccessToken(accessToken);
      const { data: userData, error: userError } = await tokenClient.auth.getUser(accessToken);
      if (userError || !userData.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const lookup = await lookupProfileByUser(tokenClient, {
        id: userData.user.id,
        email: (userData.user.email ?? body.email ?? "").trim().toLowerCase(),
      });

      if (lookup.error) {
        return NextResponse.json(
          { error: "Profile lookup failed", detail: lookup.error },
          { status: 503 },
        );
      }

      if (lookup.profile) {
        return NextResponse.json({ profile: lookup.profile });
      }

      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: sessionError,
    } = await supabase.auth.getUser();

    if (sessionError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const lookup = await lookupProfileByUser(supabase, {
      id: user.id,
      email: (user.email ?? body.email ?? "").trim().toLowerCase(),
    });

    if (lookup.error) {
      return NextResponse.json(
        { error: "Profile lookup failed", detail: lookup.error },
        { status: 503 },
      );
    }

    if (lookup.profile) {
      return NextResponse.json({ profile: lookup.profile });
    }

    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Server error";
    return NextResponse.json({ error: "Profile lookup failed", detail: message }, { status: 503 });
  }
}
