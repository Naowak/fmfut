import { NextResponse } from "next/server";
import { loadPlayersFromCsv } from "@/lib/data/load-players";
import {
  ANALYZED_STATS,
  type AnalyzedStat,
  type MonteCarloAggregate,
  type MonteCarloResponse,
} from "@/lib/analytics/types";
import { simulateMatch } from "@/lib/game/engine";
import {
  assertSelectionPlayersExist,
  DEFAULT_AWAY_SELECTION,
  DEFAULT_HOME_SELECTION,
} from "@/lib/game/sample-teams";
import type {
  PlayerCard,
  TeamMatchStats,
  TeamSelection,
} from "@/lib/game/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  runs?: number;
  seedPrefix?: string;
  sensitivity?: boolean;
};

type MatchSummary = {
  homeScore: number;
  awayScore: number;
  home: TeamMatchStats;
  away: TeamMatchStats;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const runs = clampInteger(body.runs ?? 50, 10, 300);
    const seedPrefix = body.seedPrefix?.trim() || "mc";
    const includeSensitivity = body.sensitivity ?? true;

    const players = loadPlayersFromCsv();
    assertSelectionPlayersExist(DEFAULT_HOME_SELECTION, players);
    assertSelectionPlayersExist(DEFAULT_AWAY_SELECTION, players);

    const startedAt = performance.now();
    const baselineMatches = runBatch({
      players,
      home: DEFAULT_HOME_SELECTION,
      away: DEFAULT_AWAY_SELECTION,
      seedPrefix,
      runs,
    });

    const baseline = aggregate(baselineMatches);
    const sensitivity = includeSensitivity
      ? ANALYZED_STATS.map((stat) =>
          runSensitivityExperiment({
            stat,
            boost: 10,
            players,
            seedPrefix,
            runs,
            baselineMatches,
          }),
        )
      : [];

    const roleExperiment = includeSensitivity
      ? runRoleExperiment({
          players,
          seedPrefix,
          runs,
          configuredMatches: baselineMatches,
        })
      : null;

    const response: MonteCarloResponse = {
      seedPrefix,
      runs,
      durationMs: Math.round(performance.now() - startedAt),
      baseline,
      sensitivity,
      roleExperiment,
      notes: [
        "Les simulations analytiques tournent avec recordReplay=false : aucun frame Canvas n'est généré.",
        "Les expériences de sensibilité utilisent exactement les mêmes seeds que la baseline.",
        "Le boost de +10 est appliqué à la stat testée sur le onze titulaire domicile uniquement.",
        "Le moteur ne possède encore qu'une formation 4-3-3 : la comparaison de formations sera ajoutée quand plusieurs formations existeront.",
      ],
    };

    return NextResponse.json(response, {
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
            : "Erreur inconnue pendant l'analyse Monte-Carlo.",
      },
      { status: 500 },
    );
  }
}

function runBatch(params: {
  players: PlayerCard[];
  home: TeamSelection;
  away: TeamSelection;
  seedPrefix: string;
  runs: number;
}): MatchSummary[] {
  const matches: MatchSummary[] = [];

  for (let index = 0; index < params.runs; index += 1) {
    const result = simulateMatch({
      home: params.home,
      away: params.away,
      players: params.players,
      seed: `${params.seedPrefix}-${index}`,
      recordReplay: false,
    });

    matches.push({
      homeScore: result.result.homeScore,
      awayScore: result.result.awayScore,
      home: result.stats.home,
      away: result.stats.away,
    });
  }

  return matches;
}

function runSensitivityExperiment(params: {
  stat: AnalyzedStat;
  boost: number;
  players: PlayerCard[];
  seedPrefix: string;
  runs: number;
  baselineMatches: MatchSummary[];
}) {
  const playerMap = new Map(
    params.players.map((player) => [player.playerId, player]),
  );
  const statOffset = ANALYZED_STATS.indexOf(params.stat) + 1;
  const boostedPlayers = [...params.players];
  const boostedStarterIds: Record<string, number> = {};

  for (const [slot, originalPlayerId] of Object.entries(
    DEFAULT_HOME_SELECTION.starters,
  )) {
    const original = playerMap.get(originalPlayerId);
    if (!original) {
      throw new Error(
        `Joueur ${originalPlayerId} introuvable pour l'expérience ${params.stat}.`,
      );
    }

    // ID synthétique : le boost doit s'appliquer uniquement au joueur
    // de l'équipe domicile, même si le même player_id existe chez l'adversaire.
    const boostedPlayerId =
      -(originalPlayerId * 10 + statOffset);

    boostedPlayers.push({
      ...original,
      playerId: boostedPlayerId,
      stats: {
        ...original.stats,
        [params.stat]: Math.min(
          100,
          original.stats[params.stat] + params.boost,
        ),
      },
    });

    boostedStarterIds[slot] = boostedPlayerId;
  }

  const boostedHome: TeamSelection = {
    ...DEFAULT_HOME_SELECTION,
    starters: boostedStarterIds,
  };

  const boostedMatches = runBatch({
    players: boostedPlayers,
    home: boostedHome,
    away: DEFAULT_AWAY_SELECTION,
    seedPrefix: params.seedPrefix,
    runs: params.runs,
  });

  const baselineAggregate = aggregate(params.baselineMatches);
  const boostedAggregate = aggregate(boostedMatches);

  const baselineGoalDifference =
    baselineAggregate.averageHomeGoals -
    baselineAggregate.averageAwayGoals;
  const boostedGoalDifference =
    boostedAggregate.averageHomeGoals -
    boostedAggregate.averageAwayGoals;

  return {
    stat: params.stat,
    boost: params.boost,
    averageGoalDifferenceDelta: round(
      boostedGoalDifference - baselineGoalDifference,
      3,
    ),
    homeWinRateDelta: round(
      boostedAggregate.homeWinRate -
        baselineAggregate.homeWinRate,
      2,
    ),
  };
}

