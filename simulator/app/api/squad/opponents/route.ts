import { NextResponse } from "next/server";
import { loadPlayers } from "@/lib/data/load-players";
import { createOpponentCatalog } from "@/lib/squad/opponents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cached: ReturnType<typeof createOpponentCatalog> | null = null;

export async function GET() {
  try {
    cached ??= createOpponentCatalog(loadPlayers());
    return NextResponse.json(cached, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Adversaires indisponibles." },
      { status: 500 },
    );
  }
}
