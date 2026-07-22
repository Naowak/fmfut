import { round } from "@/lib/game/config";
import { simulateMatch } from "@/lib/game";
import type {
  MatchSimulationOutput,
  PlayerCard,
  PlayerMatchStats,
  TeamMatchStats,
  TeamSelection,
} from "@/lib/game/types";
import type {
  CalibrationReport,
  DistributionSummary,
  PairedExperimentResult,
} from "./types";
import {
  aggregatePlayerPerformance,
  aggregatePositionPerformance,
} from "./player-performance";

type PlayerStatKey = keyof PlayerCard["stats"];

export function createAdjustedSelection(params: {
  players: PlayerCard[];
  selection: TeamSelection;
  adjustments: Partial<Record<PlayerStatKey, number>>;
}): { players: PlayerCard[]; selection: TeamSelection } {
  const byId = new Map(params.players.map((player) => [player.playerId, player]));
  const clones: PlayerCard[] = [];
  const starters: Record<string, number> = {};
  let cloneIndex = 1;
  for (const [slot, playerId] of Object.entries(params.selection.starters)) {
    const source = byId.get(playerId);
    if (!source) throw new Error(`Joueur ${playerId} absent pour l'ajustement.`);
    const clonedId = -(source.playerId * 100 + cloneIndex);
    cloneIndex += 1;
    const stats = { ...source.stats };
    for (const [key, adjustment] of Object.entries(params.adjustments)) {
      const stat = key as PlayerStatKey;
      stats[stat] = Math.max(1, Math.min(100, stats[stat] + (adjustment ?? 0)));
    }
    clones.push({ ...source, playerId: clonedId, stats });
    starters[slot] = clonedId;
  }
  return {
    players: [...params.players, ...clones],
    selection: { ...params.selection, starters },
  };
}

export function runCalibrationSuite(params: {
  players: PlayerCard[];
  home: TeamSelection;
  away: TeamSelection;
  runs: number;
  seedPrefix: string;
  logicalSeconds?: number;
}): CalibrationReport {
  const outputs = runOutputs(params);
  const homeWins = outputs.filter(
    (output) => output.result.homeScore > output.result.awayScore,
  ).length;
  const draws = outputs.filter(
    (output) => output.result.homeScore === output.result.awayScore,
  ).length;
  const awayWins = outputs.length - homeWins - draws;
  const playerMatches = outputs.map((output) => output.playerStats);

  const report: CalibrationReport = {
    runs: outputs.length,
    seedPrefix: params.seedPrefix,
    invariantViolations: outputs.flatMap((output, index) =>
      validateMatchStatIntegrity(output).map(
        (violation) => `${params.seedPrefix}-${index}: ${violation}`,
      ),
    ),
    outcomes: {
      homeWinRate: percentage(homeWins, outputs.length),
      drawRate: percentage(draws, outputs.length),
      awayWinRate: percentage(awayWins, outputs.length),
      averageGoalDifference: mean(
        outputs.map(
          (output) => output.result.homeScore - output.result.awayScore,
        ),
      ),
    },
    distributions: {
      totalGoals: distribution(
        outputs.map(
          (output) => output.result.homeScore + output.result.awayScore,
        ),
      ),
      totalShots: distribution(
        outputs.map((output) => output.stats.home.shots + output.stats.away.shots),
      ),
      totalPasses: distribution(
        outputs.map(
          (output) =>
            output.stats.home.passesAttempted + output.stats.away.passesAttempted,
        ),
      ),
      totalFouls: distribution(
        outputs.map((output) => output.stats.home.fouls + output.stats.away.fouls),
      ),
      totalCards: distribution(
        outputs.map(
          (output) =>
            output.stats.home.yellowCards +
            output.stats.home.redCards +
            output.stats.away.yellowCards +
            output.stats.away.redCards,
        ),
      ),
      possessionDifference: distribution(
        outputs.map(
          (output) => output.stats.home.possession - output.stats.away.possession,
        ),
      ),
    },
    individual: aggregatePlayerPerformance(playerMatches),
    positions: aggregatePositionPerformance(playerMatches),
    checks: [],
  };
  report.checks = assessCalibrationTargets(report);
  return report;
}

