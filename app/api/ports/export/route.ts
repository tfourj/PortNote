import { NextResponse } from "next/server";
import { PrismaClient } from "@/prisma/generated/prisma";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const servers = await prisma.server.findMany();
    const ports = await prisma.port.findMany();

    const normalizedPorts = ports.map((port) => ({
      ...port,
      lastSeenAt: port.lastSeenAt ? port.lastSeenAt.toISOString() : null,
      lastCheckedAt: port.lastCheckedAt ? port.lastCheckedAt.toISOString() : null
    }));

    const serversWithPorts = servers.map((server) => ({
      ...server,
      ports: normalizedPorts.filter((port) => port.serverId === server.id)
    }));

    return NextResponse.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      servers: serversWithPorts
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
