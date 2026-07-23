import { NextResponse } from "next/server";
import { loadPlayers } from "@/lib/data/load-players";
import {
  ANALYZED_STATS,
  type AnalyzedStat,
  type MonteCarloAggregate,
  type MonteCarloResponse,
  type MonteCarloSpatialAggregate,
  type SpatialTeamAggregate,
} from "@/lib/analytics/types";
import { runMicroBenchmarks } from "@/lib/analytics/micro-benchmarks";
import {
  aggregatePlayerPerformance,
  aggregatePositionPerformance,
} from "@/lib/analytics/player-performance";
import { simulateMatch } from "@/lib/game";
import {
  assertSelectionPlayersExist,
} from "@/lib/game/sample-teams";
import { createInternationalTeamContext } from "@/lib/squad/opponents";
import type {
  MatchSpatialAnalytics,
  PlayerMatchStats,
  PlayerCard,
  Position,
  TeamMatchStats,
  TeamSelection,
  SpatialSliceKey,
} from "@/lib/game/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  runs?: number;
  seedPrefix?: string;
  home?: TeamSelection;
  away?: TeamSelection;
};

type MatchSummary = {
  homeScore: number;
  awayScore: number;
  home: TeamMatchStats;
  away: TeamMatchStats;
  firstHalfAddedTime: number;
  secondHalfAddedTime: number;
  spatial?: MatchSpatialAnalytics;
  playerStats: { home: PlayerMatchStats[]; away: PlayerMatchStats[] };
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const runs = clampInteger(body.runs ?? 50, 10, 300);
    const seedPrefix = body.seedPrefix?.trim() || "mc";

    const context = createInternationalTeamContext(loadPlayers());
    const players = context.players;
    const home = body.home ?? context.opponents.find((team) => team.id === "france-2026")!.selection;
    const away = body.away ?? context.opponents.find((team) => team.id === "argentina-2026")!.selection;
    assertSelectionPlayersExist(home, players);
    assertSelectionPlayersExist(away, players);

    const startedAt = performance.now();
    const baselineMatches = runBatch({
      players,
      home,
      away,
      seedPrefix,
      runs,
      recordSpatialAnalytics: true,
    });

    const baseline = aggregate(baselineMatches);
    const spatial = aggregateSpatial(baselineMatches);
    const sensitivity = ANALYZED_STATS.map((stat) =>
          runSensitivityExperiment({
            stat,
            boost: 10,
            players,
            seedPrefix,
            runs,
            baselineMatches,
            home,
            away,
          }),
        );

    const roleExperiment = runRoleExperiment({
          players,
          seedPrefix,
          runs,
          configuredMatches: baselineMatches,
          home,
          away,
        });

    const microBenchmarks = runMicroBenchmarks(players, 10000);

    const response: MonteCarloResponse = {
      seedPrefix,
      runs,
      durationMs: Math.round(performance.now() - startedAt),
      baseline,
      spatial,
      sensitivity,
      microBenchmarks,
      roleExperiment,
      individual: aggregatePlayerPerformance(
        baselineMatches.map((match) => match.playerStats),
      ),
      positions: aggregatePositionPerformance(
        baselineMatches.map((match) => match.playerStats),
      ),
      notes: [
        "Les simulations analytiques tournent avec recordReplay=false : aucun frame Canvas n'est généré.",
        "La baseline enregistre un échantillon spatial par seconde logique pour les heatmaps et les métriques de bloc.",
        "Les expériences de sensibilité utilisent exactement les mêmes seeds que la baseline.",
        "Le boost de +10 est appliqué à la stat testée sur le onze titulaire de l’équipe 1 uniquement.",
        "La V0.9 conserve les micro-benchmarks isolés pour vérifier qu'un +10 améliore directement la capacité concernée, indépendamment du chaos d'un match complet.",
        "Les deltas de buts affichent aussi leur erreur standard appariée : un delta du même ordre que son incertitude doit être interprété avec prudence.",
        "La V0.9 conserve les passes arrière, les remises au gardien et les buts contre son camp pour surveiller la construction basse.",
        "Un but n'est plus tiré probabilistiquement : il faut que la balle traverse physiquement la ligne entre les poteaux.",
        "La V0.9 conserve la scène au franchissement d'une ligne avant le repositionnement des touches, corners et six mètres.",
        "La V0.9 rend les gardiens plus conservateurs et évite l'enfermement répété des ailiers près du drapeau de corner.",
        "Les heatmaps sont exprimées dans le repère de chaque équipe : notre but en bas, but adverse en haut.",
        "Les équipes peuvent être comparées avec leurs formations et consignes tactiques respectives.",
      ],
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
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
  recordSpatialAnalytics?: boolean;
}): MatchSummary[] {
  const matches: MatchSummary[] = [];

  for (let index = 0; index < params.runs; index += 1) {
    const reversed = index % 2 === 1;
    const result = simulateMatch({
      home: reversed ? params.away : params.home,
      away: reversed ? params.home : params.away,
      players: params.players,
      seed: `${params.seedPrefix}-${index}`,
      recordReplay: false,
      recordSpatialAnalytics: params.recordSpatialAnalytics ?? false,
    });

    matches.push({
      homeScore: reversed ? result.result.awayScore : result.result.homeScore,
      awayScore: reversed ? result.result.homeScore : result.result.awayScore,
      home: reversed ? result.stats.away : result.stats.home,
      away: reversed ? result.stats.home : result.stats.away,
      firstHalfAddedTime: result.replay.addedTime.firstHalfMinutes,
      secondHalfAddedTime: result.replay.addedTime.secondHalfMinutes,
      spatial: result.analytics ? {
        columns: result.analytics.columns,
        rows: result.analytics.rows,
        home: reversed ? result.analytics.away : result.analytics.home,
        away: reversed ? result.analytics.home : result.analytics.away,
      } : undefined,
      playerStats: {
        home: (reversed ? result.playerStats.away : result.playerStats.home).map((row) => ({ ...row, team: "HOME" as const })),
        away: (reversed ? result.playerStats.home : result.playerStats.away).map((row) => ({ ...row, team: "AWAY" as const })),
      },
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
  home: TeamSelection;
  away: TeamSelection;
}) {
  const playerMap = new Map(
    params.players.map((player) => [player.playerId, player]),
  );
  const statOffset = ANALYZED_STATS.indexOf(params.stat) + 1;
  const boostedPlayers = [...params.players];
  const boostedStarterIds: Record<string, number> = {};

  for (const [slot, originalPlayerId] of Object.entries(
    params.home.starters,
  )) {
    const original = playerMap.get(originalPlayerId);
    if (!original) {
      throw new Error(
        `Joueur ${originalPlayerId} introuvable pour l'expérience ${params.stat}.`,
      );
    }

    const boostedPlayerId = -(originalPlayerId * 10 + statOffset);

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
    ...params.home,
    starters: boostedStarterIds,
  };

  const boostedMatches = runBatch({
    players: boostedPlayers,
    home: boostedHome,
    away: params.away,
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

  const secondary = sensitivitySecondaryMetric(
    params.stat,
    baselineAggregate,
    boostedAggregate,
  );

  const pairedGoalDifferenceDeltas = boostedMatches.map((match, index) => {
    const baselineMatch = params.baselineMatches[index];
    return (match.homeScore - match.awayScore) -
      (baselineMatch.homeScore - baselineMatch.awayScore);
  });
  const goalDifferenceStdError = standardError(pairedGoalDifferenceDeltas);

  return {
    stat: params.stat,
    boost: params.boost,
    averageGoalDifferenceDelta: round(
      boostedGoalDifference - baselineGoalDifference,
      3,
    ),
    goalDifferenceStdError: round(goalDifferenceStdError, 3),
    homeWinRateDelta: round(
      boostedAggregate.homeWinRate - baselineAggregate.homeWinRate,
      2,
    ),
    secondaryMetricLabel: secondary.label,
    secondaryMetricDelta: round(secondary.delta, 2),
  };
}

function sensitivitySecondaryMetric(
  stat: AnalyzedStat,
  baseline: MonteCarloAggregate,
  boosted: MonteCarloAggregate,
): { label: string; delta: number } {
  switch (stat) {
    case "passing":
      return {
        label: "réussite passes",
        delta: boosted.averageHomePassCompletion - baseline.averageHomePassCompletion,
      };
    case "shooting":
      return {
        label: "conversion tirs",
        delta: boosted.averageHomeShotConversion - baseline.averageHomeShotConversion,
      };
    case "speed":
      return {
        label: "tirs transition / match",
        delta: boosted.averageHomeTransitionShots - baseline.averageHomeTransitionShots,
      };
    case "physical":
      return {
        label: "duels gagnés / match",
        delta: boosted.averageHomeDuelsWon - baseline.averageHomeDuelsWon,
      };
    case "technique":
      return {
        label: "réussite passes",
        delta: boosted.averageHomePassCompletion - baseline.averageHomePassCompletion,
      };
    case "intelligence":
      return {
        label: "hors-jeu évités / match",
        delta: baseline.averageHomeOffsides - boosted.averageHomeOffsides,
      };
  }
}

function runRoleExperiment(params: {
  players: PlayerCard[];
  seedPrefix: string;
  runs: number;
  configuredMatches: MatchSummary[];
  home: TeamSelection;
  away: TeamSelection;
}) {
  const neutralHome: TeamSelection = {
    ...params.home,
    roles: Object.fromEntries(
      Object.keys(params.home.starters).map((slot) => [
        slot,
        "NORMAL",
      ]),
    ) as TeamSelection["roles"],
  };

  const neutralMatches = runBatch({
    players: params.players,
    home: neutralHome,
    away: params.away,
    seedPrefix: params.seedPrefix,
    runs: params.runs,
  });

  const configured = aggregate(params.configuredMatches);
  const neutral = aggregate(neutralMatches);

  const configuredAverageGoalDifference =
    configured.averageHomeGoals - configured.averageAwayGoals;
  const neutralRolesAverageGoalDifference =
    neutral.averageHomeGoals - neutral.averageAwayGoals;

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
    homeBackwardPasses: 0,
    awayBackwardPasses: 0,
    homeGoalkeeperBackPasses: 0,
    awayGoalkeeperBackPasses: 0,
    homeOwnGoals: 0,
    awayOwnGoals: 0,
    homePassesCompleted: 0,
    awayPassesCompleted: 0,
    homeDribbles: 0,
    awayDribbles: 0,
    homeProgressiveRuns: 0,
    awayProgressiveRuns: 0,
    homeDuelsWon: 0,
    awayDuelsWon: 0,
    homeTransitionShots: 0,
    awayTransitionShots: 0,
    homePossessionRegains: 0,
    awayPossessionRegains: 0,
    homeOffsides: 0,
    awayOffsides: 0,
    homeSubstitutions: 0,
    awaySubstitutions: 0,
    homeThrowIns: 0,
    awayThrowIns: 0,
    homeCorners: 0,
    awayCorners: 0,
    homeGoalKicks: 0,
    awayGoalKicks: 0,
    homeFreeKicks: 0,
    awayFreeKicks: 0,
    homePenalties: 0,
    awayPenalties: 0,
    homeGoalkeeperSaves: 0,
    awayGoalkeeperSaves: 0,
    firstHalfAddedTime: 0,
    secondHalfAddedTime: 0,
    homePossession: 0,
    awayPossession: 0,
    homeStarterEnergy: 0,
    awayStarterEnergy: 0,
  };

  for (const match of matches) {
    if (match.homeScore > match.awayScore) homeWins += 1;
    else if (match.homeScore < match.awayScore) awayWins += 1;
    else draws += 1;

    totals.homeGoals += match.homeScore;
    totals.awayGoals += match.awayScore;
    totals.homeShots += match.home.shots;
    totals.awayShots += match.away.shots;
    totals.homePasses += match.home.passesAttempted;
    totals.awayPasses += match.away.passesAttempted;
    totals.homeBackwardPasses += match.home.backwardPasses;
    totals.awayBackwardPasses += match.away.backwardPasses;
    totals.homeGoalkeeperBackPasses += match.home.goalkeeperBackPasses;
    totals.awayGoalkeeperBackPasses += match.away.goalkeeperBackPasses;
    totals.homeOwnGoals += match.home.ownGoals;
    totals.awayOwnGoals += match.away.ownGoals;
    totals.homePassesCompleted += match.home.passesCompleted;
    totals.awayPassesCompleted += match.away.passesCompleted;
    totals.homeDribbles += match.home.dribbles;
    totals.awayDribbles += match.away.dribbles;
    totals.homeProgressiveRuns += match.home.progressiveRuns;
    totals.awayProgressiveRuns += match.away.progressiveRuns;
    totals.homeDuelsWon += match.home.duelsWon;
    totals.awayDuelsWon += match.away.duelsWon;
    totals.homeTransitionShots += match.home.transitionShots;
    totals.awayTransitionShots += match.away.transitionShots;
    totals.homePossessionRegains += match.home.possessionRegains;
    totals.awayPossessionRegains += match.away.possessionRegains;
    totals.homeOffsides += match.home.offsides;
    totals.awayOffsides += match.away.offsides;
    totals.homeSubstitutions += match.home.substitutions;
    totals.awaySubstitutions += match.away.substitutions;
    totals.homeThrowIns += match.home.throwIns;
    totals.awayThrowIns += match.away.throwIns;
    totals.homeCorners += match.home.corners;
    totals.awayCorners += match.away.corners;
    totals.homeGoalKicks += match.home.goalKicks;
    totals.awayGoalKicks += match.away.goalKicks;
    totals.homeFreeKicks += match.home.freeKicks;
    totals.awayFreeKicks += match.away.freeKicks;
    totals.homePenalties += match.home.penalties;
    totals.awayPenalties += match.away.penalties;
    totals.homeGoalkeeperSaves += match.home.goalkeeperSaves;
    totals.awayGoalkeeperSaves += match.away.goalkeeperSaves;
    totals.firstHalfAddedTime += match.firstHalfAddedTime;
    totals.secondHalfAddedTime += match.secondHalfAddedTime;
    totals.homePossession += match.home.possession;
    totals.awayPossession += match.away.possession;
    totals.homeStarterEnergy += match.home.averageStarterEnergy;
    totals.awayStarterEnergy += match.away.averageStarterEnergy;
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
    averageTotalGoals: average(totals.homeGoals + totals.awayGoals, count),
    averageHomeShots: average(totals.homeShots, count),
    averageAwayShots: average(totals.awayShots, count),
    averageHomePasses: average(totals.homePasses, count),
    averageAwayPasses: average(totals.awayPasses, count),
    averageHomeBackwardPasses: average(totals.homeBackwardPasses, count),
    averageAwayBackwardPasses: average(totals.awayBackwardPasses, count),
    averageHomeGoalkeeperBackPasses: average(totals.homeGoalkeeperBackPasses, count),
    averageAwayGoalkeeperBackPasses: average(totals.awayGoalkeeperBackPasses, count),
    averageHomeOwnGoals: average(totals.homeOwnGoals, count),
    averageAwayOwnGoals: average(totals.awayOwnGoals, count),
    averageHomeDribbles: average(totals.homeDribbles, count),
    averageAwayDribbles: average(totals.awayDribbles, count),
    averageHomeProgressiveRuns: average(totals.homeProgressiveRuns, count),
    averageAwayProgressiveRuns: average(totals.awayProgressiveRuns, count),
    averageHomeDuelsWon: average(totals.homeDuelsWon, count),
    averageAwayDuelsWon: average(totals.awayDuelsWon, count),
    averageHomeTransitionShots: average(totals.homeTransitionShots, count),
    averageAwayTransitionShots: average(totals.awayTransitionShots, count),
    averageHomePossessionRegains: average(totals.homePossessionRegains, count),
    averageAwayPossessionRegains: average(totals.awayPossessionRegains, count),
    averageHomePassCompletion: round(
      (totals.homePassesCompleted / Math.max(totals.homePasses, 1)) * 100,
      2,
    ),
    averageAwayPassCompletion: round(
      (totals.awayPassesCompleted / Math.max(totals.awayPasses, 1)) * 100,
      2,
    ),
    averageHomeShotConversion: round(
      (totals.homeGoals / Math.max(totals.homeShots, 1)) * 100,
      2,
    ),
    averageAwayShotConversion: round(
      (totals.awayGoals / Math.max(totals.awayShots, 1)) * 100,
      2,
    ),
    averageHomeOffsides: average(totals.homeOffsides, count),
    averageAwayOffsides: average(totals.awayOffsides, count),
    averageHomeSubstitutions: average(totals.homeSubstitutions, count),
    averageAwaySubstitutions: average(totals.awaySubstitutions, count),
    averageHomeThrowIns: average(totals.homeThrowIns, count),
    averageAwayThrowIns: average(totals.awayThrowIns, count),
    averageHomeCorners: average(totals.homeCorners, count),
    averageAwayCorners: average(totals.awayCorners, count),
    averageHomeGoalKicks: average(totals.homeGoalKicks, count),
    averageAwayGoalKicks: average(totals.awayGoalKicks, count),
    averageHomeFreeKicks: average(totals.homeFreeKicks, count),
    averageAwayFreeKicks: average(totals.awayFreeKicks, count),
    averageHomePenalties: average(totals.homePenalties, count),
    averageAwayPenalties: average(totals.awayPenalties, count),
    averageHomeGoalkeeperSaves: average(totals.homeGoalkeeperSaves, count),
    averageAwayGoalkeeperSaves: average(totals.awayGoalkeeperSaves, count),
    averageFirstHalfAddedTime: average(totals.firstHalfAddedTime, count),
    averageSecondHalfAddedTime: average(totals.secondHalfAddedTime, count),
    averageHomePossession: average(totals.homePossession, count),
    averageAwayPossession: average(totals.awayPossession, count),
    averageHomeStarterEnergy: average(totals.homeStarterEnergy, count),
    averageAwayStarterEnergy: average(totals.awayStarterEnergy, count),
  };
}

function aggregateSpatial(
  matches: MatchSummary[],
): MonteCarloSpatialAggregate | null {
  const spatialMatches = matches
    .map((match) => match.spatial)
    .filter((value): value is MatchSpatialAnalytics => Boolean(value));

  if (spatialMatches.length === 0) return null;

  const { columns, rows } = spatialMatches[0];
  return {
    columns,
    rows,
    home: aggregateSpatialTeam(spatialMatches.map((match) => match.home)),
    away: aggregateSpatialTeam(spatialMatches.map((match) => match.away)),
  };
}

function aggregateSpatialTeam(
  teams: MatchSpatialAnalytics["home"][],
): SpatialTeamAggregate {
  const cells = teams[0].allPlayersHeatmap.length;
  const allPlayersHeatmap = Array(cells).fill(0) as number[];
  const positionHeatmaps: Partial<Record<Position, number[]>> = {};
  const playerHeatmaps: Record<number, number[]> = {};
  const sliceKeys: SpatialSliceKey[] = ["ALL", "FIRST_HALF", "SECOND_HALF", "IN_POSSESSION", "OUT_OF_POSSESSION"];
  const heatmapSlices = Object.fromEntries(sliceKeys.map((key) => [key, {
    allPlayersHeatmap: Array(cells).fill(0) as number[],
    playerHeatmaps: {} as Record<number, number[]>,
  }])) as SpatialTeamAggregate["heatmapSlices"];

  for (const team of teams) {
    team.allPlayersHeatmap.forEach((value, index) => {
      allPlayersHeatmap[index] += value;
    });
    for (const [playerId, values] of Object.entries(team.playerHeatmaps)) {
      const target = playerHeatmaps[Number(playerId)] ?? (playerHeatmaps[Number(playerId)] = Array(cells).fill(0));
      values.forEach((value, index) => { target[index] += value; });
    }
    for (const key of sliceKeys) {
      const source = team.heatmapSlices[key];
      const target = heatmapSlices[key];
      source.allPlayersHeatmap.forEach((value, index) => { target.allPlayersHeatmap[index] += value; });
      for (const [playerId, values] of Object.entries(source.playerHeatmaps)) {
        const playerTarget = target.playerHeatmaps[Number(playerId)] ?? (target.playerHeatmaps[Number(playerId)] = Array(cells).fill(0));
        values.forEach((value, index) => { playerTarget[index] += value; });
      }
    }

    for (const [position, values] of Object.entries(team.positionHeatmaps)) {
      const key = position as Position;
      const target =
        positionHeatmaps[key] ??
        (positionHeatmaps[key] = Array(cells).fill(0) as number[]);
      values?.forEach((value, index) => {
        target[index] += value;
      });
    }
  }

  return {
    allPlayersHeatmap,
    playerHeatmaps,
    heatmapSlices,
    positionHeatmaps,
    averageBlockCenterProgress: averageMetric(teams, "averageBlockCenterProgress"),
    averageBlockDepth: averageMetric(teams, "averageBlockDepth"),
    averageBlockWidth: averageMetric(teams, "averageBlockWidth"),
    averagePlayersInAttackingHalf: averageMetric(teams, "averagePlayersInAttackingHalf"),
    averageDefensiveLineProgress: averageMetric(teams, "averageDefensiveLineProgress"),
    averageBlockCenterInPossession: averageMetric(teams, "averageBlockCenterInPossession"),
    averageBlockCenterOutOfPossession: averageMetric(teams, "averageBlockCenterOutOfPossession"),
    averageWidthInPossession: averageMetric(teams, "averageWidthInPossession"),
    averageWidthOutOfPossession: averageMetric(teams, "averageWidthOutOfPossession"),
    blockCenterRange: averageMetric(teams, "blockCenterRange"),
    blockCenterStdDev: averageMetric(teams, "blockCenterStdDev"),
  };
}

type SpatialNumericKey =
  | "averageBlockCenterProgress"
  | "averageBlockDepth"
  | "averageBlockWidth"
  | "averagePlayersInAttackingHalf"
  | "averageDefensiveLineProgress"
  | "averageBlockCenterInPossession"
  | "averageBlockCenterOutOfPossession"
  | "averageWidthInPossession"
  | "averageWidthOutOfPossession"
  | "blockCenterRange"
  | "blockCenterStdDev";

function averageMetric(
  teams: MatchSpatialAnalytics["home"][],
  key: SpatialNumericKey,
): number {
  const values = teams.map((team) => team[key]);
  return average(
    values.reduce((sum, value) => sum + value, 0),
    values.length,
  );
}

function average(total: number, count: number): number {
  return round(total / Math.max(count, 1), 2);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function standardError(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance) / Math.sqrt(values.length);
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}
