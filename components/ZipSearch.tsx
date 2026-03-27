"use client";

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type KeyboardEvent,
} from "react";
import type { MatchSummary, SearchIndex, SearchResult } from "@/lib/types";
import { search } from "@/lib/search";
import SearchBar from "./SearchBar";
import ResultsTable from "./ResultsTable";

interface Props {
  readonly index: SearchIndex;
}

const DEBOUNCE_MS = 300;
const MIN_QUERY = 3;

export default function ZipSearch({ index }: Props) {
  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always-current result length for use inside stable callbacks
  const resultsLengthRef = useRef(0);

  // ── Debounced input ────────────────────────────────────────────────────────
  const handleChange = useCallback((value: string) => {
    setInputValue(value);
    setIsSearching(true);
    setSelectedIndex(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQuery(value);
      setIsSearching(false);
    }, DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Reset selection whenever the committed query changes
  useEffect(() => {
    setSelectedIndex(-1);
  }, [query]);

  // ── Keyboard navigation ────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      const len = resultsLengthRef.current;
      if (len === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, len - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Escape":
          handleChange("");
          break;
        // Enter: row is already highlighted; extend here for future detail view
      }
    },
    [handleChange]
  );

  // ── Search ─────────────────────────────────────────────────────────────────
  const results: SearchResult[] = useMemo(() => {
    if (query.trim().length < MIN_QUERY) return [];
    return search(index, query);
  }, [index, query]);

  // Keep ref in sync so handleKeyDown always sees the latest length
  resultsLengthRef.current = results.length;

  // ── Match summary for the status bar ──────────────────────────────────────
  const matchSummary: MatchSummary | null = useMemo(() => {
    if (results.length === 0) return null;
    let exact = 0, prefix = 0, substring = 0;
    for (const r of results) {
      if (r.matchType === "exact") exact++;
      else if (r.matchType === "prefix") prefix++;
      else substring++;
    }
    return { exact, prefix, substring, total: results.length };
  }, [results]);

  const cleanQuery = query.trim().replace(/^\*+/, "");

  return (
    <div className="w-full">
      <SearchBar
        value={inputValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        isSearching={isSearching}
        matchSummary={query.trim().length >= MIN_QUERY ? matchSummary : null}
        hasInput={query.trim().length > 0}
        queryTooShort={inputValue.trim().length > 0 && inputValue.trim().length < MIN_QUERY}
      />

      {/* Empty state */}
      {!isSearching && query.trim().length >= MIN_QUERY && results.length === 0 && (
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
            No results for &ldquo;{cleanQuery}&rdquo;
          </p>
          <p className="text-sm">Try fewer digits or a different ZIP.</p>
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
            Search across {index.rows.length.toLocaleString()} ZIP entries
          </p>
          <p className="text-sm text-gray-300">
            Exact · Prefix · Substring — ranked by relevance
          </p>
        </div>
      )}

      {/* Results — only render when results exist */}
      {results.length > 0 && (
        <ResultsTable
          results={results}
          query={cleanQuery}
          selectedIndex={selectedIndex}
        />
      )}
    </div>
  );
}
