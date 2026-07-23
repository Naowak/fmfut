import { round } from "@/lib/game/config";
import { simulateMatch } from "@/lib/game";
import type {
  PlayerCard,
  PlayerMatchStats,
  TeamSpatialAnalytics,
  SpatialSliceKey,
  TeamMatchStats,
  TeamSelection,
} from "@/lib/game/types";
import type {
  SquadPlayerAverage,
  SquadPreviewResponse,
  SquadSpatialSide,
  SquadTeamAverage,
} from "./api-types";

export function runSquadMonteCarlo(params: {
  players: PlayerCard[];
  team: TeamSelection;
  opponent: TeamSelection;
  runs: number;
  seedPrefix: string;
}): SquadPreviewResponse {
  const matches = Array.from({ length: params.runs }, (_, index) => {
    const reversed = index % 2 === 1;
    const output = simulateMatch({
      home: reversed ? params.opponent : params.team,
      away: reversed ? params.team : params.opponent,
      players: params.players,
      seed: `${params.seedPrefix}-${index}`,
      recordReplay: false,
      recordSpatialAnalytics: true,
    });
    return {
      result: {
        homeScore: reversed ? output.result.awayScore : output.result.homeScore,
        awayScore: reversed ? output.result.homeScore : output.result.awayScore,
      },
      stats: {
        home: reversed ? output.stats.away : output.stats.home,
        away: reversed ? output.stats.home : output.stats.away,
      },
      playerStats: {
        home: reversed ? output.playerStats.away : output.playerStats.home,
        away: reversed ? output.playerStats.home : output.playerStats.away,
      },
      analytics: output.analytics ? {
        columns: output.analytics.columns,
        rows: output.analytics.rows,
        home: reversed ? output.analytics.away : output.analytics.home,
        away: reversed ? output.analytics.home : output.analytics.away,
      } : undefined,
    };
  });
  const homeWins = matches.filter(
    (match) => match.result.homeScore > match.result.awayScore,
  ).length;
  const awayWins = matches.filter(
    (match) => match.result.homeScore < match.result.awayScore,
  ).length;
  const draws = params.runs - homeWins - awayWins;

  return {
    runs: params.runs,
    teamName: params.team.name,
    opponentName: params.opponent.name,
    outcomes: {
      homeWinRate: percentage(homeWins, params.runs),
      drawRate: percentage(draws, params.runs),
      awayWinRate: percentage(awayWins, params.runs),
    },
    home: averageTeam(
      matches.map((match) => ({ goals: match.result.homeScore, stats: match.stats.home })),
    ),
    away: averageTeam(
      matches.map((match) => ({ goals: match.result.awayScore, stats: match.stats.away })),
    ),
    distributions: {
      homeGoals: distribution(matches.map((match) => match.result.homeScore)),
      awayGoals: distribution(matches.map((match) => match.result.awayScore)),
      goalDifference: distribution(
        matches.map((match) => match.result.homeScore - match.result.awayScore),
      ),
      homeShots: distribution(matches.map((match) => match.stats.home.shots)),
      homePossession: distribution(
        matches.map((match) => match.stats.home.possession),
      ),
    },
    players: {
      home: aggregatePlayers(
        matches.flatMap((match) => match.playerStats.home),
        params.runs,
      ),
      away: aggregatePlayers(
        matches.flatMap((match) => match.playerStats.away),
        params.runs,
      ),
    },
    spatial: aggregateSpatial(matches),
    reliability: params.runs >= 50 ? "HIGH" : params.runs >= 30 ? "MEDIUM" : "LOW",
  };
}

function aggregateSpatial(
  matches: Array<{ analytics?: { columns: number; rows: number; home: TeamSpatialAnalytics; away: TeamSpatialAnalytics } }>,
) {
  const spatial = matches.map((match) => match.analytics).filter((value): value is NonNullable<typeof value> => Boolean(value));
  if (spatial.length === 0) return null;
  return {
    columns: spatial[0].columns,
    rows: spatial[0].rows,
    team: aggregateSpatialSide(spatial.map((item) => item.home)),
    opponent: aggregateSpatialSide(spatial.map((item) => item.away)),
  };
}

