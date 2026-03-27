import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/admin/reset
 *
 * Wipes all ZipMatch rows (FK child) then all Zip rows.
 * Protected by admin middleware (session cookie required).
 */
export async function DELETE() {
  const [matchCount, zipCount] = await Promise.all([
    prisma.zipMatch.count(),
    prisma.zip.count(),
  ]);

  // Delete child rows first to satisfy FK constraints
  await prisma.zipMatch.deleteMany();
  await prisma.zip.deleteMany();

  return NextResponse.json({
    success: true,
    message: `Deleted ${zipCount.toLocaleString()} ZIPs and ${matchCount.toLocaleString()} matches.`,
    deleted: { zips: zipCount, matches: matchCount },
  });
}
