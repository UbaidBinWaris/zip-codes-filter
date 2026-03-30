import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/search?zip=XXXXX
 *
 * Exact-match ZIP lookup. Normalises the input (strips *, pads leading zeros)
 * then returns the ZIP record with all verticals grouped by name.
 *
 * Returns null (200) when the ZIP exists but has no data,
 * or a 404-equivalent null when not found — callers check for null.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawZip = (searchParams.get("zip") ?? "").trim().replace(/\*/g, "");
  const zip = /^\d+$/.test(rawZip) ? rawZip.padStart(5, "0") : rawZip;

  if (!/^\d{5}$/.test(zip)) {
    return NextResponse.json({ error: "Enter a 5-digit ZIP code." }, { status: 400 });
  }

  const record = await prisma.zip.findUnique({
    where: { zip },
    include: {
      ZipVertical: {
        include: { vertical: true },
        orderBy: [
          { vertical: { name: "asc" } },
          { vertical: { label: "asc" } },
        ],
      },
    },
  });

  if (!record) {
    return NextResponse.json(null);
  }

  // Group labels under their vertical name
  const groupMap = new Map<string, string[]>();
  for (const zv of record.ZipVertical) {
    const { name, label } = zv.vertical;
    if (!groupMap.has(name)) groupMap.set(name, []);
    if (label) groupMap.get(name)!.push(label);
  }

  return NextResponse.json({
    zip: record.zip,
    state: record.state,
    city: record.city,
    groups: Object.fromEntries(groupMap),
  });
}
