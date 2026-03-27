import { COLUMNS, type ColumnKey, type ZipRow } from "./types";

/**
 * Parse the raw CSV/TSV content into structured ZipRow objects.
 *
 * Supports two layouts automatically:
 *
 * Layout A – Legacy tab-separated (data.csv):
 *   3 header rows are skipped; columns read by fixed colIndex.
 *
 * Layout B – Comma-separated (LTLG C 1.csv style):
 *   1 header row; columns discovered by matching header names.
 *
 * Header keywords used for column detection (case-insensitive):
 *   Solar / Window  → d1Window
 *   Bath            → d1Bath
 *   D2              → d2Cpl
 *   Home CPA / CPA  → homeCpaRoof
 *   D5              → d5Roof
 *   Siding          → b3Sidings
 *   Roof            → b3Roof (first unassigned roof column)
 *   Floor           → b3Flooring
 *   Bathroom        → b3Bathroom
 *   Cabinet         → b3Cabinets
 */
export function parseCSV(csvContent: string): ZipRow[] {
  const lines = csvContent.split(/\r?\n/);
  if (lines.length === 0) return [];

  // ── Detect delimiter ───────────────────────────────────────────────────────
  const firstLine  = lines[0];
  const tabCount   = (firstLine.match(/\t/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g)  ?? []).length;
  const delimiter  = tabCount >= commaCount ? "\t" : ",";

  const split = (line: string): string[] => line.split(delimiter);

  return delimiter === "\t"
    ? parseLegacyTSV(lines, split)
    : parseHeaderCSV(lines, split);
}

// ---------------------------------------------------------------------------
// Layout A – Legacy tab-separated (original behaviour unchanged)
// ---------------------------------------------------------------------------
function parseLegacyTSV(
  lines: string[],
  split: (l: string) => string[]
): ZipRow[] {
  const rows: ZipRow[] = [];

  for (let lineIdx = 3; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    if (!line || !line.trim()) continue;

    const cols  = split(line);
    const state = (cols[0] ?? "").trim();

    const zips    = {} as Record<ColumnKey, string>;
    const rawZips = {} as Record<ColumnKey, string>;
    let hasContent = false;

    for (const col of COLUMNS) {
      const raw     = (cols[col.colIndex] ?? "").trim();
      const cleaned = raw.replace(/^\*+/, "").trim();
      rawZips[col.key] = raw;
      zips[col.key]    = cleaned;
      if (cleaned) hasContent = true;
    }

    if (!hasContent) continue;
    rows.push({ id: rows.length, state, zips, rawZips });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Layout B – Header-driven comma-separated parser
// ---------------------------------------------------------------------------

/** Rules applied left-to-right to map a header cell to a ColumnKey. */
const HEADER_RULES: { test: (h: string) => boolean; key: ColumnKey }[] = [
  { test: (h) => /d5/i.test(h),              key: "d5Roof"      },
  { test: (h) => /d2/i.test(h),              key: "d2Cpl"       },
  { test: (h) => /bathroom/i.test(h),        key: "b3Bathroom"  },
  { test: (h) => /bath/i.test(h),            key: "d1Bath"      },
  { test: (h) => /home.?cpa|cpa/i.test(h),   key: "homeCpaRoof" },
  { test: (h) => /siding/i.test(h),          key: "b3Sidings"   },
  { test: (h) => /floor/i.test(h),           key: "b3Flooring"  },
  { test: (h) => /cabinet/i.test(h),         key: "b3Cabinets"  },
  // "Roof" shared by D5 (caught above) and b3Roof; assign first remaining match
  { test: (h) => /roof/i.test(h),            key: "b3Roof"      },
  // Solar / Window last so "bath" rule wins for "D1 Bath LT"
  { test: (h) => /solar|window/i.test(h),    key: "d1Window"    },
];

function parseHeaderCSV(
  lines: string[],
  split: (l: string) => string[]
): ZipRow[] {
  // Find the first non-empty header line
  let headerIdx = 0;
  while (headerIdx < lines.length && !lines[headerIdx].trim()) headerIdx++;
  if (headerIdx >= lines.length) return [];

  const headers = split(lines[headerIdx]).map((h) => h.trim());

  // Map ColumnKey → column index using header rules
  const colMap   = new Map<ColumnKey, number>();
  const assigned = new Set<ColumnKey>();

  for (let ci = 0; ci < headers.length; ci++) {
    const h = headers[ci];
    if (!h) continue;
    for (const rule of HEADER_RULES) {
      if (assigned.has(rule.key)) continue;
      if (rule.test(h)) {
        colMap.set(rule.key, ci);
        assigned.add(rule.key);
        break;
      }
    }
  }

  // Column 0 holds the state abbreviation (e.g. "PA", "NJ") when present
  const stateColIdx = 0;

  const rows: ZipRow[] = [];

  for (let lineIdx = headerIdx + 1; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    if (!line || !line.trim()) continue;

    const cols  = split(line);
    const state = (cols[stateColIdx] ?? "").trim();

    const zips    = {} as Record<ColumnKey, string>;
    const rawZips = {} as Record<ColumnKey, string>;
    let hasContent = false;

    for (const col of COLUMNS) {
      const ci      = colMap.get(col.key);
      const raw     = ci !== undefined ? (cols[ci] ?? "").trim() : "";
      const cleaned = raw.replace(/^\*+/, "").trim();
      rawZips[col.key] = raw;
      zips[col.key]    = cleaned;
      if (cleaned) hasContent = true;
    }

    if (!hasContent) continue;
    rows.push({ id: rows.length, state, zips, rawZips });
  }

  return rows;
}
