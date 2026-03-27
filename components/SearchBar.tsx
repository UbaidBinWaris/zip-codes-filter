"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import type { MatchSummary } from "@/lib/types";

interface Props {
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  readonly isSearching: boolean;
  /** null = no query committed yet; populated once query length >= 3 */
  readonly matchSummary: MatchSummary | null;
  readonly hasInput: boolean;
  readonly queryTooShort: boolean;
}

export default function SearchBar({
  value,
  onChange,
  onKeyDown,
  isSearching,
  matchSummary,
  hasInput,
  queryTooShort,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="relative">
        {/* Search icon */}
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
          <svg
            className="h-5 w-5 text-gray-400"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          maxLength={10}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Enter a ZIP code (e.g. 12345)"
          aria-label="ZIP code search"
          aria-describedby="search-status"
          className="block w-full rounded-xl border border-gray-200 bg-white py-4 pl-12 pr-12 text-base text-gray-900 shadow-sm ring-1 ring-transparent placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition"
        />

        {/* Clear button */}
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 hover:text-gray-600 transition"
          >
            <svg
              className="h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        )}
      </div>

      {/* Status line */}
      <div
        id="search-status"
        className="mt-2 h-5 px-1 flex items-center gap-2 text-sm"
      >
        {isSearching && (
          <span className="animate-pulse text-gray-400">Searching…</span>
        )}

        {!isSearching && queryTooShort && (
          <span className="text-gray-400">Type at least 5 digits to search.</span>
        )}

        {!isSearching && hasInput && !queryTooShort && matchSummary === null && (
          <span className="text-gray-400">No results found.</span>
        )}

        {!isSearching && matchSummary !== null && (
          <StatusPills summary={matchSummary} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status pills — shows a concise breakdown of match types
// ---------------------------------------------------------------------------

function StatusPills({ summary }: { readonly summary: MatchSummary }) {
  const { total } = summary;

  return (
    <span className="flex items-center gap-1.5 flex-wrap">
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
        {total} exact match{total === 1 ? "" : "es"}
      </span>
    </span>
  );
}
