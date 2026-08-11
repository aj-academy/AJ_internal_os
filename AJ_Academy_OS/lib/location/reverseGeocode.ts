/** Shared reverse-geocode helpers (server + client types). */

export type ReverseGeocodeResult = {
  formatted_address: string | null;
  locality: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  provider: "nominatim";
  attribution: string;
  cached: boolean;
  source: "live" | "cache" | "unavailable";
};

export const NOMINATIM_ATTRIBUTION =
  "© OpenStreetMap contributors (Nominatim). Location names courtesy of OpenStreetMap.";

/** Round coords for cache keys (~11 m at equator for 4 decimal places). */
export function roundCoordForCache(value: number, decimals = 4): string {
  const f = 10 ** decimals;
  return (Math.round(value * f) / f).toFixed(decimals);
}

export function geocodeCacheKey(latitude: number, longitude: number): string {
  return `${roundCoordForCache(latitude)},${roundCoordForCache(longitude)}`;
}

export function isValidLatLng(
  latitude: unknown,
  longitude: unknown,
): latitude is number {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/** After isValidLatLng succeeds, cast pair safely. */
export function asLatLng(latitude: unknown, longitude: unknown): { latitude: number; longitude: number } | null {
  if (!isValidLatLng(latitude, longitude)) return null;
  return { latitude, longitude: longitude as number };
}
