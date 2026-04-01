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
