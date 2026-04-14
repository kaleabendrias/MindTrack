import test from "node:test";
import assert from "node:assert/strict";
import { parseUsAddress, centroidFromZip, haversineMiles } from "../../apps/backend/src/application/geo/geoUtils.js";

test("parseUsAddress extracts 5-digit ZIP from address", () => {
  assert.equal(parseUsAddress("10 Main St, New York, NY 10001").zip, "10001");
  assert.equal(parseUsAddress("200 Atlantic Ave, Boston, MA 02108").zip, "02108");
  assert.equal(parseUsAddress("500 Market St, San Francisco, CA 94103-1234").zip, "94103");
  assert.equal(parseUsAddress("no zip here").zip, "");
  assert.equal(parseUsAddress("").zip, "");
  assert.equal(parseUsAddress(null).zip, "");
});

test("centroidFromZip returns exact match for known ZIPs", () => {
  const nyc = centroidFromZip("10001");
  assert.ok(nyc);
  assert.equal(nyc.lat, 40.7506);
  assert.equal(nyc.lon, -73.9972);

  const boston = centroidFromZip("02108");
  assert.ok(boston);
  assert.equal(boston.lat, 42.3572);
});

test("centroidFromZip returns prefix fallback for nearby ZIPs", () => {
  const result = centroidFromZip("10099");
  assert.ok(result, "should fall back to a 100xx prefix match");
  assert.ok(result.lat > 40 && result.lat < 41, "should be in NYC area");

  const sfResult = centroidFromZip("94199");
  assert.ok(sfResult, "should fall back to a 941xx prefix match");
  assert.ok(sfResult.lat > 37 && sfResult.lat < 38, "should be in SF area");
});

test("centroidFromZip returns null for completely unknown areas", () => {
  assert.equal(centroidFromZip("99999"), null);
  assert.equal(centroidFromZip(""), null);
  assert.equal(centroidFromZip(null), null);
});

test("expanded ZIP coverage includes major metro areas", () => {
  const metros = ["20001", "33101", "77002", "19102", "78701"];
  for (const zip of metros) {
    const result = centroidFromZip(zip);
    assert.ok(result, `should have centroid for ${zip}`);
    assert.ok(typeof result.lat === "number");
    assert.ok(typeof result.lon === "number");
  }
});

test("haversineMiles calculates reasonable distance", () => {
  const nyc = { lat: 40.7506, lon: -73.9972 };
  const boston = { lat: 42.3572, lon: -71.0637 };
  const distance = haversineMiles(nyc, boston);
  assert.ok(distance > 180 && distance < 220, `NYC-Boston should be ~190 miles, got ${distance}`);
});

test("haversineMiles returns 0 for same point", () => {
  const point = { lat: 40.7506, lon: -73.9972 };
  assert.equal(haversineMiles(point, point), 0);
});

// ---------------------------------------------------------------------------
// parseUsAddress — street, city, and state normalization (three-part format)
// ---------------------------------------------------------------------------

test("parseUsAddress extracts street from standard three-part US address", () => {
  assert.equal(parseUsAddress("123 Main St, Springfield, IL 62701").street, "123 Main St");
  assert.equal(parseUsAddress("456 Oak Avenue, Boston, MA 02108").street, "456 Oak Avenue");
  assert.equal(parseUsAddress("PO Box 99, Anytown, PR 00901").street, "PO Box 99");
});

test("parseUsAddress normalizes street: collapses internal whitespace", () => {
  assert.equal(parseUsAddress("123  Main   St, Springfield, IL 62701").street, "123 Main St");
  assert.equal(parseUsAddress("  10 Elm Rd, Portland, OR 97201  ").street.trim(), "10 Elm Rd");
});

test("parseUsAddress extracts and title-cases city from three-part address", () => {
  assert.equal(parseUsAddress("123 Main St, SPRINGFIELD, IL 62701").city, "Springfield");
  assert.equal(parseUsAddress("456 Oak Ave, new york, NY 10001").city, "New York");
  assert.equal(parseUsAddress("789 Pine Blvd, san francisco, CA 94103").city, "San Francisco");
});

test("parseUsAddress handles city with extra whitespace", () => {
  const result = parseUsAddress("10 Main St,   Boston   , MA 02108");
  assert.equal(result.city, "Boston");
});

test("parseUsAddress extracts and upper-cases known USPS state abbreviation", () => {
  assert.equal(parseUsAddress("123 Main St, Springfield, IL 62701").state, "IL");
  assert.equal(parseUsAddress("200 Atlantic Ave, Boston, ma 02108").state, "MA");
  assert.equal(parseUsAddress("1 Infinite Loop, Cupertino, ca 95014").state, "CA");
  assert.equal(parseUsAddress("500 Congress Ave, Austin, TX 78701").state, "TX");
});

test("parseUsAddress accepts all US territory abbreviations as valid state codes", () => {
  const territories = [
    { addr: "1 Gov Road, San Juan, PR 00901", state: "PR" },
    { addr: "1 Main St, Hagatna, GU 96910", state: "GU" },
    { addr: "1 Capitol Ave, Washington, DC 20001", state: "DC" }
  ];
  for (const { addr, state } of territories) {
    assert.equal(parseUsAddress(addr).state, state, `${addr} should yield state ${state}`);
  }
});

test("parseUsAddress returns empty string for unrecognized state abbreviation", () => {
  // "XX" is not a valid USPS code.
  const result = parseUsAddress("123 Main St, Somecity, XX 99999");
  assert.equal(result.state, "");
});

test("parseUsAddress returns empty street/city/state for bare ZIP-only strings", () => {
  const result = parseUsAddress("10001");
  assert.equal(result.zip, "10001");
  assert.equal(result.street, "");
  assert.equal(result.city, "");
  assert.equal(result.state, "");
});

test("parseUsAddress returns all empty components for empty/null input", () => {
  for (const input of ["", null, undefined]) {
    const result = parseUsAddress(input);
    assert.equal(result.zip, "");
    assert.equal(result.street, "");
    assert.equal(result.city, "");
    assert.equal(result.state, "");
  }
});

test("parseUsAddress handles two-part address (street + city-state-zip)", () => {
  const result = parseUsAddress("123 Main St, Springfield IL 62701");
  assert.equal(result.zip, "62701");
  assert.equal(result.street, "123 Main St");
  assert.equal(result.state, "IL");
});

test("parseUsAddress returns all four components for a well-formed three-part address", () => {
  const r = parseUsAddress("100 Broad Street, Atlanta, GA 30301");
  assert.equal(r.zip, "30301");
  assert.equal(r.street, "100 Broad Street");
  assert.equal(r.city, "Atlanta");
  assert.equal(r.state, "GA");
});

test("parseUsAddress still extracts ZIP correctly from addresses with extended ZIP+4", () => {
  const r = parseUsAddress("500 Market St, San Francisco, CA 94103-1234");
  assert.equal(r.zip, "94103");
  assert.equal(r.state, "CA");
  assert.equal(r.city, "San Francisco");
});
