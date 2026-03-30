import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function padZip(raw: string): string {
  const clean = raw.replace(/\*/g, "").trim();
  if (!clean || !/^\d+$/.test(clean)) return "";
  return clean.padStart(5, "0");
}

function splitRow(line: string, delimiter: string): string[] {
  return line.split(delimiter).map((c) => c.trim());
}

interface ColumnDef {
  name: string;  // vertical name  (e.g. "D1 Solar LT")
  label: string; // label          (e.g. "Window")
}

/**
 * Parse the CSV/TSV and return:
 *   columns  – one entry per data column (skipping col 0 = state)
 *   rows     – { state, zips[] } one per data row
 *
 * Supports two header formats:
 *
 *   1-row  (single header):
 *     Row 0: State | D1 Solar Window LT | D1 Bath LT | …
 *     Row 1+: PA   | 2807               | *00151      | …
 *     → name = label = column header text
 *
 *   2-row  (split header):
 *     Row 0: State | D1 Solar LT | D1 LT CPL | …   ← vertical names
 *     Row 1:       | Window      | Bath       | …   ← labels
 *     Row 2+: PA   | 2807        | *00151     | …   ← data
 *     → name from row 0, label from row 1
 *
 * Detection: if row 1's non-empty cells (columns 1+) are mostly non-ZIP text
 * (i.e. < half match /^\*?\d{4,6}$/), treat as a label row.
 */
function parseImportCSV(content: string): {
  columns: ColumnDef[];
  rows: { state: string; zips: string[] }[];
} {
  const lines = content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim());

  if (lines.length < 2) return { columns: [], rows: [] };

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const row0 = splitRow(lines[0], delimiter);
  const row1 = splitRow(lines[1], delimiter);

  // Detect 2-row header: row1 data cells are mostly non-numeric label text
  const row1DataCells = row1.slice(1).filter((c) => c !== "");
  const zipLikeCount = row1DataCells.filter((c) => /^\*?\d{4,6}$/.test(c)).length;
  const isTwoRowHeader =
    row1DataCells.length > 0 && zipLikeCount < row1DataCells.length / 2;

  let columns: ColumnDef[];
  let dataStart: number;

  if (isTwoRowHeader) {
    // row0[1..] = vertical names, row1[1..] = labels, data from row 2
    columns = row0.slice(1).map((name, i) => ({
      name: name || `Column ${i + 1}`,
      label: row1[i + 1] || name || `Column ${i + 1}`,
    })).filter((c) => c.name.trim());
    dataStart = 2;
  } else {
    // row0[1..] = column headers used as both name and label, data from row 1
    columns = row0.slice(1).map((name) => ({
      name: name.trim(),
      label: name.trim(),
    })).filter((c) => c.name);
    dataStart = 1;
  }

  const rows: { state: string; zips: string[] }[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const cells = splitRow(lines[i], delimiter);
    const state = (cells[0] ?? "").trim();
    if (!state) continue;
    rows.push({ state, zips: cells.slice(1) });
  }

  return { columns, rows };
}

// ---------------------------------------------------------------------------
// Chunked bulk insert
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 5_000;