export function assessCalibrationTargets(
  report: CalibrationReport,
): CalibrationReport["checks"] {
  const candidates = [
    ["total-goals", "Buts par match", report.distributions.totalGoals.mean, 2, 4],
    ["total-shots", "Tirs par match", report.distributions.totalShots.mean, 14, 24],
    ["total-passes", "Passes tentées par match", report.distributions.totalPasses.mean, 105, 145],
    ["total-fouls", "Fautes par match", report.distributions.totalFouls.mean, 1, 5],
    ["total-cards", "Cartons par match", report.distributions.totalCards.mean, 0.1, 1.5],
    [
      "home-balance",
      "Avantage moyen domicile (valeur absolue)",
      Math.abs(report.outcomes.averageGoalDifference),
      0,
      0.75,
    ],
    [
      "integrity",
      "Violations d'intégrité",
      report.invariantViolations.length,
      0,
      0,
    ],
  ] as const;
  return candidates.map(([id, label, value, minimum, maximum]) => ({
    id,
    label,
    value,
    minimum,
    maximum,
    passed: value >= minimum && value <= maximum,
  }));
}

export function runPairedExperiment(params: {
  players: PlayerCard[];
  baselineHome: TeamSelection;
  variantHome: TeamSelection;
  away: TeamSelection;
  runs: number;
  seedPrefix: string;
  logicalSeconds?: number;
}): PairedExperimentResult {
  const baseline = runOutputs({
    players: params.players,
    home: params.baselineHome,
    away: params.away,
    runs: params.runs,
    seedPrefix: params.seedPrefix,
    logicalSeconds: params.logicalSeconds,
  });
  const variant = runOutputs({
    players: params.players,
    home: params.variantHome,
    away: params.away,
    runs: params.runs,
    seedPrefix: params.seedPrefix,
    logicalSeconds: params.logicalSeconds,
  });
  const baselineDifferences = baseline.map(
    (output) => output.result.homeScore - output.result.awayScore,
  );
  const variantDifferences = variant.map(
    (output) => output.result.homeScore - output.result.awayScore,
  );
  const deltas = variantDifferences.map(
    (value, index) => value - baselineDifferences[index],
  );
  const baselineWins = baseline.filter(
    (output) => output.result.homeScore > output.result.awayScore,
  ).length;
  const variantWins = variant.filter(
    (output) => output.result.homeScore > output.result.awayScore,
  ).length;

  return {
    runs: params.runs,
    averageBaselineGoalDifference: mean(baselineDifferences),
    averageVariantGoalDifference: mean(variantDifferences),
    averageGoalDifferenceDelta: mean(deltas),
    deltaStandardError: standardError(deltas),
    baselineWinRate: percentage(baselineWins, params.runs),
    variantWinRate: percentage(variantWins, params.runs),
    winRateDelta: round(
      percentage(variantWins, params.runs) -
        percentage(baselineWins, params.runs),
      2,
    ),
  };
}

export function validateMatchStatIntegrity(
  output: MatchSimulationOutput,
): string[] {
  const violations: string[] = [];
  validateTeam("home", output.stats.home, output.playerStats.home, violations);
  validateTeam("away", output.stats.away, output.playerStats.away, violations);
  if (round(output.stats.home.possession + output.stats.away.possession, 1) !== 100) {
    violations.push("la possession totale ne vaut pas 100%");
  }
  const homeGoals = sum(output.playerStats.home, "goals");
  const awayGoals = sum(output.playerStats.away, "goals");
  const homeOwnGoals = sum(output.playerStats.home, "ownGoals");
  const awayOwnGoals = sum(output.playerStats.away, "ownGoals");
  if (homeGoals + awayOwnGoals !== output.result.homeScore) {
    violations.push("les buts individuels domicile ne correspondent pas au score");
  }
  if (awayGoals + homeOwnGoals !== output.result.awayScore) {
    violations.push("les buts individuels extérieur ne correspondent pas au score");
  }
  if (sum(output.playerStats.home, "assists") > output.result.homeScore) {
    violations.push("plus de passes décisives domicile que de buts");
  }
  if (sum(output.playerStats.away, "assists") > output.result.awayScore) {
    violations.push("plus de passes décisives extérieur que de buts");
  }
  return violations;
}

