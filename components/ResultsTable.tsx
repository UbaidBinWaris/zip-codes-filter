"use client";

import { useState } from "react";
import type { SearchResult } from "./ZipSearch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LocationEntry =
  | { city: string; state: string }
  | "loading"
  | "error"
  | null;

interface Props {
  readonly result: SearchResult;
  readonly location: LocationEntry;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LocationLine({ location }: { location: LocationEntry }) {
  if (location === "loading") {
    return (
      <div className="flex items-center gap-1.5 text-gray-400">
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500" />
        <span className="text-sm">Loading location…</span>
      </div>
    );
  }

  if (!location || location === "error") {
    return null;
  }

  const { city, state } = location;
  const hasCity  = city  && city  !== "Unknown";
  const hasState = state && state !== "Unknown";

  if (!hasCity && !hasState) return null;

  return (
    <p className="text-xl font-semibold text-gray-700">
      {hasCity  && <span>{city}</span>}
      {hasCity && hasState && (
        <span className="mx-1.5 font-normal text-gray-300">,</span>
      )}
      {hasState && <span>{state}</span>}
    </p>
  );
}

function CopyButton({ zip, location }: { zip: string; location: LocationEntry }) {
  const [copied, setCopied] = useState(false);

  const city =
    !location || location === "loading" || location === "error"
      ? "Unknown"
      : location.city;
  const state =
    !location || location === "loading" || location === "error"
      ? "Unknown"
      : location.state;

  const handleCopy = () => {
    navigator.clipboard.writeText(`${zip}, ${city}, ${state}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={[
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
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
          Copy
        </>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main result card
// ---------------------------------------------------------------------------

/**
 * Displays a single ZIP result grouped by vertical name (bold heading) with
 * labels listed as bullet points beneath each group.
 *
 * Example output:
 *
 *   ZIP: 41001
 *   Alexandria, KY
 *
 *   [D1 Solar LT]
 *   • Window
 *
 *   [D5 Roof LT]
 *   • Roof
 *
 *   [B3 LG]
 *   • Sidings
 *   • Roofing
 */
export default function ResultsTable({ result, location }: Props) {
  const { zip, groups } = result;
  const verticalNames = Object.keys(groups).sort();

  return (
    <div className="mt-6 rounded-2xl border border-gray-200 bg-white shadow-md overflow-hidden">
      {/* ── Header: ZIP + location ── */}
      <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-4xl font-bold tracking-widest text-gray-900">
            {zip}
          </p>
          <div className="mt-1.5">
            <LocationLine location={location} />
          </div>
        </div>
        <CopyButton zip={zip} location={location} />
      </div>

      {/* ── Vertical groups ── */}
      {verticalNames.length === 0 ? (
        <p className="px-6 py-6 text-sm text-gray-400">
          No vertical data available for this ZIP.
        </p>
      ) : (
        <div className="divide-y divide-gray-50">
          {verticalNames.map((name) => {
            const labels = groups[name];
            return (
              <div key={name} className="px-6 py-4">
                {/* Bold vertical name heading */}
                <p className="text-sm font-bold text-gray-900 mb-2">{name}</p>

                {/* Labels as bullet list */}
                {labels.length === 0 ? (
                  <p className="text-sm text-gray-400">—</p>
                ) : (
                  <ul className="space-y-1">
                    {labels.map((label) => (
                      <li
                        key={label}
                        className="flex items-center gap-2 text-sm text-gray-600"
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                        {label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Footer: count summary ── */}
      <div className="border-t border-gray-100 px-6 py-3 text-xs text-gray-400">
        {verticalNames.length} vertical{verticalNames.length !== 1 ? "s" : ""}
        {" · "}
        {Object.values(groups).flat().length} label
        {Object.values(groups).flat().length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
