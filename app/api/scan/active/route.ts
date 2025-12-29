import { NextResponse } from "next/server";
import { PrismaClient } from "@/prisma/generated/prisma";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const scans = await prisma.scan.findMany({
      where: {
        status: {
          in: ["queued", "scanning"]
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return NextResponse.json({ scans });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
