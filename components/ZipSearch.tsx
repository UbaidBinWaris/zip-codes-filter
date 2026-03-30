"use client";

import { useState, useCallback, useRef, useEffect, type KeyboardEvent } from "react";
import SearchBar from "./SearchBar";
import ResultsTable from "./ResultsTable";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchResult {
  zip: string;
  state: string | null;
  city: string | null;
  /** vertical name → labels */
  groups: Record<string, string[]>;
}

type LocationEntry =
  | { city: string; state: string }
  | "loading"
  | "error"
  | null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 300;

function normalizeZip(input: string): string {
  const clean = input.trim().replace(/\*/g, "");
  return /^\d+$/.test(clean) ? clean.padStart(5, "0") : clean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ZipSearch() {
  const [inputValue,  setInputValue]  = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [result,      setResult]      = useState<SearchResult | "not-found" | null>(null);
  const [location,    setLocation]    = useState<LocationEntry>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef    = useRef<AbortController | null>(null);

  // ── Search ─────────────────────────────────────────────────────────────────

  const doSearch = useCallback(async (zip: string) => {
    // Cancel any in-flight request
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setIsSearching(true);
    setLocation("loading");

    try {
      const res = await fetch(`/api/search?zip=${encodeURIComponent(zip)}`, {
        signal: ctrl.signal,
      });

      if (!res.ok) {
        setResult("not-found");
        setLocation(null);
        return;
      }

      const data: SearchResult | null = await res.json();
      if (!data) {
        setResult("not-found");
        setLocation(null);
        return;
      }
      setResult(data);

      // Best-effort location enrichment via Zippopotam.us
      try {
        const locRes = await fetch(`https://api.zippopotam.us/us/${zip}`, {
          signal: ctrl.signal,
        });
        if (locRes.ok) {
          const locData = await locRes.json();
          const place = locData.places?.[0];
          if (place) {
            setLocation({
              city:  place["place name"]         ?? "Unknown",
              state: place["state abbreviation"] ?? "Unknown",
            });
            return;
          }
        }
      } catch {
        // location enrichment failed — not critical
      }
      setLocation(null);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setResult("not-found");
      setLocation("error");
    } finally {
      setIsSearching(false);
    }
  }, []);

  // ── Input handler ──────────────────────────────────────────────────────────

  const handleChange = useCallback(
    (value: string) => {
      setInputValue(value);
      setResult(null);
      setLocation(null);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      const normalized = normalizeZip(value);
      if (normalized.length < 5 || !/^\d{5}$/.test(normalized)) {
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      debounceRef.current = setTimeout(() => doSearch(normalized), DEBOUNCE_MS);
    },
    [doSearch]
  );

  // Keyboard handler — no list navigation needed (single result), just Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") handleChange("");
    },
    [handleChange]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  // ── Derived state ──────────────────────────────────────────────────────────

  const cleanZip   = normalizeZip(inputValue);
  const tooShort   = inputValue.trim().length > 0 && cleanZip.length < 5;
  const hasResult  = result !== null && result !== "not-found";
  const notFound   = result === "not-found";

  return (
    <div className="w-full">
      <SearchBar
        value={inputValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        isSearching={isSearching}
        matchSummary={null}
        hasInput={inputValue.trim().length > 0}
        queryTooShort={tooShort}
      />

      {/* Not found */}
      {!isSearching && notFound && (
        <div className="mt-12 flex flex-col items-center gap-3 text-gray-400">
          <svg
            className="h-12 w-12"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 15.75l-2.489-2.489m0 0a3.375 3.375 0 10-4.773-4.773 3.375 3.375 0 004.774 4.774zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-lg font-medium text-gray-500">
            No results for &ldquo;{cleanZip}&rdquo;
          </p>
          <p className="text-sm">This ZIP code is not in our database.</p>
        </div>
      )}

      {/* Idle state */}
      {inputValue.trim().length === 0 && (
        <div className="mt-12 flex flex-col items-center gap-3 text-gray-300">
          <svg
            className="h-14 w-14"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c-.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"
            />
          </svg>
          <p className="text-base font-medium text-gray-400">
            Enter a 5-digit ZIP code
          </p>
          <p className="text-sm text-gray-300">
            Leading zeros are added automatically
          </p>
        </div>
      )}

      {/* Result card */}
      {hasResult && (
        <ResultsTable
          result={result as SearchResult}
          location={location}
        />
      )}
    </div>
  );
}
