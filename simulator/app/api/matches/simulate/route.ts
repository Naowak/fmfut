import { NextResponse } from "next/server";
import { loadPlayersFromCsv } from "@/lib/data/load-players";
import { simulateMatch } from "@/lib/game/engine";
import {
  assertSelectionPlayersExist,
  DEFAULT_AWAY_SELECTION,
  DEFAULT_HOME_SELECTION,
} from "@/lib/game/sample-teams";
import type { MatchSimulationRequest } from "@/lib/game/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as MatchSimulationRequest;
    const players = loadPlayersFromCsv();

    const home = body.home ?? DEFAULT_HOME_SELECTION;
    const away = body.away ?? DEFAULT_AWAY_SELECTION;

    assertSelectionPlayersExist(home, players);
    assertSelectionPlayersExist(away, players);

    const seed =
      body.seed?.trim() ||
      `match-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const output = simulateMatch({
      home,
      away,
      players,
      seed,
      logicalSeconds: body.logicalSeconds,
    });

    return NextResponse.json(output, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur inconnue pendant la simulation.",
      },
      { status: 500 },
    );
  }
}
