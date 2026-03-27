"use client";

import { useEffect, useRef, useState } from "react";
import type { LocationEntry, MatchType, ZipMatch, ZipResult } from "@/lib/types";

interface Props {
  readonly results: ZipResult[];
  readonly query: string;
  readonly selectedIndex: number; // -1 = nothing selected
  readonly locationMap: Record<string, LocationEntry>;
}

// ---------------------------------------------------------------------------
// Match badge
// ---------------------------------------------------------------------------

const BADGE: Record<MatchType, { label: string; className: string; dotClass: string }> = {
  exact: {
    label: "Exact",
    className: "bg-green-100 text-green-700",
    dotClass: "bg-green-500",
  },
  prefix: {
    label: "Prefix",
    className: "bg-blue-100 text-blue-700",
    dotClass: "bg-blue-500",
  },
  substring: {
    label: "Substring",
    className: "bg-amber-100 text-amber-700",
    dotClass: "bg-amber-400",
  },
};

function MatchBadge({
  matchType,
  score,
}: {
  readonly matchType: MatchType;
  readonly score: number;
}) {
  const b = BADGE[matchType];
  return (
    <div className="flex flex-col items-end gap-0.5 shrink-0">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.className}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full inline-block ${b.dotClass}`} />
        {b.label}
      </span>
      <span className="text-[10px] text-gray-400 tabular-nums text-right">{score}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ZIP highlight — marks the matched portion of the zip string
// ---------------------------------------------------------------------------

function HighlightedZip({ zip, query }: { readonly zip: string; readonly query: string }) {
  if (!query) {
    return <span className="font-mono font-bold text-gray-900">{zip}</span>;
  }

  const idx = zip.indexOf(query);
  if (idx === -1) {
    return (
      <mark className="rounded bg-yellow-200 px-0.5 font-mono font-bold text-yellow-900">
        {zip}
      </mark>
    );
  }

  const before = zip.slice(0, idx);
  const matched = zip.slice(idx, idx + query.length);
  const after = zip.slice(idx + query.length);

  return (
    <span className="font-mono font-bold text-gray-900">
      {before}
      <mark className="rounded bg-yellow-200 px-0.5 text-yellow-900">{matched}</mark>
      {after}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Location line — city · state with loading / error states
// ---------------------------------------------------------------------------

function LocationLine({ entry }: { readonly entry: LocationEntry | undefined }) {
  if (entry === undefined || entry === "loading") {
    return (
      <div className="flex items-center gap-1.5 text-base text-gray-400">
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500" />
        <span>Loading…</span>
      </div>
    );
  }

  if (entry === "error") {
    return <p className="text-base text-gray-400">Unknown</p>;
  }

  const { city, state } = entry;
  const hasCity = city && city !== "Unknown";
  const hasState = state && state !== "Unknown";

  if (!hasCity && !hasState) {
    return <p className="text-base text-gray-400">Unknown</p>;
  }

  return (
    <p className="text-xl font-semibold text-gray-700">
      {hasCity && <span>{city}</span>}
      {hasCity && hasState && <span className="mx-1.5 font-normal text-gray-300">,</span>}
      {hasState && <span>{state}</span>}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Copy button
// ---------------------------------------------------------------------------

function CopyButton({
  zip,
  entry,
}: {
  readonly zip: string;
  readonly entry: LocationEntry | undefined;
}) {
  const [copied, setCopied] = useState(false);

  const city =
    !entry || entry === "loading" || entry === "error" ? "Unknown" : entry.city;
  const state =
    !entry || entry === "loading" || entry === "error" ? "Unknown" : entry.state;

  const handleCopy = () => {
    const text = `${zip}, ${city}, ${state}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Copy: ${zip}, ${city}, ${state}`}
      className={[
        "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors",
        copied
          ? "bg-green-100 text-green-700"
          : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700",
      ].join(" ")}
    >
      {copied ? (
        <>
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
              clipRule="evenodd"
            />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
            <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
          </svg>
          Copy Address
        </>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Single match chip  e.g.  "Roof  ·  D5"
// ---------------------------------------------------------------------------

const GROUP_COLORS: Record<string, string> = {
  "D1 Solar LT":       "bg-blue-50   text-blue-700   ring-blue-200",
  "D1 LT CPL":         "bg-blue-50   text-blue-700   ring-blue-200",
  "D2 LT":             "bg-indigo-50 text-indigo-700 ring-indigo-200",
  "Home CPA Transfer": "bg-purple-50 text-purple-700 ring-purple-200",
  "D5":                "bg-sky-50    text-sky-700    ring-sky-200",
  "B3 LG":             "bg-emerald-50 text-emerald-700 ring-emerald-200",
};
const DEFAULT_CHIP = "bg-gray-50 text-gray-600 ring-gray-200";

function MatchChip({ match }: { readonly match: ZipMatch }) {
  const color = GROUP_COLORS[match.group] ?? DEFAULT_CHIP;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${color}`}
    >
      <span className="font-semibold">{match.label}</span>
      <span className="opacity-50">·</span>
      <span className="opacity-60">{match.group}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// ZIP result card
