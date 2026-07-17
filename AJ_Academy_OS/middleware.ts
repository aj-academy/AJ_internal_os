import { NextResponse, type NextRequest } from "next/server";

/**
 * Keep middleware Edge-safe and minimal.
 * Do not import firebase-admin, Node crypto, or heavy SDKs here.
 * Session refresh stays best-effort and must never take down the site.
 */
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Login must render immediately (no session work).
  if (pathname === "/login" || pathname.startsWith("/login/")) {
    const res = NextResponse.next();
    res.headers.set("x-ajos-pathname", pathname);
    return res;
  }

  try {
    const { updateSession } = await import("@/lib/supabase/middleware");
    const response = await updateSession(request);
    response.headers.set("x-ajos-pathname", pathname);
    return response;
  } catch {
    // If Edge session refresh fails, still allow the page through.
    const res = NextResponse.next();
    res.headers.set("x-ajos-pathname", pathname);
    return res;
  }
}

export const config = {
  matcher: [
    "/login",
    "/admin/:path*",
    "/student/:path*",
    "/freelancer/:path*",
    "/mentor/:path*",
    "/employee/:path*",
  ],
};
