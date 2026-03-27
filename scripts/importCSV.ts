/**
 * scripts/importCSV.ts
 *
 * Reads data.csv, parses every row+column, and upserts each ZIP + its
 * category matches into PostgreSQL via Prisma.
 *
 * Run:
 *   npx tsx scripts/importCSV.ts
 */

import path from "path";
import fs from "fs";
import { PrismaClient } from "@prisma/client";
import { parseCSV } from "../lib/parseCSV";
import { COLUMNS } from "../lib/types";

const prisma = new PrismaClient({
  log: ["error", "warn"],
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function padZip(zip: string): string {
  // Restore leading zeros stripped during CSV parsing (e.g. "1234" → "01234")
  return zip.length < 5 ? zip.padStart(5, "0") : zip;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const csvPath = path.join(process.cwd(), "data.csv");

  if (!fs.existsSync(csvPath)) {
    console.error("❌  data.csv not found at:", csvPath);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCSV(csvContent);
  console.log(`📄  Parsed ${rows.length} rows from CSV`);

  // Flatten: (zip → { state, matches[] })
  // Aggregate all matches per ZIP before hitting the DB.
  const zipIndex = new Map<
    string,
    { state: string; matches: Set<string> }
  >();

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

      // Prefer a non-empty state if we find one later in the rows
      if (!entry.state && row.state) entry.state = row.state;
    }
  }

  console.log(`🗂   ${zipIndex.size} unique ZIPs to import`);

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const [zip, { state, matches }] of zipIndex) {
    try {
      const matchData = Array.from(matches).map((key) => {
        const [group, label] = key.split("||");
        return { group, label };
      });

      // Upsert the ZIP record
      const existing = await prisma.zip.findUnique({ where: { zip } });

      if (!existing) {
        await prisma.zip.create({
          data: {
            zip,
            state: state || null,
            city: null, // populated later via zippopotam.us / admin
            matches: { create: matchData },
          },
        });
        created++;
      } else {
        // Re-sync matches: delete old, insert current (idempotent re-runs)
        await prisma.zipMatch.deleteMany({ where: { zipId: existing.id } });
        await prisma.zipMatch.createMany({
          data: matchData.map((m) => ({ ...m, zipId: existing.id })),
        });
        // Only backfill state if not already set
        if (!existing.state && state) {
          await prisma.zip.update({
            where: { id: existing.id },
            data: { state },
          });
        }
        updated++;
      }
    } catch (err) {
      console.error(`  ❌  Failed for ZIP ${zip}:`, err);
      errors++;
    }
  }

  console.log(`\n✅  Import complete`);
  console.log(`   Created : ${created}`);
  console.log(`   Updated : ${updated}`);
  console.log(`   Errors  : ${errors}`);
}

main()
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
