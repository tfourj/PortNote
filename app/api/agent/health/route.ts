import { NextResponse } from "next/server";
import { readFile } from "fs/promises";

export const dynamic = "force-dynamic";

const resolveHeartbeatPath = () =>
  process.env.AGENT_HEARTBEAT_PATH || "/data/agent_heartbeat.json";

const resolveHeartbeatTtl = () => {
  const raw = process.env.AGENT_HEARTBEAT_TTL_SECONDS;
  const parsed = raw ? Number(raw) : 30;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 30;
  }
  return parsed;
};

export async function GET() {
  const heartbeatPath = resolveHeartbeatPath();
  const ttlSeconds = resolveHeartbeatTtl();

  try {
    const content = await readFile(heartbeatPath, "utf8");
    const payload = JSON.parse(content) as {
      timestamp?: string;
      unix?: number;
    };
    const lastSeen = payload.unix
      ? new Date(payload.unix * 1000)
      : payload.timestamp
      ? new Date(payload.timestamp)
      : null;

    if (!lastSeen || Number.isNaN(lastSeen.getTime())) {
      return NextResponse.json({ healthy: false, reason: "invalid heartbeat" });
    }

    const ageSeconds = Math.floor((Date.now() - lastSeen.getTime()) / 1000);
    const healthy = ageSeconds <= ttlSeconds;

    return NextResponse.json({
      healthy,
      ageSeconds,
      ttlSeconds,
      lastSeen: lastSeen.toISOString()
    });
  } catch (error: any) {
    return NextResponse.json({ healthy: false, error: error.message });
  }
}