function aggregateSpatialSide(teams: TeamSpatialAnalytics[]): SquadSpatialSide {
  const cells = teams[0].allPlayersHeatmap.length;
  const allPlayersHeatmap = Array(cells).fill(0) as number[];
  const playerHeatmaps: Record<number, number[]> = {};
  const sliceKeys: SpatialSliceKey[] = ["ALL", "FIRST_HALF", "SECOND_HALF", "IN_POSSESSION", "OUT_OF_POSSESSION"];
  const heatmapSlices = Object.fromEntries(sliceKeys.map((key) => [key, {
    allPlayersHeatmap: Array(cells).fill(0) as number[],
    playerHeatmaps: {} as Record<number, number[]>,
  }])) as SquadSpatialSide["heatmapSlices"];
  for (const team of teams) {
    team.allPlayersHeatmap.forEach((value, index) => { allPlayersHeatmap[index] += value; });
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
  }
  const averageMetric = (key: keyof Pick<TeamSpatialAnalytics,
    "averageBlockCenterProgress" | "averageBlockDepth" | "averageBlockWidth" | "averagePlayersInAttackingHalf" | "averageDefensiveLineProgress">) =>
    round(teams.reduce((sum, team) => sum + team[key], 0) / teams.length, 3);
  return {
    allPlayersHeatmap,
    playerHeatmaps,
    heatmapSlices,
    averageBlockCenterProgress: averageMetric("averageBlockCenterProgress"),
    averageBlockDepth: averageMetric("averageBlockDepth"),
    averageBlockWidth: averageMetric("averageBlockWidth"),
    averagePlayersInAttackingHalf: averageMetric("averagePlayersInAttackingHalf"),
    averageDefensiveLineProgress: averageMetric("averageDefensiveLineProgress"),
  };
}

function averageTeam(
  matches: Array<{ goals: number; stats: TeamMatchStats }>,
): SquadTeamAverage {
  const count = matches.length;
  const sum = (selector: (match: (typeof matches)[number]) => number) =>
    round(matches.reduce((total, match) => total + selector(match), 0) / count, 2);
  const attemptedPasses = matches.reduce(
    (total, match) => total + match.stats.passesAttempted,
    0,
  );
  const completedPasses = matches.reduce(
    (total, match) => total + match.stats.passesCompleted,
    0,
  );
  const shots = matches.reduce((total, match) => total + match.stats.shots, 0);
  const goals = matches.reduce((total, match) => total + match.goals, 0);

  return {
    goals: round(goals / count, 2),
    shots: sum((match) => match.stats.shots),
    shotsOnTarget: sum((match) => match.stats.shotsOnTarget),
    shotConversion: percentage(goals, shots),
    passesAttempted: round(attemptedPasses / count, 2),
    passesCompleted: round(completedPasses / count, 2),
    passCompletion: percentage(completedPasses, attemptedPasses),
    backwardPasses: sum((match) => match.stats.backwardPasses),
    goalkeeperBackPasses: sum((match) => match.stats.goalkeeperBackPasses),
    ownGoals: sum((match) => match.stats.ownGoals),
    possession: sum((match) => match.stats.possession),
    dribbles: sum((match) => match.stats.dribbles),
    progressiveRuns: sum((match) => match.stats.progressiveRuns),
    duelsWon: sum((match) => match.stats.duelsWon),
    transitionShots: sum((match) => match.stats.transitionShots),
    possessionRegains: sum((match) => match.stats.possessionRegains),
    tackles: sum((match) => match.stats.tackles),
    fouls: sum((match) => match.stats.fouls),
    yellowCards: sum((match) => match.stats.yellowCards),
    redCards: sum((match) => match.stats.redCards),
    offsides: sum((match) => match.stats.offsides),
    throwIns: sum((match) => match.stats.throwIns),
    corners: sum((match) => match.stats.corners),
    goalKicks: sum((match) => match.stats.goalKicks),
    freeKicks: sum((match) => match.stats.freeKicks),
    penalties: sum((match) => match.stats.penalties),
    goalkeeperSaves: sum((match) => match.stats.goalkeeperSaves),
    goalsFromSetPieces: sum((match) => match.stats.goalsFromSetPieces),
    substitutions: sum((match) => match.stats.substitutions),
    averageStarterEnergy: sum((match) => match.stats.averageStarterEnergy),
  };
}

