import { NextResponse, type NextRequest } from "next/server";

/**
 * Passthrough middleware — Edge-safe only.
 * Session refresh is intentionally disabled here to avoid
 * MIDDLEWARE_INVOCATION_FAILED taking down production.
 * Auth still runs in Server Components via requireRole().
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("x-ajos-pathname", request.nextUrl.pathname);
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
