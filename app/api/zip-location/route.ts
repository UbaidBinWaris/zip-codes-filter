import { NextRequest, NextResponse } from "next/server";
import type { ZipLocation } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: ZipLocation;
  expiresAt: number;
}

interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GoogleGeocodeResult {
  address_components: GoogleAddressComponent[];
}

interface GoogleGeocodeResponse {
  status: string;
  results: GoogleGeocodeResult[];
}

// ---------------------------------------------------------------------------
// Module-level state
// Persists across requests within the same server process / warm lambda.
// ---------------------------------------------------------------------------

/** Resolved ZIP → location, with TTL. */
const locationCache = new Map<string, CacheEntry>();

/**
 * In-flight promises — deduplicates concurrent requests for the same ZIP so
 * that N simultaneous callers only ever trigger one Google API call.
 */
const inFlight = new Map<string, Promise<ZipLocation>>();

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const UNKNOWN: ZipLocation = { city: "Unknown", state: "Unknown" };

// ---------------------------------------------------------------------------
// Google Geocoding API call
// ---------------------------------------------------------------------------

async function fetchFromGoogle(zip: string): Promise<ZipLocation> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn("[zip-location] GOOGLE_MAPS_API_KEY is not set");
    return UNKNOWN;
  }

  let response: Response;
  try {
    response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(zip)}&key=${apiKey}`,
      // Disable Next.js fetch cache — caching is handled in-process above.
      { cache: "no-store" }
    );
  } catch (err) {
    console.error("[zip-location] Network error fetching geocode:", err);
    return UNKNOWN;
  }

  if (!response.ok) {
    console.error("[zip-location] Google API HTTP error:", response.status);
    return UNKNOWN;
  }

  let json: GoogleGeocodeResponse;
  try {
    json = await response.json();
  } catch {
    return UNKNOWN;
  }

  if (json.status !== "OK" || !json.results?.length) {
    // ZERO_RESULTS is a normal outcome for invalid ZIPs — not an error.
    return UNKNOWN;
  }

  let city = "Unknown";
  let state = "Unknown";

  for (const component of json.results[0].address_components) {
    if (component.types.includes("locality")) {
      city = component.long_name;
    }
    if (component.types.includes("administrative_area_level_1")) {
      // short_name gives "PA" instead of "Pennsylvania"
      state = component.short_name;
    }
  }

  return { city, state };
}

// ---------------------------------------------------------------------------
// Cache-aware lookup
// ---------------------------------------------------------------------------

function getFromCache(zip: string): ZipLocation | null {
  const entry = locationCache.get(zip);
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  if (entry) locationCache.delete(zip); // evict stale entry
  return null;
}

function storeInCache(zip: string, data: ZipLocation): void {
  locationCache.set(zip, { data, expiresAt: Date.now() + TTL_MS });
}

async function getLocation(zip: string): Promise<ZipLocation> {
  // 1. TTL cache hit
  const cached = getFromCache(zip);
  if (cached) return cached;

  // 2. Deduplicate in-flight requests
  const existing = inFlight.get(zip);
  if (existing) return existing;

  // 3. New fetch
  const promise = fetchFromGoogle(zip)
    .then((data) => {
      storeInCache(zip, data);
      return data;
    })
    .finally(() => {
      inFlight.delete(zip);
    });

  inFlight.set(zip, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/** Matches standard 3–10 digit ZIP / postal code strings. Leading zeros are preserved. */
const ZIP_PATTERN = /^\d{3,10}$/;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const zip = request.nextUrl.searchParams.get("zip")?.trim() ?? "";

  if (!ZIP_PATTERN.test(zip)) {
    return NextResponse.json(
      { error: "Invalid ZIP code. Must be 3–10 digits." },
      { status: 400 }
    );
  }

  const location = await getLocation(zip);

  return NextResponse.json(location, {
    headers: {
      // Allow the browser to cache this response for 1 hour (CDN/ISR can extend further).
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
