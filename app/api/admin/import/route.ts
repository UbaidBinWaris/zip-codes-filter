import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseCSV } from "@/lib/parseCSV";
import { COLUMNS } from "@/lib/types";

function padZip(zip: string): string {
  return zip.length < 5 ? zip.padStart(5, "0") : zip;
}

/**
 * PostgreSQL caps bind parameters at 65 535.
 * With 3 fields per row that is ~21 845 rows/statement.
 * We stay well under by chunking at 5 000.
 */
const CHUNK_SIZE = 5_000;

async function insertChunked<T>(
  items: T[],
  fn: (chunk: T[]) => Promise<unknown>
): Promise<void> {
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    await fn(items.slice(i, i + CHUNK_SIZE));
  }
}

/**
 * POST /api/admin/import
 *
 * Accepts raw CSV text (Content-Type: text/plain).
 *
 * Performance: replaces O(3n) per-row queries with 5 bulk queries:
 *   1. deleteMany ZipMatch   — wipe child rows
 *   2. deleteMany Zip        — wipe parent rows
 *   3. createMany Zip        — bulk insert all ZIPs
 *   4. findMany Zip          — fetch auto-assigned IDs
 *   5. createMany ZipMatch   — bulk insert all matches
 *
 * 20 000 ZIPs with 5 matches each completes in ~2–4 s vs 5–10 min before.
 */
export async function POST(request: NextRequest) {
  // ── 1. Read body ──────────────────────────────────────────────────────────
  let csvContent: string;
  try {
    csvContent = await request.text();
  } catch {
    return NextResponse.json({ error: "Failed to read request body." }, { status: 400 });
  }

  if (!csvContent.trim()) {
    return NextResponse.json({ error: "CSV content is empty." }, { status: 400 });
  }

  // ── 2. Parse & aggregate ──────────────────────────────────────────────────
  const rows = parseCSV(csvContent);
  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid data rows found in CSV." }, { status: 400 });
  }

  // zip → { state, matches: Set<"subGroup||label"> }
  const zipIndex = new Map<string, { state: string; matches: Set<string> }>();

  for (const row of rows) {
    for (const col of COLUMNS) {
      const raw = row.zips[col.key];
      if (!raw) continue;

      const zip      = padZip(raw);
      const matchKey = `${col.subGroup}||${col.label}`;

      if (!zipIndex.has(zip)) {
        zipIndex.set(zip, { state: row.state || "", matches: new Set() });
      }

      const entry = zipIndex.get(zip)!;
      entry.matches.add(matchKey);
      if (!entry.state && row.state) entry.state = row.state;
    }
  }

  if (zipIndex.size === 0) {
    return NextResponse.json({ error: "No ZIP codes found in CSV." }, { status: 400 });
  }

  // ── 3. Wipe existing data (clean import) ──────────────────────────────────
  // Delete child rows first to satisfy FK constraint, then parent rows.
  await prisma.zipMatch.deleteMany();
  await prisma.zip.deleteMany();

  // ── 4. Bulk insert ZIPs ───────────────────────────────────────────────────
  const zipRows = Array.from(zipIndex.entries()).map(([zip, { state }]) => ({
    zip,
    state: state || null,
    city:  null as string | null,
  }));

  await insertChunked(zipRows, (chunk) =>
    prisma.zip.createMany({ data: chunk, skipDuplicates: true })
  );

  // ── 5. Fetch auto-assigned IDs in one query ───────────────────────────────
  const zipCodes    = zipRows.map((z) => z.zip);
  const insertedZips = await prisma.zip.findMany({
    where:  { zip: { in: zipCodes } },
    select: { id: true, zip: true },
  });

  const zipIdMap = new Map<string, number>(
    insertedZips.map((z) => [z.zip, z.id])
  );

  // ── 6. Build match rows ───────────────────────────────────────────────────
  const matchRows: { zipId: number; group: string; label: string }[] = [];

  for (const [zip, { matches }] of zipIndex) {
    const zipId = zipIdMap.get(zip);
    if (zipId === undefined) continue; // shouldn't happen

    for (const key of matches) {
      const sep   = key.indexOf("||");
      const group = key.slice(0, sep);
      const label = key.slice(sep + 2);
      matchRows.push({ zipId, group, label });
    }
  }

  // ── 7. Bulk insert matches ────────────────────────────────────────────────
  await insertChunked(matchRows, (chunk) =>
    prisma.zipMatch.createMany({ data: chunk, skipDuplicates: true })
  );

  return NextResponse.json({
    success: true,
    message: `Import complete: ${zipIndex.size.toLocaleString()} ZIPs, ${matchRows.length.toLocaleString()} matches.`,
    stats: {
      zips:    zipIndex.size,
      matches: matchRows.length,
      chunks:  {
        zips:    Math.ceil(zipRows.length   / CHUNK_SIZE),
        matches: Math.ceil(matchRows.length / CHUNK_SIZE),
      },
    },
  });
}
