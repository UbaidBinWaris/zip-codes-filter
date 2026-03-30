import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ZipPayload } from "../route";

type Params = { params: Promise<{ id: string }> };

const zipInclude = {
  ZipVertical: {
    include: { vertical: true },
    orderBy: [
      { vertical: { name: "asc" as const } },
      { vertical: { label: "asc" as const } },
    ],
  },
} as const;

function formatZip(z: {
  id: number;
  zip: string;
  city: string | null;
  state: string | null;
  ZipVertical: { vertical: { name: string; label: string } }[];
}) {
  return {
    id: z.id,
    zip: z.zip,
    city: z.city,
    state: z.state,
    verticals: z.ZipVertical.map((zv) => ({
      name: zv.vertical.name,
      label: zv.vertical.label,
    })),
  };
}

// ---------------------------------------------------------------------------
// GET /api/zips/:id
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const numId = Number.parseInt(id, 10);
  if (Number.isNaN(numId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const zip = await prisma.zip.findUnique({ where: { id: numId }, include: zipInclude });
  if (!zip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(formatZip(zip));
}

// ---------------------------------------------------------------------------
// PUT /api/zips/:id  →  replace ZIP fields + all its verticals
// ---------------------------------------------------------------------------

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const numId = Number.parseInt(id, 10);
  if (Number.isNaN(numId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: ZipPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const zipValue = body.zip?.trim();
  if (!zipValue) return NextResponse.json({ error: "zip is required" }, { status: 400 });

  const conflict = await prisma.zip.findFirst({ where: { zip: zipValue, NOT: { id: numId } } });
  if (conflict) {
    return NextResponse.json({ error: `ZIP ${zipValue} already exists` }, { status: 409 });
  }

  // Upsert each Vertical (find-or-create by unique name+label)
  const verticalIds: number[] = [];
  for (const v of body.verticals ?? []) {
    if (!v.name?.trim() || !v.label?.trim()) continue;
    const vertical = await prisma.vertical.upsert({
      where: { name_label: { name: v.name.trim(), label: v.label.trim() } },
      create: { name: v.name.trim(), label: v.label.trim() },
      update: {},
    });
    verticalIds.push(vertical.id);
  }

  // Replace all ZipVertical links atomically
  const updated = await prisma.zip.update({
    where: { id: numId },
    data: {
      zip:   zipValue,
      city:  body.city?.trim()  || null,
      state: body.state?.trim() || null,
      ZipVertical: {
        deleteMany: {},
        create: verticalIds.map((verticalId) => ({ verticalId })),
      },
    },
    include: zipInclude,
  });

  return NextResponse.json(formatZip(updated));
}

// ---------------------------------------------------------------------------
// DELETE /api/zips/:id  →  remove ZIP (cascade-deletes ZipVertical rows)
// ---------------------------------------------------------------------------

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const numId = Number.parseInt(id, 10);
  if (Number.isNaN(numId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const existing = await prisma.zip.findUnique({ where: { id: numId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.zip.delete({ where: { id: numId } });
  return NextResponse.json({ success: true });
}
