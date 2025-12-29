import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/prisma/generated/prisma'; 

const prisma = new PrismaClient();

interface AddRequest {
    type: number;
    serverName: string;
    serverIP: string;
    serverHost: number;
    excludeFromScan?: boolean;
    portServer: number;
    portNote: string;
    portPort: number;
}

export async function POST(request: NextRequest) {
    try {
        const body: AddRequest = await request.json();
        const { type, serverName, serverIP, serverHost, portServer, portNote, portPort } = body;

        if (type === 0) { // Server
            const server = await prisma.server.create({
                data: {
                    name: serverName,
                    ip: serverIP,
                    host: serverHost,
                    excludeFromScan: body.excludeFromScan ?? false
                }
            });
            return NextResponse.json(server);
        } else { // Port
            const port = await prisma.port.create({
                data: {
                    serverId: portServer,
                    note: portNote,
                    port: portPort,
                }
            });
            return NextResponse.json(port);
        }
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
