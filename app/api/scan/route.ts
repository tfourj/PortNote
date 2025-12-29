import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/prisma/generated/prisma'; 

const prisma = new PrismaClient();

interface ScanRequest {
    serverId: number;
}

export async function POST(request: NextRequest) {
    try {
        const body: ScanRequest = await request.json();
        const { serverId } = body;

        const existingScan = await prisma.scan.findFirst({
            where: {
                serverId,
                status: {
                    in: ["queued", "scanning"]
                }
            },
            orderBy: {
                createdAt: "desc"
            }
        });

        if (existingScan) {
            return NextResponse.json({ message: "Scan already in progress", scanId: existingScan.id });
        }

        const scan = await prisma.scan.create({
            data: {
                serverId,
                status: "queued",
                totalPorts: 65535,
                scannedPorts: 0,
                openPorts: 0
            }
        });

        return NextResponse.json({ message: "Success", scanId: scan.id });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