function runRoleExperiment(params: {
  players: PlayerCard[];
  seedPrefix: string;
  runs: number;
  configuredMatches: MatchSummary[];
}) {
  const neutralHome: TeamSelection = {
    ...DEFAULT_HOME_SELECTION,
    roles: Object.fromEntries(
      Object.keys(DEFAULT_HOME_SELECTION.starters).map((slot) => [
        slot,
        "NORMAL",
      ]),
    ) as TeamSelection["roles"],
  };

  const neutralMatches = runBatch({
    players: params.players,
    home: neutralHome,
    away: DEFAULT_AWAY_SELECTION,
    seedPrefix: params.seedPrefix,
    runs: params.runs,
  });

  const configured = aggregate(params.configuredMatches);
  const neutral = aggregate(neutralMatches);

  const configuredAverageGoalDifference =
    configured.averageHomeGoals -
    configured.averageAwayGoals;
  const neutralRolesAverageGoalDifference =
    neutral.averageHomeGoals -
    neutral.averageAwayGoals;

  return {
    configuredAverageGoalDifference: round(
      configuredAverageGoalDifference,
      3,
    ),
    neutralRolesAverageGoalDifference: round(
      neutralRolesAverageGoalDifference,
      3,
    ),
    delta: round(
      configuredAverageGoalDifference -
        neutralRolesAverageGoalDifference,
      3,
    ),
  };
}

function aggregate(matches: MatchSummary[]): MonteCarloAggregate {
  const count = matches.length;
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;

  const totals = {
    homeGoals: 0,
    awayGoals: 0,
    homeShots: 0,
    awayShots: 0,
    homePasses: 0,
    awayPasses: 0,
    homeDribbles: 0,
    awayDribbles: 0,
    homeProgressiveRuns: 0,
    awayProgressiveRuns: 0,
    homeDuelsWon: 0,
    awayDuelsWon: 0,
    homePossession: 0,
    awayPossession: 0,
  };

  for (const match of matches) {
    if (match.homeScore > match.awayScore) {
      homeWins += 1;
    } else if (match.homeScore < match.awayScore) {
      awayWins += 1;
    } else {
      draws += 1;
    }

    totals.homeGoals += match.homeScore;
    totals.awayGoals += match.awayScore;
    totals.homeShots += match.home.shots;
    totals.awayShots += match.away.shots;
    totals.homePasses += match.home.passesAttempted;
    totals.awayPasses += match.away.passesAttempted;
    totals.homeDribbles += match.home.dribbles;
    totals.awayDribbles += match.away.dribbles;
    totals.homeProgressiveRuns += match.home.progressiveRuns;
    totals.awayProgressiveRuns += match.away.progressiveRuns;
    totals.homeDuelsWon += match.home.duelsWon;
    totals.awayDuelsWon += match.away.duelsWon;
    totals.homePossession += match.home.possession;
    totals.awayPossession += match.away.possession;
  }

  return {
    matches: count,
    homeWins,
    draws,
    awayWins,
    homeWinRate: round((homeWins / count) * 100, 2),
    drawRate: round((draws / count) * 100, 2),
    awayWinRate: round((awayWins / count) * 100, 2),
    averageHomeGoals: average(totals.homeGoals, count),
    averageAwayGoals: average(totals.awayGoals, count),
    averageTotalGoals: average(
      totals.homeGoals + totals.awayGoals,
      count,
    ),
    averageHomeShots: average(totals.homeShots, count),
    averageAwayShots: average(totals.awayShots, count),
    averageHomePasses: average(totals.homePasses, count),
    averageAwayPasses: average(totals.awayPasses, count),
    averageHomeDribbles: average(totals.homeDribbles, count),
    averageAwayDribbles: average(totals.awayDribbles, count),
    averageHomeProgressiveRuns: average(
      totals.homeProgressiveRuns,
      count,
    ),
    averageAwayProgressiveRuns: average(
      totals.awayProgressiveRuns,
      count,
    ),
    averageHomeDuelsWon: average(totals.homeDuelsWon, count),
    averageAwayDuelsWon: average(totals.awayDuelsWon, count),
    averageHomePossession: average(totals.homePossession, count),
    averageAwayPossession: average(totals.awayPossession, count),
  };
}

function average(total: number, count: number): number {
  return round(total / Math.max(count, 1), 2);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clampInteger(
  value: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}
