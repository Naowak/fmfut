import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { loadPlayers } from "@/lib/data/load-players";
import { LruCache } from "@/lib/data/lru-cache";
import { teamSelectionSchema } from "@/lib/game/contract";
import {
  assertSelectionPlayersExist,
  DEFAULT_AWAY_SELECTION,
} from "@/lib/game/sample-teams";
import type { SquadPreviewResponse } from "@/lib/squad/api-types";
import { runSquadMonteCarlo } from "@/lib/squad/monte-carlo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  team: teamSelectionSchema,
  opponent: teamSelectionSchema.optional(),
  runs: z.number().int().min(10).max(100).default(30),
}).strict();
const cache = new LruCache<string, SquadPreviewResponse>(100, 5 * 60_000);

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const cacheKey = JSON.stringify(body);
    const cached = cache.get(cacheKey);
    if (cached) return NextResponse.json(cached, { headers: { "X-Squad-Cache": "HIT" } });

    const players = loadPlayers();
    assertSelectionPlayersExist(body.team, players);
    const opponent = body.opponent ?? DEFAULT_AWAY_SELECTION;
    assertSelectionPlayersExist(opponent, players);
    const hash = createHash("sha256").update(cacheKey).digest("hex").slice(0, 12);
    const payload = runSquadMonteCarlo({
      players,
      team: body.team,
      opponent,
      runs: body.runs,
      seedPrefix: `squad-${hash}`,
    });
    cache.set(cacheKey, payload);
    return NextResponse.json(payload, { headers: { "X-Squad-Cache": "MISS" } });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Composition invalide.",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Aperçu impossible." },
      { status: 500 },
    );
  }
}
