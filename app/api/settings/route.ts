import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@/prisma/generated/prisma";

const prisma = new PrismaClient();

type SettingsPayload = {
  scanEnabled: boolean;
  scanIntervalMinutes: number;
  scanConcurrency: number;
};

const DEFAULT_SETTINGS: SettingsPayload = {
  scanEnabled: true,
  scanIntervalMinutes: 1440,
  scanConcurrency: 2
};

export async function GET() {
  try {
    let settings = await prisma.settings.findFirst();

    if (!settings) {
      settings = await prisma.settings.create({ data: DEFAULT_SETTINGS });
    }

    const totalServers = await prisma.server.count({
      where: {
        excludeFromScan: false
      }
    });
    const activeScansCount = await prisma.scan.count({
      where: {
        status: {
          in: ["queued", "scanning"]
        }
      }
    });

    const intervalMs = settings.scanIntervalMinutes * 60 * 1000;
    const threshold = new Date(Date.now() - intervalMs).toISOString();
    const scannedRows = await prisma.$queryRaw<{ count: number }[]>`
      SELECT CAST(COUNT(*) as INTEGER) as count
      FROM (
        SELECT s.id
        FROM "Server" s
        LEFT JOIN "Scan" sc
          ON sc."serverId" = s.id
         AND sc.status = 'done'
         AND sc."finishedAt" IS NOT NULL
        WHERE s."excludeFromScan" = 0
        GROUP BY s.id
        HAVING MAX(sc."finishedAt") >= ${threshold}
      ) t
    `;
    const scannedServers = Number(scannedRows?.[0]?.count ?? 0);

    const lastScan = await prisma.scan.findFirst({
      where: {
        status: "done",
        finishedAt: {
          not: null
        }
      },
      orderBy: {
        finishedAt: "desc"
      }
    });

    return NextResponse.json({
      ...settings,
      lastScanAt: lastScan?.finishedAt ?? null,
      totalServers,
      scannedServers,
      activeScansCount
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<SettingsPayload>;
    const scanEnabled = body.scanEnabled ?? DEFAULT_SETTINGS.scanEnabled;
    const scanIntervalMinutes = body.scanIntervalMinutes ?? DEFAULT_SETTINGS.scanIntervalMinutes;
    const scanConcurrency = body.scanConcurrency ?? DEFAULT_SETTINGS.scanConcurrency;

    if (scanIntervalMinutes < 1 || scanIntervalMinutes > 1440) {
      return NextResponse.json({ error: "scanIntervalMinutes must be between 1 and 1440" }, { status: 400 });
    }

    if (scanConcurrency < 1 || scanConcurrency > 10) {
      return NextResponse.json({ error: "scanConcurrency must be between 1 and 10" }, { status: 400 });
    }

    let settings = await prisma.settings.findFirst();
    if (!settings) {
      settings = await prisma.settings.create({
        data: {
          scanEnabled,
          scanIntervalMinutes,
          scanConcurrency
        }
      });
      return NextResponse.json(settings);
    }

    const updated = await prisma.settings.update({
      where: { id: settings.id },
      data: {
        scanEnabled,
        scanIntervalMinutes,
        scanConcurrency
      }
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
