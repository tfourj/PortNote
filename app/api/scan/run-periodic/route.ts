import { NextResponse } from "next/server";
import { PrismaClient } from "@/prisma/generated/prisma";

const prisma = new PrismaClient();

export async function POST() {
  try {
    const servers = await prisma.server.findMany({
      where: {
        excludeFromScan: false
      },
      select: { id: true }
    });

    const activeScans = await prisma.scan.findMany({
      where: {
        status: {
          in: ["queued", "scanning"]
        }
      },
      select: { serverId: true }
    });

    const activeSet = new Set(activeScans.map((scan) => scan.serverId));
    const toQueue = servers.filter((server) => !activeSet.has(server.id));

    if (toQueue.length > 0) {
      await prisma.scan.createMany({
        data: toQueue.map((server) => ({
          serverId: server.id,
          status: "queued",
          totalPorts: 65535,
          scannedPorts: 0,
          openPorts: 0
        }))
      });
    }

    return NextResponse.json({ queued: toQueue.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
