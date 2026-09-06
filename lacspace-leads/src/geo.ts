/**
 * Geo helpers for radius search — parse a coordinate/radius, measure distance
 * (haversine), and pick a Maps zoom that frames a radius. All pure, unit-tested.
 */

/** A latitude/longitude point. */
export interface LatLng {
  lat: number;
  lng: number;
}

const R_EARTH_M = 6_371_008.8; // mean Earth radius, metres
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance between two points, in metres. Pure. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Parse a `"lat,lng"` pair (also accepts a bare `@lat,lng` or whitespace).
 * Returns `undefined` if it isn't two in-range numbers. Pure.
 */
export function parseLatLngPair(input: string | undefined): LatLng | undefined {
  if (!input) return undefined;
  const m = input.replace(/^@/, "").match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return undefined;
  const lat = parseFloat(m[1]!);
  const lng = parseFloat(m[2]!);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;
  return { lat, lng };
}

/**
 * Parse a distance like `"2km"`, `"500m"`, `"1.5mi"` (or a bare number = metres)
 * into metres. Returns `undefined` for junk or non-positive values. Pure.
 */
export function parseDistance(input: string | undefined): number | undefined {
  if (!input) return undefined;
  const m = input.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(km|m|mi|mile|miles|meters?|metres?)?$/);
  if (!m) return undefined;
  const value = parseFloat(m[1]!);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const unit = m[2] ?? "m";
  const metres =
    unit === "km" ? value * 1000 :
    unit.startsWith("mi") ? value * 1609.344 :
    value; // m / meter(s) / metre(s)
  return metres;
}

/**
 * A Google Maps zoom level (integer) that roughly frames a circle of `radiusM`
 * at a given latitude in the map viewport. Clamped to 3–19. Pure/best-effort —
 * Maps re-fits results anyway; this just centres the search sensibly.
 */
export function zoomForRadius(radiusM: number, lat = 0): number {
  // metresPerPixel = 156543.03 * cos(lat) / 2^zoom ; aim for the diameter to
  // span ~600px of map, so mpp = (2*radius)/600.
  const mpp = (2 * Math.max(50, radiusM)) / 600;
  const zoom = Math.log2((156543.03392 * Math.cos(toRad(lat))) / mpp);
  return Math.max(3, Math.min(19, Math.round(zoom)));
}
