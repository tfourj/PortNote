import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/prisma/generated/prisma'; 

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
    try {
        const servers = await prisma.server.findMany();
        const ports = await prisma.$queryRaw<{
            id: number;
            serverId: number;
            note: string | null;
            port: number;
            lastSeenAt: string | null;
            lastCheckedAt: string | null;
        }[]>`SELECT id, "serverId", note, port, "lastSeenAt", "lastCheckedAt" FROM "Port"`;

        const normalizedPorts = ports.map((port) => ({
            ...port,
            lastSeenAt: port.lastSeenAt ? new Date(port.lastSeenAt).toISOString() : null,
            lastCheckedAt: port.lastCheckedAt ? new Date(port.lastCheckedAt).toISOString() : null
        }));

        const serversWithPorts = servers.map(server => ({
            ...server,
            ports: normalizedPorts.filter(port => port.serverId === server.id)
        }));
        
        return NextResponse.json(serversWithPorts);
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}
