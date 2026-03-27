import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Shared types (used by admin client as well)
// ---------------------------------------------------------------------------

export interface ZipMatchPayload {
  group: string;
  label: string;
}

export interface ZipPayload {
  zip: string;
  city?: string;
  state?: string;
  matches?: ZipMatchPayload[];
}

// ---------------------------------------------------------------------------
// GET /api/zips  →  paginated + searchable list
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const page   = Math.max(1, parseInt(searchParams.get("page")  ?? "1", 10));
  const limit  = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
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
      include: { matches: { orderBy: [{ group: "asc" }, { label: "asc" }] } },
      orderBy: { zip: "asc" },
      skip:  (page - 1) * limit,
      take:  limit,
    }),
    prisma.zip.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, limit, pages: Math.ceil(total / limit) });
}

// ---------------------------------------------------------------------------
// POST /api/zips  →  create a new ZIP with optional matches
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

  // Guard against duplicates
  const existing = await prisma.zip.findUnique({ where: { zip } });
  if (existing) {
    return NextResponse.json({ error: `ZIP ${zip} already exists` }, { status: 409 });
  }

  const created = await prisma.zip.create({
    data: {
      zip,
      city:  body.city?.trim()  || null,
      state: body.state?.trim() || null,
      matches: {
        create: (body.matches ?? []).map((m) => ({
          group: m.group.trim(),
          label: m.label.trim(),
        })),
      },
    },
    include: { matches: true },
  });

  return NextResponse.json(created, { status: 201 });
}
