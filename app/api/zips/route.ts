import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Shared payload types (used by admin client + [id]/route.ts)
// ---------------------------------------------------------------------------

export interface VerticalPayload {
  name: string;
  label: string;
}

export interface ZipPayload {
  zip: string;
  city?: string;
  state?: string;
  verticals?: VerticalPayload[];
}

// ---------------------------------------------------------------------------
// Shared include clause
// ---------------------------------------------------------------------------

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
// GET /api/zips  →  paginated + searchable list
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const page  = Math.max(1, Number.parseInt(searchParams.get("page")  ?? "1",  10));
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get("limit") ?? "20", 10)));
  const search = searchParams.get("search")?.trim() ?? "";

  const where = search
    ? {
        OR: [
          { zip:   { contains: search, mode: "insensitive" as const } },
          { city:  { contains: search, mode: "insensitive" as const } },
          { state: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [data, total] = await Promise.all([
    prisma.zip.findMany({
      where,
      include: zipInclude,
      orderBy: { zip: "asc" },
      skip:  (page - 1) * limit,
      take:  limit,
    }),
    prisma.zip.count({ where }),
  ]);

  return NextResponse.json({
    data:  data.map(formatZip),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  });
}

// ---------------------------------------------------------------------------
// POST /api/zips  →  create a new ZIP with optional verticals
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  let body: ZipPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const zip = body.zip?.trim();
  if (!zip) {
    return NextResponse.json({ error: "zip is required" }, { status: 400 });
  }

  const existing = await prisma.zip.findUnique({ where: { zip } });
  if (existing) {
    return NextResponse.json({ error: `ZIP ${zip} already exists` }, { status: 409 });
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

  const created = await prisma.zip.create({
    data: {
      zip,
      city:  body.city?.trim()  || null,
      state: body.state?.trim() || null,
      ZipVertical: {
        create: verticalIds.map((verticalId) => ({ verticalId })),
      },
    },
    include: zipInclude,
  });

  return NextResponse.json(formatZip(created), { status: 201 });
}
