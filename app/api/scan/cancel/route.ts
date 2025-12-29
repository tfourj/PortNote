import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@/prisma/generated/prisma";

const prisma = new PrismaClient();

interface CancelRequest {
  scanId: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: CancelRequest = await request.json();
    const { scanId } = body;

    if (!scanId) {
      return NextResponse.json({ error: "scanId is required" }, { status: 400 });
    }

    await prisma.scan.updateMany({
      where: {
        id: scanId,
        status: {
          in: ["queued", "scanning"]
        }
      },
      data: {
        status: "canceled",
        finishedAt: new Date()
      }
    });

    return NextResponse.json({ message: "Canceled" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
