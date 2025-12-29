import { NextRequest } from "next/server";
import { PrismaClient } from "@/prisma/generated/prisma";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const scanIdParam = searchParams.get("scanId");
  const scanId = scanIdParam ? Number(scanIdParam) : Number.NaN;

  if (!scanIdParam || Number.isNaN(scanId)) {
    return new Response(JSON.stringify({ error: "scanId is required" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }

  const encoder = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      const poll = async () => {
        if (closed) {
          return;
        }

        try {
          const scan = await prisma.scan.findUnique({
            where: { id: scanId }
          });

          if (!scan) {
            send({ scanId, status: "missing" });
            closed = true;
            controller.close();
            return;
          }

          send({
            scanId: scan.id,
            serverId: scan.serverId,
            status: scan.status,
            scannedPorts: scan.scannedPorts,
            totalPorts: scan.totalPorts,
            openPorts: scan.openPorts,
            error: scan.error
          });

          if (scan.status === "done" || scan.status === "error") {
            closed = true;
            controller.close();
          }
        } catch (error: any) {
          send({
            scanId,
            status: "error",
            error: error?.message ?? "Failed to read scan status"
          });
          closed = true;
          controller.close();
        }
      };

      const loop = () => {
        poll().finally(() => {
          if (!closed) {
            timer = setTimeout(loop, 1000);
          }
        });
      };

      loop();

      request.signal.addEventListener("abort", () => {
        closed = true;
        if (timer) {
          clearTimeout(timer);
        }
        controller.close();
      });
    },
    cancel() {
      closed = true;
      if (timer) {
        clearTimeout(timer);
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
