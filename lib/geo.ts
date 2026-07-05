export const CLOCKOUT_GEOFENCE_MILES = 15;

// Distance (miles) from a point to the closest point on the pickup->dropoff
// line segment. Mirrors the server clock-in geofence math (equirectangular
// projection, accurate for short-haul distances). Returns null if any coord
// is missing/zero so we never render a bogus warning or fire a false alert.
export function pointToRouteMiles(
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): number | null {
  if (!pLat || !pLng) return null;
  const haveA = !!aLat && !!aLng;
  const haveB = !!bLat && !!bLng;
  if (!haveA && !haveB) return null;
  const meanLatRad = ((aLat || bLat) * Math.PI) / 180;
  const mpdLat = 69.0;
  const mpdLng = 69.0 * Math.cos(meanLatRad);
  const px = pLng * mpdLng, py = pLat * mpdLat;
  const dist = (x1: number, y1: number, x2: number, y2: number) =>
    Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
  // Only one endpoint known -> point-to-point distance.
  if (!haveA || !haveB) {
    const oLat = haveA ? aLat : bLat, oLng = haveA ? aLng : bLng;
    return dist(px, py, oLng * mpdLng, oLat * mpdLat);
  }
  const ax = aLng * mpdLng, ay = aLat * mpdLat;
  const bx = bLng * mpdLng, by = bLat * mpdLat;
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(px, py, ax, ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return dist(px, py, ax + t * dx, ay + t * dy);
}