function validateTeam(
  label: string,
  team: TeamMatchStats,
  players: PlayerMatchStats[],
  violations: string[],
): void {
  if (new Set(players.map((player) => player.runtimeId)).size !== players.length) {
    violations.push(`${label}: runtimeId individuels dupliqués`);
  }
  if (team.passesCompleted > team.passesAttempted) {
    violations.push(`${label}: passes réussies supérieures aux tentatives`);
  }
  if (team.shotsOnTarget > team.shots) {
    violations.push(`${label}: tirs cadrés supérieurs aux tirs`);
  }
  const mappings: Array<[keyof TeamMatchStats, keyof PlayerMatchStats]> = [
    ["shots", "shots"],
    ["shotsOnTarget", "shotsOnTarget"],
    ["passesAttempted", "passesAttempted"],
    ["passesCompleted", "passesCompleted"],
    ["ownGoals", "ownGoals"],
    ["dribbles", "dribbles"],
    ["progressiveRuns", "progressiveRuns"],
    ["duelsWon", "duelsWon"],
    ["possessionRegains", "possessionRegains"],
    ["tackles", "tackles"],
    ["fouls", "fouls"],
    ["yellowCards", "yellowCards"],
    ["redCards", "redCards"],
    ["offsides", "offsides"],
    ["goalkeeperSaves", "goalkeeperSaves"],
  ];
  for (const [teamKey, playerKey] of mappings) {
    if (team[teamKey] !== sum(players, playerKey)) {
      violations.push(`${label}: incohérence ${teamKey}/${playerKey}`);
    }
  }
  for (const player of players) {
    if (player.passesCompleted > player.passesAttempted) {
      violations.push(`${label}:${player.runtimeId}: passes incohérentes`);
    }
    if (player.shotsOnTarget > player.shots) {
      violations.push(`${label}:${player.runtimeId}: tirs incohérents`);
    }
    for (const value of Object.values(player)) {
      if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) {
        violations.push(`${label}:${player.runtimeId}: valeur négative ou non finie`);
        break;
      }
    }
  }
}

function runOutputs(params: {
  players: PlayerCard[];
  home: TeamSelection;
  away: TeamSelection;
  runs: number;
  seedPrefix: string;
  logicalSeconds?: number;
}): MatchSimulationOutput[] {
  return Array.from({ length: params.runs }, (_, index) =>
    simulateMatch({
      home: params.home,
      away: params.away,
      players: params.players,
      seed: `${params.seedPrefix}-${index}`,
      logicalSeconds: params.logicalSeconds,
      recordReplay: false,
      recordSpatialAnalytics: false,
    }),
  );
}

function distribution(values: number[]): DistributionSummary {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    mean: mean(values),
    standardDeviation: standardDeviation(values),
    min: sorted[0] ?? 0,
    p05: percentile(sorted, 0.05),
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted.at(-1) ?? 0,
  };
}

function percentile(sorted: number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

function mean(values: number[]): number {
  return values.length === 0
    ? 0
    : round(values.reduce((total, value) => total + value, 0) / values.length, 3);
}

function standardDeviation(values: number[]): number {
  if (values.length <= 1) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (values.length - 1);
  return round(Math.sqrt(variance), 3);
}

function standardError(values: number[]): number {
  return values.length === 0
    ? 0
    : round(standardDeviation(values) / Math.sqrt(values.length), 3);
}

function percentage(value: number, total: number): number {
  return total === 0 ? 0 : round((value / total) * 100, 2);
}

function sum(
  players: PlayerMatchStats[],
  key: keyof PlayerMatchStats,
): number {
  return players.reduce((total, player) => {
    const value = player[key];
    return total + (typeof value === "number" ? value : 0);
  }, 0);
}