// ---------------------------------------------------------------------------

interface CardProps {
  readonly result: ZipResult;
  readonly query: string;
  readonly isSelected: boolean;
  readonly locationEntry: LocationEntry | undefined;
  readonly cardRef: (el: HTMLDivElement | null) => void;
}

function ZipCard({ result, query, isSelected, locationEntry, cardRef }: CardProps) {
  const { zip, matchType, score, matches } = result;

  return (
    <div
      ref={cardRef}
      className={[
        "rounded-2xl border bg-white shadow-md transition-all duration-200 flex flex-col",
        isSelected
          ? "border-blue-400 ring-2 ring-blue-400/30 shadow-xl scale-[1.01]"
          : "border-gray-200 hover:border-gray-300 hover:shadow-xl hover:scale-[1.02]",
      ].join(" ")}
    >
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-2">
        <span className="text-3xl leading-none tracking-widest">
          <HighlightedZip zip={zip} query={query} />
        </span>
        <MatchBadge matchType={matchType} score={score} />
      </div>

      {/* ── Location ── */}
      <div className="px-6 pb-4 mt-1">
        <LocationLine entry={locationEntry} />
      </div>

      {/* ── Match chips ── */}
      <div className="border-t border-gray-100 px-6 py-4 flex-1">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
          {matches.length} match{matches.length !== 1 ? "es" : ""}
        </p>
        <div className="flex flex-wrap gap-2.5">
          {matches.map((m) => (
            <MatchChip key={`${m.group}:${m.label}`} match={m} />
          ))}
        </div>
      </div>

      {/* ── Footer / Copy ── */}
      <div className="border-t border-gray-100 px-6 py-3 flex justify-end">
        <CopyButton zip={zip} entry={locationEntry} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main list
// ---------------------------------------------------------------------------

export default function ResultsTable({ results, query, selectedIndex, locationMap }: Props) {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (selectedIndex >= 0 && cardRefs.current[selectedIndex]) {
      cardRefs.current[selectedIndex]!.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [selectedIndex]);

  if (results.length === 0) return null;

  return (
    <div className="mt-6">
      {/* Cards grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((result, idx) => (
          <ZipCard
            key={result.zip}
            result={result}
            query={query}
            isSelected={idx === selectedIndex}
            locationEntry={locationMap[result.zip]}
            cardRef={(el) => { cardRefs.current[idx] = el; }}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between text-xs text-gray-400 px-1">
        <span>
          Use ↑ ↓ to navigate
          {selectedIndex >= 0 && (
            <span className="ml-2 text-blue-500 font-medium">
              #{selectedIndex + 1} selected
            </span>
          )}
        </span>
        <span>{results.length} ZIP{results.length === 1 ? "" : "s"} found</span>
      </div>
    </div>
  );
}
