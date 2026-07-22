import { NextResponse } from "next/server";
import { loadPlayers } from "@/lib/data/load-players";
import { computePositionBenchmarks } from "@/lib/squad/benchmarks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cached: ReturnType<typeof computePositionBenchmarks> | null = null;

export async function GET() {
  cached ??= computePositionBenchmarks(loadPlayers());
  return NextResponse.json(cached, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
