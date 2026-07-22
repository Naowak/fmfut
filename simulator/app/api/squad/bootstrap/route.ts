import { NextResponse } from "next/server";
import { getPlayerRepository } from "@/lib/data/player-repository";
import { DEFAULT_HOME_SELECTION } from "@/lib/game/sample-teams";
import type { SquadBootstrapResponse } from "@/lib/squad/api-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const requested = new Set([
      ...Object.values(DEFAULT_HOME_SELECTION.starters),
      ...DEFAULT_HOME_SELECTION.bench,
    ]);
    const players = getPlayerRepository()
      .all()
      .filter((player) => requested.has(player.playerId));
    const payload: SquadBootstrapResponse = {
      selection: DEFAULT_HOME_SELECTION,
      players,
    };
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bootstrap impossible." },
      { status: 500 },
    );
  }
}
