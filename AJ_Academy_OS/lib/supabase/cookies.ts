type CookieOpts = {
  path?: string;
  sameSite?: boolean | "lax" | "strict" | "none";
  secure?: boolean;
  maxAge?: number;
  domain?: string;
  httpOnly?: boolean;
};

/** Supabase may set Secure cookies; browsers ignore those on http://localhost. */
export function applySupabaseCookieOptions(options?: CookieOpts): CookieOpts {
  const sameSite =
    options?.sameSite === false || options?.sameSite === true
      ? "lax"
      : (options?.sameSite ?? "lax");

  return {
    ...options,
    path: options?.path ?? "/",
    sameSite,
    secure: process.env.NODE_ENV === "production",
  };
}
