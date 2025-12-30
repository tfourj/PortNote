import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@/prisma/generated/prisma";

const prisma = new PrismaClient();

type ImportPort = {
  port?: number;
  note?: string | null;
  lastSeenAt?: string | null;
  lastCheckedAt?: string | null;
};

type ImportServer = {
  id?: number;
  name?: string;
  ip?: string;
  host?: number | null;
  excludeFromScan?: boolean;
  ports?: ImportPort[];
};

const parseDate = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawServers = Array.isArray(body) ? body : body?.servers;

    if (!Array.isArray(rawServers)) {
      return NextResponse.json({ error: "Invalid import format." }, { status: 400 });
    }

    const servers = rawServers.map((server: ImportServer, index: number) => {
      const name = typeof server?.name === "string" ? server.name.trim() : "";
      const ip = typeof server?.ip === "string" ? server.ip.trim() : "";
      const host =
        Number.isInteger(server?.host) && Number(server.host) > 0
          ? Number(server.host)
          : null;
      const key = Number.isInteger(server?.id) ? Number(server.id) : index;
      const excludeFromScan = typeof server?.excludeFromScan === "boolean" ? server.excludeFromScan : false;
      const ports = Array.isArray(server?.ports) ? server.ports : [];
      return { key, name, ip, host, excludeFromScan, ports };
    });

    const invalidServers = servers.filter((server) => !server.name || !server.ip);
    if (invalidServers.length > 0) {
      return NextResponse.json({ error: "Import data must include server name and IP." }, { status: 400 });
    }

    let portsSkipped = 0;
    let portsCreated = 0;

    await prisma.$transaction(async (tx) => {
      const serverIdMap = new Map<number, number>();

      for (const server of servers) {
        const created = await tx.server.create({
          data: {
            name: server.name,
            ip: server.ip,
            host: null,
            excludeFromScan: server.excludeFromScan
          }
        });
        serverIdMap.set(server.key, created.id);
      }

      for (const server of servers) {
        if (server.host === null) {
          continue;
        }
        const serverId = serverIdMap.get(server.key);
        const hostId = serverIdMap.get(server.host);
        if (!serverId || !hostId) {
          continue;
        }
        await tx.server.update({
          where: { id: serverId },
          data: { host: hostId }
        });
      }

      const portsToCreate: {
        serverId: number;
        port: number;
        note: string | null;
        lastSeenAt: Date | null;
        lastCheckedAt: Date | null;
      }[] = [];
      for (const server of servers) {
        const serverId = serverIdMap.get(server.key);
        if (!serverId) {
          continue;
        }
        for (const port of server.ports) {
          const portNumber = Number(port?.port);
          if (!Number.isInteger(portNumber) || portNumber < 0 || portNumber > 65535) {
            portsSkipped += 1;
            continue;
          }
          portsToCreate.push({
            serverId,
            port: portNumber,
            note: typeof port?.note === "string" ? port.note : null,
            lastSeenAt: parseDate(port?.lastSeenAt),
            lastCheckedAt: parseDate(port?.lastCheckedAt)
          });
        }
      }

      if (portsToCreate.length > 0) {
        const result = await tx.port.createMany({ data: portsToCreate });
        portsCreated = result.count;
      }
    });

    return NextResponse.json({
      serversCreated: servers.length,
      portsCreated,
      portsSkipped
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