function aggregatePlayers(
  rows: PlayerMatchStats[],
  runs: number,
): SquadPlayerAverage[] {
  const grouped = new Map<number, PlayerMatchStats[]>();
  for (const row of rows) {
    const values = grouped.get(row.playerId) ?? [];
    values.push(row);
    grouped.set(row.playerId, values);
  }

  return [...grouped.values()]
    .map((playerRows) => {
      const representative = playerRows[0];
      const sum = (selector: (row: PlayerMatchStats) => number) =>
        round(playerRows.reduce((total, row) => total + selector(row), 0) / runs, 2);
      const passesAttempted = playerRows.reduce(
        (total, row) => total + row.passesAttempted,
        0,
      );
      const passesCompleted = playerRows.reduce(
        (total, row) => total + row.passesCompleted,
        0,
      );
      const shots = playerRows.reduce((total, row) => total + row.shots, 0);
      const shotsOnTarget = playerRows.reduce(
        (total, row) => total + row.shotsOnTarget,
        0,
      );
      return {
        playerId: representative.playerId,
        playerName: representative.playerName,
        shirtNumber: representative.shirtNumber,
        position: playerRows.find((row) => row.position)?.position ?? null,
        role: representative.role,
        starter: representative.starter,
        appearanceRate: percentage(
          playerRows.filter((row) => row.minutesPlayed > 0).length,
          runs,
        ),
        minutesPlayed: sum((row) => row.minutesPlayed),
        distanceCovered: sum((row) => row.distanceCovered),
        touches: sum((row) => row.touches),
        goals: sum((row) => row.goals),
        assists: sum((row) => row.assists),
        ownGoals: sum((row) => row.ownGoals),
        shots: sum((row) => row.shots),
        shotsOnTarget: sum((row) => row.shotsOnTarget),
        shotAccuracy: percentage(shotsOnTarget, shots),
        passesAttempted: round(passesAttempted / runs, 2),
        passesCompleted: round(passesCompleted / runs, 2),
        passCompletion: percentage(passesCompleted, passesAttempted),
        dribbles: sum((row) => row.dribbles),
        progressiveRuns: sum((row) => row.progressiveRuns),
        tackles: sum((row) => row.tackles),
        interceptions: sum((row) => row.interceptions),
        duelsWon: sum((row) => row.duelsWon),
        possessionRegains: sum((row) => row.possessionRegains),
        fouls: sum((row) => row.fouls),
        yellowCards: sum((row) => row.yellowCards),
        redCards: sum((row) => row.redCards),
        offsides: sum((row) => row.offsides),
        goalkeeperSaves: sum((row) => row.goalkeeperSaves),
        energyStart: sum((row) => row.energyStart),
        energyEnd: sum((row) => row.energyEnd),
      };
    })
    .sort((left, right) =>
      Number(right.starter) - Number(left.starter) ||
      right.minutesPlayed - left.minutesPlayed,
    );
}

function distribution(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const valueAt = (ratio: number) =>
    round(sorted[Math.floor((sorted.length - 1) * ratio)] ?? 0, 2);
  return {
    mean: round(values.reduce((sum, value) => sum + value, 0) / values.length, 2),
    p05: valueAt(0.05),
    median: valueAt(0.5),
    p95: valueAt(0.95),
  };
}

function percentage(value: number, total: number): number {
  return total <= 0 ? 0 : round((value / total) * 100, 2);
}
