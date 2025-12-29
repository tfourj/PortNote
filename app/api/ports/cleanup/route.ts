import { NextResponse } from "next/server";
import { PrismaClient } from "@/prisma/generated/prisma";

const prisma = new PrismaClient();

type CleanupPortRow = {
  id: number;
  serverId: number;
  port: number;
  note: string | null;
  serverName: string;
  serverHostId: number | null;
  hostName: string | null;
};

export async function GET() {
  try {
    const ports = await prisma.$queryRaw<CleanupPortRow[]>`
      SELECT
        p.id,
        p."serverId" AS serverId,
        p.port,
        p.note,
        s.name AS serverName,
        s.host AS serverHostId,
        h.name AS hostName
      FROM "Port" p
      JOIN "Server" s ON s.id = p."serverId"
      LEFT JOIN "Server" h ON h.id = s.host
      WHERE p."lastCheckedAt" IS NOT NULL
        AND (p."lastSeenAt" IS NULL OR p."lastSeenAt" < p."lastCheckedAt")
      ORDER BY s.name, p.port
    `;

    return NextResponse.json({ ports });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ids = Array.isArray(body?.ids)
      ? body.ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0)
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "ids are required" }, { status: 400 });
    }

    const result = await prisma.port.deleteMany({
      where: {
        id: { in: ids }
      }
    });

    return NextResponse.json({ deleted: result.count });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
