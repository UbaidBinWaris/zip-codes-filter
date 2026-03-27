import {
  COLUMNS,
  MATCH_SCORES,
  MAX_RESULTS,
  type ColumnKey,
  type MatchType,
  type SearchIndex,
  type ZipMatch,
  type ZipResult,
  type ZipRow,
} from "./types";

// ---------------------------------------------------------------------------
// Index construction  (O(n log n) — dominated by the sort)
// ---------------------------------------------------------------------------

/**
 * Build a SearchIndex from parsed rows.
 * Called once server-side; the plain-JSON result is passed to the client.
 *
 * exactMap  → O(1) exact lookup
 * prefixEntries (sorted) → O(log n + k) prefix lookup via binary search
 *                          + fallback linear scan for substring matching
 */
export function buildIndex(rows: ZipRow[]): SearchIndex {
  const exactMap: SearchIndex["exactMap"] = {};
  const raw: SearchIndex["prefixEntries"] = [];

  for (const row of rows) {
    for (const col of COLUMNS) {
      const zip = row.zips[col.key];
      if (!zip) continue;

      if (!exactMap[zip]) exactMap[zip] = [];
      exactMap[zip].push({ rowId: row.id, columnKey: col.key });

      raw.push({ zip, rowId: row.id, columnKey: col.key as ColumnKey });
    }
  }

  // Sort once — enables binary search for all future prefix queries
  raw.sort((a, b) => (a.zip < b.zip ? -1 : a.zip > b.zip ? 1 : 0));

  return { rows, exactMap, prefixEntries: raw };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Binary search: returns the index of the first entry whose zip >= target.
 * O(log n).
 */
function lowerBound(entries: readonly { zip: string }[], target: string): number {
  let lo = 0;
  let hi = entries.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (entries[mid].zip < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Normalise query: strip leading asterisks and whitespace.
 * Also return a leading-zero-stripped variant so that "01234" finds stored "1234"
 * and vice-versa (handles the common case of 4-digit ZIPs missing their leading 0).
 */
function normalizeQuery(raw: string): string[] {
  const q = raw.trim().replace(/^\*+/, "").trim();
  if (!q) return [];
  const stripped = q.replace(/^0+/, "");
  return stripped && stripped !== q ? [q, stripped] : [q];
}

// ---------------------------------------------------------------------------
// Search  (O(log n + k) for prefix, O(n) for substring fallback)
// ---------------------------------------------------------------------------

const MIN_QUERY_LENGTH = 3;

// Precomputed map from column key to column definition for O(1) lookup
const COL_BY_KEY = new Map(COLUMNS.map((c) => [c.key, c]));

/**
 * Search the index for a query string.
 *
 * Returns one ZipResult per matched ZIP code — aggregated across all rows
 * and columns in which that ZIP appears.
 *
 * Ranking:
 *  1. Exact    (score 100) — zip === query
 *  2. Prefix   (score  70) — zip.startsWith(query)
 *  3. Substring(score  40) — zip.includes(query) and none of the above
 *
 * - Results are de-duplicated per ZIP (a ZIP appears once even if it spans
 *   multiple rows or columns).
 * - A ZIP's score = highest score among all its column matches.
 * - Results are sorted by score DESC, capped at MAX_RESULTS.
 * - Leading-zero variants are resolved automatically.
 */
export function search(index: SearchIndex, rawQuery: string): ZipResult[] {
  const queries = normalizeQuery(rawQuery);
  if (!queries.length || queries[0].length < MIN_QUERY_LENGTH) return [];

  // zip → accumulated hit data
  interface ZipAccum {
    matchType: MatchType;
    score: number;
    state: string;
    matches: ZipMatch[];
    seenKeys: Set<ColumnKey>;
  }
  const zipMap = new Map<string, ZipAccum>();

  function addHit(
    rowId: number,
    columnKey: ColumnKey,
    zip: string,
    mt: MatchType
  ) {
    const sc = MATCH_SCORES[mt];
    const col = COL_BY_KEY.get(columnKey)!;
    const rowState = index.rows[rowId].state;

    if (!zipMap.has(zip)) {
      zipMap.set(zip, {
        matchType: mt,
        score: sc,
        state: rowState,
        matches: [],
        seenKeys: new Set(),
      });
    }

    const acc = zipMap.get(zip)!;

    // Upgrade if this column's match is stronger
    if (sc > acc.score) {
      acc.score = sc;
      acc.matchType = mt;
    }

    // Take state from this row if not already set
    if (!acc.state && rowState) {
      acc.state = rowState;
    }

    // Deduplicate column entries within the same ZIP
    if (!acc.seenKeys.has(columnKey)) {
      acc.seenKeys.add(columnKey);
      acc.matches.push({ group: col.subGroup, label: col.label });
    }
  }

  // ── Step 1 & 2: exact + prefix  (uses exactMap and sorted prefixEntries) ──
  for (const q of queries) {
    // Exact — O(1)
    for (const hit of index.exactMap[q] ?? []) {
      addHit(hit.rowId, hit.columnKey, q, "exact");
    }

    // Prefix — O(log n + k) via binary search
    const lo = lowerBound(index.prefixEntries, q);
    for (let i = lo; i < index.prefixEntries.length; i++) {
      const e = index.prefixEntries[i];
      if (!e.zip.startsWith(q)) break; // sorted order guarantees we can stop
      if (e.zip === q) continue;       // already handled as exact
      addHit(e.rowId, e.columnKey, e.zip, "prefix");
    }
  }

  // ── Step 3: substring  (linear scan — only runs on non-exact/prefix entries) ──
  for (const e of index.prefixEntries) {
    if (queries.some((q) => e.zip === q || e.zip.startsWith(q))) continue;
    if (!queries.some((q) => e.zip.includes(q))) continue;
    addHit(e.rowId, e.columnKey, e.zip, "substring");
  }

  // ── Assemble, sort by score DESC, cap ────────────────────────────────────
  const results: ZipResult[] = [];
  for (const [zip, acc] of zipMap) {
    results.push({
      zip,
      city: "Unknown",
      state: acc.state || "Unknown",
      matchType: acc.matchType,
      score: acc.score,
      matches: acc.matches,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, MAX_RESULTS);
}