async function insertChunked<T>(
  items: T[],
  fn: (chunk: T[]) => Promise<unknown>
): Promise<void> {
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    await fn(items.slice(i, i + CHUNK_SIZE));
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/import
//
// Accepts raw CSV/TSV text (Content-Type: text/plain).
//
// Bulk-import strategy (5 queries instead of O(n) per-row):
//   1. deleteMany ZipVertical   (child of both Zip and Vertical)
//   2. deleteMany Zip
//   3. deleteMany Vertical
//   4. createMany Vertical      (all unique name+label pairs)
//   5. createMany Zip
//   6. findMany Vertical + Zip  (fetch auto-assigned IDs)
//   7. createMany ZipVertical   (junction records)
//
// 20 000 ZIPs with 10 verticals → completes in seconds.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // 1. Read body
  let csvContent: string;
  try {
    csvContent = await request.text();
  } catch {
    return NextResponse.json({ error: "Failed to read request body." }, { status: 400 });
  }

  if (!csvContent.trim()) {
    return NextResponse.json({ error: "CSV content is empty." }, { status: 400 });
  }

  // 2. Parse
  const { columns, rows } = parseImportCSV(csvContent);

  if (columns.length === 0) {
    return NextResponse.json({ error: "No columns found in CSV header." }, { status: 400 });
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "No data rows found in CSV." }, { status: 400 });
  }

  // 3. Build aggregated ZIP index and unique vertical set
  //    zip → { state, verticals: Set<"name||label"> }
  const zipIndex = new Map<string, { state: string; verticals: Set<string> }>();
  const verticalKeys = new Set<string>(); // "name||label"

  for (const row of rows) {
    for (let i = 0; i < columns.length; i++) {
      const raw = row.zips[i];
      if (!raw) continue;
      const zip = padZip(raw);
      if (!zip) continue;

      const col = columns[i];
      const vKey = `${col.name}||${col.label}`;
      verticalKeys.add(vKey);

      if (!zipIndex.has(zip)) {
        zipIndex.set(zip, { state: row.state, verticals: new Set() });
      }
      const entry = zipIndex.get(zip)!;
      entry.verticals.add(vKey);
      if (!entry.state && row.state) entry.state = row.state;
    }
  }

  if (zipIndex.size === 0) {
    return NextResponse.json({ error: "No valid ZIP codes found in CSV." }, { status: 400 });
  }

  // 4. Prepare insert lists
  const verticalList = Array.from(verticalKeys).map((key) => {
    const sep = key.indexOf("||");
    return { name: key.slice(0, sep), label: key.slice(sep + 2) };
  });

  const zipList = Array.from(zipIndex.entries()).map(([zip, { state }]) => ({
    zip,
    state: state || null,
    city: null as string | null,
  }));

  // 5. Wipe existing data (child first to satisfy FK constraints)
  await prisma.zipVertical.deleteMany();
  await prisma.zip.deleteMany();
  await prisma.vertical.deleteMany();

  // 6. Bulk insert Verticals
  await insertChunked(verticalList, (chunk) =>
    prisma.vertical.createMany({ data: chunk, skipDuplicates: true })
  );

  // 7. Bulk insert Zips
  await insertChunked(zipList, (chunk) =>
    prisma.zip.createMany({ data: chunk, skipDuplicates: true })
  );

  // 8. Fetch auto-assigned IDs in two parallel queries
  const [insertedZips, insertedVerticals] = await Promise.all([
    prisma.zip.findMany({
      where: { zip: { in: zipList.map((z) => z.zip) } },
      select: { id: true, zip: true },
    }),
    prisma.vertical.findMany({
      select: { id: true, name: true, label: true },
    }),
  ]);

  const zipIdMap = new Map(insertedZips.map((z) => [z.zip, z.id]));
  const verticalIdMap = new Map(
    insertedVerticals.map((v) => [`${v.name}||${v.label}`, v.id])
  );

  // 9. Build ZipVertical junction records
  const zvList: { zipId: number; verticalId: number }[] = [];
  for (const [zip, { verticals }] of zipIndex) {
    const zipId = zipIdMap.get(zip);
    if (zipId === undefined) continue;
    for (const vKey of verticals) {
      const verticalId = verticalIdMap.get(vKey);
      if (verticalId === undefined) continue;
      zvList.push({ zipId, verticalId });
    }
  }

  // 10. Bulk insert ZipVerticals
  await insertChunked(zvList, (chunk) =>
    prisma.zipVertical.createMany({ data: chunk, skipDuplicates: true })
  );

  return NextResponse.json({
    success: true,
    message: `Import complete: ${zipIndex.size.toLocaleString()} ZIPs · ${verticalList.length} verticals · ${zvList.length.toLocaleString()} links.`,
    stats: {
      zips: zipIndex.size,
      verticals: verticalList.length,
      links: zvList.length,
      chunks: {
        zips: Math.ceil(zipList.length / CHUNK_SIZE),
        verticals: Math.ceil(verticalList.length / CHUNK_SIZE),
        links: Math.ceil(zvList.length / CHUNK_SIZE),
      },
    },
  });
}
