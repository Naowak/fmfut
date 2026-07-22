import { round } from "@/lib/game/config";
import { simulateMatch } from "@/lib/game";
import type {
  PlayerCard,
  PlayerMatchStats,
  TeamMatchStats,
  TeamSelection,
} from "@/lib/game/types";
import type {
  SquadPlayerAverage,
  SquadPreviewResponse,
  SquadTeamAverage,
} from "./api-types";

export function runSquadMonteCarlo(params: {
  players: PlayerCard[];
  team: TeamSelection;
  opponent: TeamSelection;
  runs: number;
  seedPrefix: string;
}): SquadPreviewResponse {
  const matches = Array.from({ length: params.runs }, (_, index) =>
    simulateMatch({
      home: params.team,
      away: params.opponent,
      players: params.players,
      seed: `${params.seedPrefix}-${index}`,
      recordReplay: false,
    }),
  );
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
    reliability: params.runs >= 50 ? "HIGH" : params.runs >= 30 ? "MEDIUM" : "LOW",
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
