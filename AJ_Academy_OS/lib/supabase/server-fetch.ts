/**
 * Windows dev often fails Supabase HTTPS with UNABLE_TO_VERIFY_LEAF_SIGNATURE.
 * Browser login still works; only Node server-side fetch is affected.
 * Set SUPABASE_DEV_INSECURE_SSL=0 in .env.local to disable this bypass.
 */
export function createSupabaseServerFetch(): typeof fetch | undefined {
  if (process.env.NODE_ENV !== "development") return undefined;
  if (process.env.SUPABASE_DEV_INSECURE_SSL === "0") return undefined;

  try {
    // Node bundles undici; dynamic require avoids adding a dependency.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const undici = require("undici") as {
      Agent: new (options: { connect: { rejectUnauthorized: boolean } }) => unknown;
      fetch: (
        input: RequestInfo | URL,
        init?: RequestInit & { dispatcher?: unknown },
      ) => Promise<Response>;
    };
    const agent = new undici.Agent({ connect: { rejectUnauthorized: false } });
    return (input, init) => undici.fetch(input, { ...init, dispatcher: agent });
  } catch {
    return undefined;
  }
}
