import { COLUMNS, type ColumnKey, type ZipRow } from "./types";

/**
 * Parse the raw tab-separated CSV content into structured ZipRow objects.
 *
 * CSV layout (0-indexed columns):
 *   [0]  State (only rows 0-2 carry PA / NJ / DE)
 *   [2]  D1 Solar LT – Window
 *   [3]  D1 LT CPL  – Bath
 *   [5]  D2 LT      – CPL (Window+Bath)
 *   [7]  Home CPA   – Roof/Siding/Doors
 *   [9]  D5         – Roof
 *   [14] B3 LG      – Sidings
 *   [15] B3 LG      – Roof
 *   [16] B3 LG      – Flooring
 *   [17] B3 LG      – Bathroom
 *   [18] B3 LG      – Cabinets
 *
 * The first 3 lines are header rows and are skipped.
 */
export function parseCSV(csvContent: string): ZipRow[] {
  const lines = csvContent.split("\n");
  const rows: ZipRow[] = [];

  // Skip the 3 header lines
  for (let lineIdx = 3; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    if (!line || !line.trim()) continue;

    const cols = line.split("\t");

    const state = (cols[0] ?? "").trim();

    const zips = {} as Record<ColumnKey, string>;
    const rawZips = {} as Record<ColumnKey, string>;
    let hasContent = false;

    for (const col of COLUMNS) {
      const raw = (cols[col.colIndex] ?? "").trim();
      // Strip leading asterisk used as a special marker in some cells
      const cleaned = raw.replace(/^\*+/, "").trim();
      rawZips[col.key] = raw;
      zips[col.key] = cleaned;
      if (cleaned) hasContent = true;
    }

    // Skip completely empty rows
    if (!hasContent) continue;

    rows.push({
      id: rows.length,
      state,
      zips,
      rawZips,
    });
  }

  return rows;
}
