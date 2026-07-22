import { round } from "@/lib/game/config";
import type { PlayerMatchStats, Position, TeamSide } from "@/lib/game/types";
import type {
  DecisionMetricsPer90,
  PlayerDecisionProfile,
  PositionDecisionProfile,
  SampleReliability,
} from "./types";

type Totals = {
  minutes: number;
  energyEnd: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  touches: number;
  passesAttempted: number;
  passesCompleted: number;
  dribbles: number;
  progressiveRuns: number;
  tackles: number;
  interceptions: number;
  duelsWon: number;
  possessionRegains: number;
  fouls: number;
  cards: number;
  goalkeeperSaves: number;
  distanceCovered: number;
};

export function aggregatePlayerPerformance(
  matches: Array<{ home: PlayerMatchStats[]; away: PlayerMatchStats[] }>,
): PlayerDecisionProfile[] {
  const grouped = new Map<string, PlayerMatchStats[]>();
  for (const match of matches) {
    for (const stat of [...match.home, ...match.away]) {
      const key = `${stat.team}:${stat.playerId}`;
      const rows = grouped.get(key) ?? [];
      rows.push(stat);
      grouped.set(key, rows);
    }
  }

  return [...grouped.entries()]
    .map(([key, rows]) => playerProfile(key, rows))
    .sort((a, b) =>
      a.team.localeCompare(b.team) ||
      b.sampledMinutes - a.sampledMinutes ||
      a.playerName.localeCompare(b.playerName),
    );
}

export function aggregatePositionPerformance(
  matches: Array<{ home: PlayerMatchStats[]; away: PlayerMatchStats[] }>,
): PositionDecisionProfile[] {
  const grouped = new Map<Position, PlayerMatchStats[]>();
  for (const match of matches) {
    for (const stat of [...match.home, ...match.away]) {
      if (!stat.position || stat.minutesPlayed <= 0) continue;
      const rows = grouped.get(stat.position) ?? [];
      rows.push(stat);
      grouped.set(stat.position, rows);
    }
  }
  return [...grouped.entries()]
    .map(([position, rows]) => {
      const totals = totalRows(rows);
      return {
        position,
        appearances: rows.filter((row) => row.minutesPlayed > 0).length,
        sampledMinutes: round(totals.minutes, 1),
        passCompletion: percentage(totals.passesCompleted, totals.passesAttempted),
        shotAccuracy: percentage(totals.shotsOnTarget, totals.shots),
        per90: toPer90(totals),
      };
    })
    .sort((a, b) => a.position.localeCompare(b.position));
}

function playerProfile(
  key: string,
  rows: PlayerMatchStats[],
): PlayerDecisionProfile {
  const representative = rows[0];
  const appearances = rows.filter((row) => row.minutesPlayed > 0);
  const totals = totalRows(appearances);
  return {
    key,
    playerId: representative.playerId,
    playerName: representative.playerName,
    team: representative.team as TeamSide,
    position:
      appearances.find((row) => row.position)?.position ??
      representative.position,
    starts: rows.filter((row) => row.starter).length,
    appearances: appearances.length,
    sampledMinutes: round(totals.minutes, 1),
    averageMinutes:
      appearances.length === 0 ? 0 : round(totals.minutes / appearances.length, 1),
    passCompletion: percentage(totals.passesCompleted, totals.passesAttempted),
    shotAccuracy: percentage(totals.shotsOnTarget, totals.shots),
    averageEnergyEnd:
      appearances.length === 0
        ? 100
        : round(totals.energyEnd / appearances.length, 1),
    disciplineRiskPer90: rate(totals.fouls + totals.cards, totals.minutes),
    reliability: reliabilityForMinutes(totals.minutes),
    per90: toPer90(totals),
  };
}

function totalRows(rows: PlayerMatchStats[]): Totals {
  return rows.reduce<Totals>(
    (total, row) => ({
      minutes: total.minutes + row.minutesPlayed,
      energyEnd: total.energyEnd + row.energyEnd,
      goals: total.goals + row.goals,
      assists: total.assists + row.assists,
      shots: total.shots + row.shots,
      shotsOnTarget: total.shotsOnTarget + row.shotsOnTarget,
      touches: total.touches + row.touches,
      passesAttempted: total.passesAttempted + row.passesAttempted,
      passesCompleted: total.passesCompleted + row.passesCompleted,
      dribbles: total.dribbles + row.dribbles,
      progressiveRuns: total.progressiveRuns + row.progressiveRuns,
      tackles: total.tackles + row.tackles,
      interceptions: total.interceptions + row.interceptions,
      duelsWon: total.duelsWon + row.duelsWon,
      possessionRegains: total.possessionRegains + row.possessionRegains,
      fouls: total.fouls + row.fouls,
      cards: total.cards + row.yellowCards + row.redCards,
      goalkeeperSaves: total.goalkeeperSaves + row.goalkeeperSaves,
      distanceCovered: total.distanceCovered + row.distanceCovered,
    }),
    emptyTotals(),
  );
}

function toPer90(totals: Totals): DecisionMetricsPer90 {
  const per90 = (value: number) => rate(value, totals.minutes);
  return {
    goals: per90(totals.goals),
    assists: per90(totals.assists),
    shots: per90(totals.shots),
    shotsOnTarget: per90(totals.shotsOnTarget),
    touches: per90(totals.touches),
    passesAttempted: per90(totals.passesAttempted),
    passesCompleted: per90(totals.passesCompleted),
    dribbles: per90(totals.dribbles),
    progressiveRuns: per90(totals.progressiveRuns),
    tackles: per90(totals.tackles),
    interceptions: per90(totals.interceptions),
    duelsWon: per90(totals.duelsWon),
    possessionRegains: per90(totals.possessionRegains),
    fouls: per90(totals.fouls),
    cards: per90(totals.cards),
    goalkeeperSaves: per90(totals.goalkeeperSaves),
    distanceCovered: per90(totals.distanceCovered),
    attackingContributions: per90(totals.goals + totals.assists),
    progressionActions: per90(totals.dribbles + totals.progressiveRuns),
    defensiveActions: per90(
      totals.tackles + totals.interceptions + totals.possessionRegains,
    ),
  };
}

function reliabilityForMinutes(minutes: number): SampleReliability {
  if (minutes >= 900) return "HIGH";
  if (minutes >= 270) return "MEDIUM";
  return "LOW";
}

function rate(value: number, minutes: number): number {
  return minutes <= 0 ? 0 : round((value / minutes) * 90, 2);
}

function percentage(numerator: number, denominator: number): number {
  return denominator <= 0 ? 0 : round((numerator / denominator) * 100, 1);
}

function emptyTotals(): Totals {
  return {
    minutes: 0,
    energyEnd: 0,
    goals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    touches: 0,
    passesAttempted: 0,
    passesCompleted: 0,
    dribbles: 0,
    progressiveRuns: 0,
    tackles: 0,
    interceptions: 0,
    duelsWon: 0,
    possessionRegains: 0,
    fouls: 0,
    cards: 0,
    goalkeeperSaves: 0,
    distanceCovered: 0,
  };
}
