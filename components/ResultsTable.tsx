"use client";

import { useEffect, useRef } from "react";
import { COLUMNS } from "@/lib/types";
import type { MatchType, SearchResult } from "@/lib/types";
import ZipCell from "./ZipCell";

interface Props {
  readonly results: SearchResult[];
  readonly query: string;
  readonly selectedIndex: number; // -1 = nothing selected
}

const TRANSFER_COLS = COLUMNS.filter((c) => c.group === "Transfer Buyers");
const LG_COLS = COLUMNS.filter((c) => c.group === "LG Buyers");

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

function MatchBadge({ matchType, score }: { readonly matchType: MatchType; readonly score: number }) {
  const b = BADGE[matchType];
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.className}`}>
        <span className={`h-1.5 w-1.5 rounded-full inline-block ${b.dotClass}`} />
        {b.label}
      </span>
      <span className="text-[10px] text-gray-400 tabular-nums">{score}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main table
// ---------------------------------------------------------------------------

export default function ResultsTable({ results, query, selectedIndex }: Props) {
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  // Scroll selected row into view whenever selectedIndex changes
  useEffect(() => {
    if (selectedIndex >= 0 && rowRefs.current[selectedIndex]) {
      rowRefs.current[selectedIndex]!.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [selectedIndex]);

  if (results.length === 0) return null;

  const exactCount = results.filter((r) => r.matchType === "exact").length;
  const prefixCount = results.filter((r) => r.matchType === "prefix").length;
  const substringCount = results.filter((r) => r.matchType === "substring").length;

  return (
    <div className="mt-6 rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Scrollable container — sticky thead works inside here */}
      <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            {/* ── Tier 1: buyer group ─────────────────────────────────────── */}
            <tr className="border-b border-gray-200">
              <th
                rowSpan={3}
                className="border-r border-gray-200 bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 align-bottom"
              >
                State
              </th>
              <th
                rowSpan={3}
                className="border-r border-gray-200 bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 align-bottom"
              >
                Match
              </th>
              <th
                colSpan={TRANSFER_COLS.length}
                className="border-r border-gray-200 bg-blue-50 px-4 py-2 text-center text-xs font-bold uppercase tracking-wider text-blue-700"
              >
                Transfer Buyers (Home &amp; Solar)
              </th>
              <th
                colSpan={LG_COLS.length}
                className="bg-emerald-50 px-4 py-2 text-center text-xs font-bold uppercase tracking-wider text-emerald-700"
              >
                LG Buyers (Home &amp; Solar)
              </th>
            </tr>

            {/* ── Tier 2: sub-group ───────────────────────────────────────── */}
            <tr className="border-b border-gray-100">
              {TRANSFER_COLS.map((col, i) => (
                <th
                  key={col.key}
                  className={`bg-blue-50/80 px-3 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-blue-500 whitespace-nowrap ${
                    i === TRANSFER_COLS.length - 1 ? "border-r border-gray-200" : ""
                  }`}
                >
                  {col.subGroup}
                </th>
              ))}
              {LG_COLS.map((col) => (
                <th
                  key={col.key}
                  className="bg-emerald-50/80 px-3 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-emerald-500 whitespace-nowrap"
                >
                  {col.subGroup}
                </th>
              ))}
            </tr>

            {/* ── Tier 3: category label ──────────────────────────────────── */}
            <tr className="border-b-2 border-gray-200">
              {TRANSFER_COLS.map((col, i) => (
                <th
                  key={col.key}
                  className={`bg-white px-3 py-2 text-center text-xs font-semibold text-gray-600 whitespace-nowrap ${
                    i === TRANSFER_COLS.length - 1 ? "border-r border-gray-200" : ""
                  }`}
                >
                  {col.label}
                </th>
              ))}
              {LG_COLS.map((col) => (
                <th
                  key={col.key}
                  className="bg-white px-3 py-2 text-center text-xs font-semibold text-gray-600 whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {results.map((result, idx) => {
              const { row, matchType, score, matches } = result;
              const matchedKeys = new Set(matches.map((m) => m.columnKey));
              const isSelected = idx === selectedIndex;
              const isEven = idx % 2 === 0;

              return (
                <tr
                  key={row.id}
                  ref={(el) => { rowRefs.current[idx] = el; }}
                  className={[
                    "transition-colors",
                    isSelected
                      ? "ring-2 ring-inset ring-blue-400 bg-blue-50/70"
                      : isEven
                      ? "bg-white hover:bg-blue-50/20"
                      : "bg-gray-50/40 hover:bg-blue-50/20",
                  ].join(" ")}
                >
                  {/* State */}
                  <td className="border-r border-gray-100 px-4 py-3 text-center">
                    {row.state ? (
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                        {row.state}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>

                  {/* Match badge + score */}
                  <td className="border-r border-gray-100 px-4 py-3 text-center">
                    <MatchBadge matchType={matchType} score={score} />
                  </td>

                  {/* Transfer Buyer ZIP columns */}
                  {TRANSFER_COLS.map((col, i) => (
                    <td
                      key={col.key}
                      className={[
                        "px-3 py-3 text-center",
                        matchedKeys.has(col.key) ? "bg-yellow-50/70" : "",
                        i === TRANSFER_COLS.length - 1 ? "border-r border-gray-100" : "",
                      ].join(" ")}
                    >
                      <ZipCell
                        zip={row.zips[col.key]}
                        query={query}
                        isMatched={matchedKeys.has(col.key)}
                      />
                    </td>
                  ))}

                  {/* LG Buyer ZIP columns */}
                  {LG_COLS.map((col) => (
                    <td
                      key={col.key}
                      className={[
                        "px-3 py-3 text-center",
                        matchedKeys.has(col.key) ? "bg-yellow-50/70" : "",
                      ].join(" ")}
                    >
                      <ZipCell
                        zip={row.zips[col.key]}
                        query={query}
                        isMatched={matchedKeys.has(col.key)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 bg-gray-50 px-4 py-2 flex items-center justify-between text-xs text-gray-400">
        <span>
          Use ↑ ↓ to navigate
          {selectedIndex >= 0 && (
            <span className="ml-2 text-blue-500 font-medium">
              Row {selectedIndex + 1} selected
            </span>
          )}
        </span>
        <span>
          {results.length} row{results.length !== 1 ? "s" : ""}
          {exactCount > 0 && <span className="ml-2 text-green-600">{exactCount} exact</span>}
          {prefixCount > 0 && <span className="ml-2 text-blue-600">{prefixCount} prefix</span>}
          {substringCount > 0 && <span className="ml-2 text-amber-600">{substringCount} substring</span>}
        </span>
      </div>
    </div>
  );
}
