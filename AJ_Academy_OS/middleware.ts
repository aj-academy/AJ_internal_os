import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Login must render immediately (no session refresh — was causing white screen / minute-long waits).
  if (pathname === "/login" || pathname.startsWith("/login/")) {
    return NextResponse.next();
  }

  const response = await updateSession(request);
  // Let requireRole() rebuild /login?redirect=… after notification clicks while logged out.
  response.headers.set("x-ajos-pathname", pathname);
  return response;
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
