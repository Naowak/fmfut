import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { runCalibrationSuite } from "@/lib/analytics/calibration";
import { loadPlayers } from "@/lib/data/load-players";
import { LruCache } from "@/lib/data/lru-cache";
import { teamSelectionSchema } from "@/lib/game/contract";
import {
  assertSelectionPlayersExist,
  DEFAULT_AWAY_SELECTION,
} from "@/lib/game/sample-teams";
import type { SquadPreviewResponse } from "@/lib/squad/api-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  team: teamSelectionSchema,
  runs: z.number().int().min(10).max(50).default(30),
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
    const hash = createHash("sha256").update(cacheKey).digest("hex").slice(0, 12);
    const report = runCalibrationSuite({
      players,
      home: body.team,
      away: DEFAULT_AWAY_SELECTION,
      runs: body.runs,
      seedPrefix: `squad-${hash}`,
    });
    const homeProfiles = report.individual.filter(
      (profile) => profile.team === "HOME" && profile.appearances > 0,
    );
    const payload: SquadPreviewResponse = {
      runs: body.runs,
      outcomes: {
        homeWinRate: report.outcomes.homeWinRate,
        drawRate: report.outcomes.drawRate,
        awayWinRate: report.outcomes.awayWinRate,
      },
      expected: {
        homeGoals: report.distributions.homeGoals.mean,
        awayGoals: report.distributions.awayGoals.mean,
        homeShots: report.distributions.homeShots.mean,
        awayShots: report.distributions.awayShots.mean,
        homePossession: report.distributions.homePossession.mean,
      },
      contributors: {
        attacking: [...homeProfiles]
          .sort((a, b) => b.per90.attackingContributions - a.per90.attackingContributions)
          .slice(0, 3),
        defensive: [...homeProfiles]
          .sort((a, b) => b.per90.defensiveActions - a.per90.defensiveActions)
          .slice(0, 3),
      },
      reliability: body.runs >= 30 ? "SOLID" : "EXPLORATORY",
    };
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
