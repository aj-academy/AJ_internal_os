import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClientWithAccessToken } from "@/lib/supabase/access-token-client";
import { lookupProfileByUser } from "@/lib/auth/lookupProfile";

type LoadProfileBody = {
  userId?: string;
  email?: string;
  accessToken?: string;
};

export async function POST(request: Request) {
  let body: LoadProfileBody;
  try {
    body = (await request.json()) as LoadProfileBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const accessToken =
    typeof body.accessToken === "string" ? body.accessToken.trim() : "";
  const bodyUserId = typeof body.userId === "string" ? body.userId.trim() : "";
  const bodyEmail =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  let authUserId = bodyUserId;
  let authEmail = bodyEmail;

  try {
    if (accessToken) {
      const tokenClient = createClientWithAccessToken(accessToken);
      const { data: userData, error: userError } = await tokenClient.auth.getUser(accessToken);
      if (userError || !userData.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      authUserId = userData.user.id;
      authEmail = (userData.user.email ?? bodyEmail).trim().toLowerCase();

      const lookup = await lookupProfileByUser(tokenClient, {
        id: authUserId,
        email: authEmail,
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
    } else {
      const supabase = await createClient();
      const {
        data: { user },
        error: sessionError,
      } = await supabase.auth.getUser();

      if (sessionError || !user) {
        if (!bodyUserId) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
      } else {
        authUserId = user.id;
        authEmail = (user.email ?? bodyEmail).trim().toLowerCase();
      }

      if (authUserId) {
        const lookup = await lookupProfileByUser(supabase, {
          id: authUserId,
          email: authEmail,
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
      }
    }

    // Cookie/token path missed — service role fallback (same project, no duplicate rows)
    if (authUserId) {
      try {
        const admin = createAdminClient();
        const lookup = await lookupProfileByUser(admin, {
          id: authUserId,
          email: authEmail,
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
      } catch (adminError) {
        const message =
          adminError instanceof Error ? adminError.message : "Admin client unavailable";
        if (process.env.NODE_ENV !== "production") {
          console.warn("[load-profile] admin fallback skipped:", message);
        }
      }
    }

    if (process.env.NODE_ENV !== "production") {
      const cookieStore = await cookies();
      console.log("[load-profile] no profile", {
        authUserId,
        authEmail,
        hasAccessToken: Boolean(accessToken),
        cookieCount: cookieStore.getAll().length,
      });
    }

    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Server error";
    return NextResponse.json({ error: "Profile lookup failed", detail: message }, { status: 503 });
  }
}
