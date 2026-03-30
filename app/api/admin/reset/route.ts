import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/admin/reset
 *
 * Wipes all three tables in FK-safe order:
 *   ZipVertical (junction) → Zip → Vertical
 *
 * Protected by admin middleware (session cookie required).
 */
export async function DELETE() {
  const [zvCount, zipCount, verticalCount] = await Promise.all([
    prisma.zipVertical.count(),
    prisma.zip.count(),
    prisma.vertical.count(),
  ]);

  await prisma.zipVertical.deleteMany();
  await prisma.zip.deleteMany();
  await prisma.vertical.deleteMany();

  return NextResponse.json({
    success: true,
    message: `Deleted ${zipCount.toLocaleString()} ZIPs, ${verticalCount.toLocaleString()} verticals, and ${zvCount.toLocaleString()} links.`,
    deleted: { zips: zipCount, verticals: verticalCount, links: zvCount },
  });
}
