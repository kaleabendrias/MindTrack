import { usZipCentroids } from "./usZipCentroids.js";

export function parseUsAddress(address) {
  const zipMatch = String(address || "").match(/\b(\d{5})(?:-\d{4})?\b/);
  const zip = zipMatch ? zipMatch[1] : "";
  return { zip };
}

export function centroidFromZip(zip) {
  if (!zip) {
    return null;
  }
  const exact = usZipCentroids[zip];
  if (exact) {
    return exact;
  }
  const prefix = zip.slice(0, 3);
  const prefixMatch = Object.keys(usZipCentroids).find((key) => key.startsWith(prefix));
  if (prefixMatch) {
    return usZipCentroids[prefixMatch];
  }
  return null;
}

export function haversineMiles(a, b) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return earthRadiusMiles * c;
}
