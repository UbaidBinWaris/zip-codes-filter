import type { Zip, ZipMatch as PrismaZipMatch } from "@prisma/client";
import { COLUMNS, type ColumnKey, type ZipRow, type SearchIndex } from "./types";
import { buildIndex } from "./search";

type DbZipWithMatches = Zip & { matches: PrismaZipMatch[] };

// Reverse lookup: "subGroup:label" → ColumnKey  (built once at module load)
const COL_KEY_BY_MATCH = new Map<string, ColumnKey>();
for (const col of COLUMNS) {
  COL_KEY_BY_MATCH.set(`${col.subGroup}:${col.label}`, col.key);
}

/**
 * Convert DB Zip records (with their matches) into a SearchIndex that the
 * existing search() function can work with.
 *
 * Each DB Zip becomes one synthetic ZipRow whose `zips` map has the same ZIP
 * value repeated for each recognized (subGroup, label) column key.
 */
export function buildIndexFromDB(dbZips: DbZipWithMatches[]): SearchIndex {
  const rows: ZipRow[] = [];

  for (let i = 0; i < dbZips.length; i++) {
    const dbZip = dbZips[i];
    const zips = {} as Record<ColumnKey, string>;

    for (const match of dbZip.matches) {
      const key = COL_KEY_BY_MATCH.get(`${match.group}:${match.label}`);
      if (key) {
        zips[key] = dbZip.zip;
      }
    }

    // Skip zips with no recognized column matches
    if (Object.keys(zips).length > 0) {
      rows.push({
        id: i,
        state: dbZip.state ?? "",
        zips,
        rawZips: { ...zips },
      });
    }
  }

  return buildIndex(rows);
}
