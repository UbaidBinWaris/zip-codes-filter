// ---------------------------------------------------------------------------
// Column definitions — single source of truth for CSV column mapping
// ---------------------------------------------------------------------------

export const COLUMNS = [
  {
    key: "d1Window",
    label: "Window",
    group: "Transfer Buyers",
    subGroup: "D1 Solar LT",
    colIndex: 2,
  },
  {
    key: "d1Bath",
    label: "Bath",
    group: "Transfer Buyers",
    subGroup: "D1 LT CPL",
    colIndex: 3,
  },
  {
    key: "d2Cpl",
    label: "CPL (Win+Bath)",
    group: "Transfer Buyers",
    subGroup: "D2 LT",
    colIndex: 5,
  },
  {
    key: "homeCpaRoof",
    label: "Roof / Siding / Doors",
    group: "Transfer Buyers",
    subGroup: "Home CPA Transfer",
    colIndex: 7,
  },
  {
    key: "d5Roof",
    label: "Roof",
    group: "Transfer Buyers",
    subGroup: "D5",
    colIndex: 9,
  },
  {
    key: "b3Sidings",
    label: "Sidings",
    group: "LG Buyers",
    subGroup: "B3 LG",
    colIndex: 14,
  },
  {
    key: "b3Roof",
    label: "Roof",
    group: "LG Buyers",
    subGroup: "B3 LG",
    colIndex: 15,
  },
  {
    key: "b3Flooring",
    label: "Flooring",
    group: "LG Buyers",
    subGroup: "B3 LG",
    colIndex: 16,
  },
  {
    key: "b3Bathroom",
    label: "Bathroom",
    group: "LG Buyers",
    subGroup: "B3 LG",
    colIndex: 17,
  },
  {
    key: "b3Cabinets",
    label: "Cabinets",
    group: "LG Buyers",
    subGroup: "B3 LG",
    colIndex: 18,
  },
] as const;

export type ColumnKey = (typeof COLUMNS)[number]["key"];

// ---------------------------------------------------------------------------
// Core data types
// ---------------------------------------------------------------------------

/** One parsed row from the CSV. */
export interface ZipRow {
  id: number;
  state: string;
  zips: Record<ColumnKey, string>;
  rawZips: Record<ColumnKey, string>;
}

// ---------------------------------------------------------------------------
// Search types
// ---------------------------------------------------------------------------

/**
 * Three-tier match type in priority order:
 *  exact (100) > prefix (70) > substring (40)
 */
export type MatchType = "exact" | "prefix" | "substring";

export const MATCH_SCORES: Record<MatchType, number> = {
  exact: 100,
  prefix: 70,
  substring: 40,
} as const;

export const MAX_RESULTS = 100;

export interface ColumnMatch {
  columnKey: ColumnKey;
  zip: string;
}

export interface SearchResult {
  row: ZipRow;
  matchType: MatchType;
  /** Highest score among all column matches for this row. */
  score: number;
  matches: ColumnMatch[];
}

/** Summary counts passed to the status bar. */
export interface MatchSummary {
  exact: number;
  prefix: number;
  substring: number;
  total: number;
}

/** Pre-built index — constructed server-side, passed to the client as plain JSON. */
export interface SearchIndex {
  rows: ZipRow[];
  /** zip → hits for O(1) exact lookup. */
  exactMap: Record<string, { rowId: number; columnKey: ColumnKey }[]>;
  /**
   * All zip entries sorted alphabetically.
   * Enables O(log n + k) prefix matching via binary search
   * and serves as the scan list for substring matching.
   */
  prefixEntries: { zip: string; rowId: number; columnKey: ColumnKey }[];
}
