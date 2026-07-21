import { NextResponse } from "next/server";
import { loadPlayersFromCsv } from "@/lib/data/load-players";
import {
  ANALYZED_STATS,
  type AnalyzedStat,
  type MonteCarloAggregate,
  type MonteCarloResponse,
  type MonteCarloSpatialAggregate,
  type SpatialTeamAggregate,
} from "@/lib/analytics/types";
import { simulateMatch } from "@/lib/game/engine";
import {
  assertSelectionPlayersExist,
  DEFAULT_AWAY_SELECTION,
  DEFAULT_HOME_SELECTION,
} from "@/lib/game/sample-teams";
import type {
  MatchSpatialAnalytics,
  PlayerCard,
  Position,
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
  firstHalfAddedTime: number;
  secondHalfAddedTime: number;
  spatial?: MatchSpatialAnalytics;
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
      recordSpatialAnalytics: true,
    });

    const baseline = aggregate(baselineMatches);
    const spatial = aggregateSpatial(baselineMatches);
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
      spatial,
      sensitivity,
      roleExperiment,
      notes: [
        "Les simulations analytiques tournent avec recordReplay=false : aucun frame Canvas n'est généré.",
        "La baseline enregistre un échantillon spatial par seconde logique pour les heatmaps et les métriques de bloc.",
        "Les expériences de sensibilité utilisent exactement les mêmes seeds que la baseline.",
        "Le boost de +10 est appliqué à la stat testée sur le onze titulaire domicile uniquement.",
        "La V0.6 mesure aussi les passes arrière, les remises au gardien et les buts contre son camp pour surveiller la construction basse.",
        "Un but n'est plus tiré probabilistiquement : il faut que la balle traverse physiquement la ligne entre les poteaux.",
        "Les heatmaps sont exprimées dans le repère de chaque équipe : notre but en bas, but adverse en haut.",
        "Le moteur ne possède encore qu'une formation 4-3-3 : la comparaison de formations sera ajoutée quand plusieurs formations existeront.",
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
    const result = simulateMatch({
      home: params.home,
      away: params.away,
      players: params.players,
      seed: `${params.seedPrefix}-${index}`,
      recordReplay: false,
      recordSpatialAnalytics: params.recordSpatialAnalytics ?? false,
    });

    matches.push({
      homeScore: result.result.homeScore,
      awayScore: result.result.awayScore,
      home: result.stats.home,
      away: result.stats.away,
      firstHalfAddedTime: result.replay.addedTime.firstHalfMinutes,
      secondHalfAddedTime: result.replay.addedTime.secondHalfMinutes,
      spatial: result.analytics,
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

  const secondary = sensitivitySecondaryMetric(
    params.stat,
    baselineAggregate,
    boostedAggregate,
  );

  return {
    stat: params.stat,
    boost: params.boost,
    averageGoalDifferenceDelta: round(
      boostedGoalDifference - baselineGoalDifference,
      3,
    ),
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

  for (const team of teams) {
    team.allPlayersHeatmap.forEach((value, index) => {
      allPlayersHeatmap[index] += value;
    });

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

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}
