import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseCSV } from "@/lib/parseCSV";
import { COLUMNS } from "@/lib/types";

function padZip(zip: string): string {
  return zip.length < 5 ? zip.padStart(5, "0") : zip;
}

/**
 * POST /api/admin/import
 *
 * Accepts raw CSV text (Content-Type: text/plain) in the request body.
 * Parses it with the existing parseCSV(), aggregates ZIP → matches,
 * then upserts each ZIP and its matches into PostgreSQL.
 *
 * Idempotent: re-running with the same CSV replaces matches rather than
 * duplicating them.
 */
export async function POST(request: NextRequest) {
  let csvContent: string;
  try {
    csvContent = await request.text();
  } catch {
    return NextResponse.json({ error: "Failed to read request body." }, { status: 400 });
  }

  if (!csvContent.trim()) {
    return NextResponse.json({ error: "CSV content is empty." }, { status: 400 });
  }

  const rows = parseCSV(csvContent);
  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid data rows found in CSV." }, { status: 400 });
  }

  // ── Aggregate: ZIP → { state, matches Set } ─────────────────────────────
  const zipIndex = new Map<string, { state: string; matches: Set<string> }>();

  for (const row of rows) {
    for (const col of COLUMNS) {
      const raw = row.zips[col.key];
      if (!raw) continue;

      const zip = padZip(raw);
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

  // ── Upsert each ZIP ──────────────────────────────────────────────────────
  let created = 0;
  let updated = 0;
  let errors  = 0;

  for (const [zip, { state, matches }] of zipIndex) {
    try {
      const matchData = Array.from(matches).map((key) => {
        const [group, label] = key.split("||");
        return { group, label };
      });

      const existing = await prisma.zip.findUnique({ where: { zip } });

      if (!existing) {
        await prisma.zip.create({
          data: {
            zip,
            state: state || null,
            city:  null,
            matches: { create: matchData },
          },
        });
        created++;
      } else {
        // Replace matches atomically (idempotent re-import)
        await prisma.zipMatch.deleteMany({ where: { zipId: existing.id } });
        await prisma.zipMatch.createMany({
          data: matchData.map((m) => ({ ...m, zipId: existing.id })),
        });
        // Backfill state only if not already set
        if (!existing.state && state) {
          await prisma.zip.update({ where: { id: existing.id }, data: { state } });
        }
        updated++;
      }
    } catch (err) {
      console.error(`Import error for ZIP ${zip}:`, err);
      errors++;
    }
  }

  return NextResponse.json({
    success: true,
    message: `Import complete: ${created} created, ${updated} updated${errors > 0 ? `, ${errors} errors` : ""}.`,
    stats: { total: zipIndex.size, created, updated, errors },
  });
}
