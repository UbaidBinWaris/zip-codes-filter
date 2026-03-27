import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ZipPayload } from "../route";

type Params = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/zips/:id
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const numId = parseInt(id, 10);

  if (isNaN(numId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const zip = await prisma.zip.findUnique({
    where: { id: numId },
    include: { matches: { orderBy: [{ group: "asc" }, { label: "asc" }] } },
  });

  if (!zip) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(zip);
}

// ---------------------------------------------------------------------------
// PUT /api/zips/:id  →  replace ZIP fields + all its matches
// ---------------------------------------------------------------------------

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const numId = parseInt(id, 10);

  if (isNaN(numId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: ZipPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const zipValue = body.zip?.trim();
  if (!zipValue) {
    return NextResponse.json({ error: "zip is required" }, { status: 400 });
  }

  // Check zip uniqueness if the value is changing
  const conflict = await prisma.zip.findFirst({
    where: { zip: zipValue, NOT: { id: numId } },
  });
  if (conflict) {
    return NextResponse.json({ error: `ZIP ${zipValue} already exists` }, { status: 409 });
  }

  // Replace all matches atomically
  const updated = await prisma.zip.update({
    where: { id: numId },
    data: {
      zip:   zipValue,
      city:  body.city?.trim()  || null,
      state: body.state?.trim() || null,
      matches: {
        deleteMany: {},
        create: (body.matches ?? []).map((m) => ({
          group: m.group.trim(),
          label: m.label.trim(),
        })),
      },
    },
    include: { matches: { orderBy: [{ group: "asc" }, { label: "asc" }] } },
  });

  return NextResponse.json(updated);
}

// ---------------------------------------------------------------------------
// DELETE /api/zips/:id  →  remove ZIP + cascade-delete its matches
// ---------------------------------------------------------------------------

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const numId = parseInt(id, 10);

  if (isNaN(numId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const existing = await prisma.zip.findUnique({ where: { id: numId } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.zip.delete({ where: { id: numId } });

  return NextResponse.json({ success: true });
}
