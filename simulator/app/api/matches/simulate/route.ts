import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { loadPlayers } from "@/lib/data/load-players";
import {
  parseMatchSimulationRequest,
  simulateMatch,
} from "@/lib/game";
import {
  assertSelectionPlayersExist,
  DEFAULT_AWAY_SELECTION,
  DEFAULT_HOME_SELECTION,
} from "@/lib/game/sample-teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = parseMatchSimulationRequest(
      await request.json().catch(() => {
        throw new SyntaxError("Corps JSON invalide.");
      }),
    );
    const players = loadPlayers();

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
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Requête de simulation invalide.",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 },
      );
    }

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
