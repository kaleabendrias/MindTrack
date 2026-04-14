import { usZipCentroids } from "./usZipCentroids.js";

// Valid two-letter USPS state/territory abbreviations.
const US_STATE_CODES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
  "DC","AS","GU","MP","PR","VI"
]);

/**
 * Parse and normalize components of a US address string.
 *
 * Accepts common single-line formats such as:
 *   "123 Main St, Springfield, IL 62701"
 *   "123 Main St, Springfield, IL 62701-4321"
 *   "PO Box 99, Anytown, PR 00901"
 *
 * Returns an object with the following fields (empty string when a component
 * cannot be determined or fails validation):
 *   zip    — 5-digit ZIP code
 *   street — normalized street line (trimmed, collapsed internal whitespace)
 *   city   — normalized city name (trimmed, title-cased)
 *   state  — validated 2-letter USPS state/territory code (upper-cased),
 *             or "" when the code is not a recognized abbreviation
 */
export function parseUsAddress(address) {
  const raw = String(address || "");

  // --- ZIP ---
  const zipMatch = raw.match(/\b(\d{5})(?:-\d{4})?\b/);
  const zip = zipMatch ? zipMatch[1] : "";

  // --- Street, City, State ---
  // Split on commas; the last segment typically holds "STATE ZIP".
  const parts = raw.split(",").map((p) => p.trim());

  let street = "";
  let city = "";
  let state = "";

  if (parts.length >= 3) {
    // "123 Main St" | "Springfield" | "IL 62701[-4321]"
    street = normalizeStreet(parts[0]);
    city = normalizeCity(parts[1]);
    state = extractState(parts[parts.length - 1]);
  } else if (parts.length === 2) {
    // "123 Main St" | "Springfield IL 62701"
    street = normalizeStreet(parts[0]);
    const tail = parts[1];
    const stateFromTail = extractState(tail);
    if (stateFromTail) {
      state = stateFromTail;
      // City is whatever is left after removing "STATE ZIP" from tail.
      city = normalizeCity(tail.replace(/\b[A-Z]{2}\b.*$/, ""));
    } else {
      city = normalizeCity(tail);
    }
  }

  return { zip, street, city, state };
}

function normalizeStreet(raw) {
  return raw.replace(/\s+/g, " ").trim();
}

function normalizeCity(raw) {
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function extractState(segment) {
  // Look for a standalone 2-letter uppercase sequence (optionally followed by
  // the ZIP code portion) anywhere in the segment.
  const match = segment.match(/\b([A-Za-z]{2})\b/);
  if (!match) return "";
  const candidate = match[1].toUpperCase();
  return US_STATE_CODES.has(candidate) ? candidate : "";
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
