import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/prisma/generated/prisma'; 

const prisma = new PrismaClient();

interface UpdateRequest {
  type: number;
  id: number;
  data: {
    name?: string;
    ip?: string;
    host?: number | null;
    excludeFromScan?: boolean;
    note?: string | null;
    port?: number;
  };
}

export async function PUT(request: NextRequest) {
  try {
    const body: UpdateRequest = await request.json();
    const { type, id, data } = body;

    if (type === 0) { // Server
      const server = await prisma.server.update({
        where: { id },
        data: {
          name: data.name,
          ip: data.ip,
          host: data.host,
          excludeFromScan: data.excludeFromScan
        }
      });
      return NextResponse.json(server);
    } else { // Port
      const port = await prisma.port.update({
        where: { id },
        data: {
          note: data.note,
          port: data.port
        }
      });
      return NextResponse.json(port);
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
