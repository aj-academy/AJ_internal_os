import { NextResponse } from "next/server";
import { enforceRateLimit, verifySessionRole } from "@/lib/security";
import type { UserRole } from "@/types/profile";
import {
  NOMINATIM_ATTRIBUTION,
  asLatLng,
  geocodeCacheKey,
  type ReverseGeocodeResult,
} from "@/lib/location/reverseGeocode";

export const runtime = "nodejs";

const ATTENDANCE_ROLES = new Set<UserRole>([
  "student",
  "mentor",
  "employee",
  "freelancer",
  "admin",
  "super_admin",
]);

type CacheEntry = { at: number; result: ReverseGeocodeResult };

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

/** Global throttle for outbound Nominatim (public service: ~1 req/s). */
let lastNominatimAt = 0;
const NOMINATIM_MIN_INTERVAL_MS = 1100;

function emptyUnavailable(cached = false): ReverseGeocodeResult {
  return {
    formatted_address: null,
    locality: null,
    city: null,
    state: null,
    country: null,
    postal_code: null,
    provider: "nominatim",
    attribution: NOMINATIM_ATTRIBUTION,
    cached,
    source: "unavailable",
  };
}

type NominatimJson = {
  display_name?: string;
  address?: {
    suburb?: string;
    neighbourhood?: string;
    village?: string;
    town?: string;
    city?: string;
    city_district?: string;
    county?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
};

function mapNominatim(data: NominatimJson, cached: boolean): ReverseGeocodeResult {
  const a = data.address ?? {};
  const locality = a.suburb || a.neighbourhood || a.village || null;
  const city = a.city || a.town || a.city_district || a.county || null;
  return {
    formatted_address: data.display_name?.trim() || null,
    locality,
    city,
    state: a.state ?? null,
    country: a.country ?? null,
    postal_code: a.postcode ?? null,
    provider: "nominatim",
    attribution: NOMINATIM_ATTRIBUTION,
    cached,
    source: cached ? "cache" : "live",
  };
}

async function waitForNominatimSlot() {
  const now = Date.now();
  const wait = lastNominatimAt + NOMINATIM_MIN_INTERVAL_MS - now;
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastNominatimAt = Date.now();
}

/**
 * POST /api/location/reverse-geocode
 * Body: { latitude, longitude }
 * Auth: attendance-capable roles. Does not block attendance when lookup fails.
 */
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "location:reverse-geocode", {
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const gate = await verifySessionRole(ATTENDANCE_ROLES);
  if (gate.response) return gate.response;

  let body: { latitude?: unknown; longitude?: unknown };
  try {
    body = (await request.json()) as { latitude?: unknown; longitude?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = asLatLng(
    typeof body.latitude === "string" ? Number(body.latitude) : body.latitude,
    typeof body.longitude === "string" ? Number(body.longitude) : body.longitude,
  );
  if (!parsed) {
    return NextResponse.json({ error: "Valid latitude and longitude are required." }, { status: 400 });
  }
  const { latitude, longitude } = parsed;

  const key = geocodeCacheKey(latitude, longitude);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json({ ...hit.result, cached: true, source: "cache" satisfies ReverseGeocodeResult["source"] });
  }

  const userAgent =
    process.env.NOMINATIM_USER_AGENT?.trim() ||
    "AJ-Academy-OS/1.0 (attendance reverse-geocode; contact: ops@ajacademy.local)";

  try {
    await waitForNominatimSlot();
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": userAgent,
        Referer:
          process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
          process.env.NEXT_PUBLIC_APP_URL?.trim() ||
          "https://aj-academy.local",
      },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(emptyUnavailable(), { status: 200 });
    }

    const data = (await res.json()) as NominatimJson;
    const mapped = mapNominatim(data, false);
    cache.set(key, { at: Date.now(), result: mapped });
    return NextResponse.json(mapped);
  } catch {
    return NextResponse.json(emptyUnavailable(), { status: 200 });
  }
}
