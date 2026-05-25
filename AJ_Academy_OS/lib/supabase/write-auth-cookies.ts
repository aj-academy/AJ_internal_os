import type { NextResponse } from "next/server";
import { applySupabaseCookieOptions } from "@/lib/supabase/cookies";

const MAX_CHUNK_SIZE = 3180;
const BASE64_PREFIX = "base64-";

function stringToBase64URL(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

/** Mirrors @supabase/ssr chunking so server cookies match the browser client. */
function createChunks(key: string, value: string) {
  let encodedValue = encodeURIComponent(value);
  if (encodedValue.length <= MAX_CHUNK_SIZE) {
    return [{ name: key, value }];
  }

  const chunks: string[] = [];
  while (encodedValue.length > 0) {
    let encodedChunkHead = encodedValue.slice(0, MAX_CHUNK_SIZE);
    const lastEscapePos = encodedChunkHead.lastIndexOf("%");
    if (lastEscapePos > MAX_CHUNK_SIZE - 3) {
      encodedChunkHead = encodedChunkHead.slice(0, lastEscapePos);
    }

    let valueHead = "";
    while (encodedChunkHead.length > 0) {
      try {
        valueHead = decodeURIComponent(encodedChunkHead);
        break;
      } catch (error) {
        if (
          error instanceof URIError &&
          encodedChunkHead.at(-3) === "%" &&
          encodedChunkHead.length > 3
        ) {
          encodedChunkHead = encodedChunkHead.slice(0, encodedChunkHead.length - 3);
        } else {
          throw error;
        }
      }
    }

    chunks.push(valueHead);
    encodedValue = encodedValue.slice(encodedChunkHead.length);
  }

  return chunks.map((chunk, index) => ({ name: `${key}.${index}`, value: chunk }));
}

/** Writes Supabase auth session to response cookies without calling Supabase HTTP API. */
export function writeAuthSessionCookies(
  response: NextResponse,
  projectRef: string,
  session: Record<string, unknown>,
) {
  const storageKey = `sb-${projectRef}-auth-token`;
  const encoded = BASE64_PREFIX + stringToBase64URL(JSON.stringify(session));
  const chunks = createChunks(storageKey, encoded);
  const cookieOptions = applySupabaseCookieOptions({ maxAge: 400 * 24 * 60 * 60 });

  for (const chunk of chunks) {
    response.cookies.set(chunk.name, chunk.value, cookieOptions);
  }
}

export function getSupabaseProjectRef(supabaseUrl: string) {
  try {
    const host = new URL(supabaseUrl).hostname;
    return host.split(".")[0] ?? "";
  } catch {
    return "";
  }
}
