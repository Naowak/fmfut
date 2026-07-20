import type { Position } from "@/lib/game/types";

export const ANALYZED_STATS = [
  "speed",
  "shooting",
  "passing",
  "physical",
  "technique",
  "intelligence",
] as const;

export type AnalyzedStat = (typeof ANALYZED_STATS)[number];

export interface MonteCarloAggregate {
  matches: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  homeWinRate: number;
  drawRate: number;
  awayWinRate: number;
  averageHomeGoals: number;
  averageAwayGoals: number;
  averageTotalGoals: number;
  averageHomeShots: number;
  averageAwayShots: number;
  averageHomePasses: number;
  averageAwayPasses: number;
  averageHomeDribbles: number;
  averageAwayDribbles: number;
  averageHomeProgressiveRuns: number;
  averageAwayProgressiveRuns: number;
  averageHomeDuelsWon: number;
  averageAwayDuelsWon: number;
  averageHomeTransitionShots: number;
  averageAwayTransitionShots: number;
  averageHomePossessionRegains: number;
  averageAwayPossessionRegains: number;
  averageHomePassCompletion: number;
  averageAwayPassCompletion: number;
  averageHomeShotConversion: number;
  averageAwayShotConversion: number;
  averageHomeOffsides: number;
  averageAwayOffsides: number;
  averageHomeSubstitutions: number;
  averageAwaySubstitutions: number;
  averageHomeThrowIns: number;
  averageAwayThrowIns: number;
  averageHomeCorners: number;
  averageAwayCorners: number;
  averageHomeGoalKicks: number;
  averageAwayGoalKicks: number;
  averageHomeFreeKicks: number;
  averageAwayFreeKicks: number;
  averageHomePenalties: number;
  averageAwayPenalties: number;
  averageHomeGoalkeeperSaves: number;
  averageAwayGoalkeeperSaves: number;
  averageFirstHalfAddedTime: number;
  averageSecondHalfAddedTime: number;
  averageHomePossession: number;
  averageAwayPossession: number;
  averageHomeStarterEnergy: number;
  averageAwayStarterEnergy: number;
}

export interface SpatialTeamAggregate {
  allPlayersHeatmap: number[];
  positionHeatmaps: Partial<Record<Position, number[]>>;
  averageBlockCenterProgress: number;
  averageBlockDepth: number;
  averageBlockWidth: number;
  averagePlayersInAttackingHalf: number;
  averageDefensiveLineProgress: number;
  averageBlockCenterInPossession: number;
  averageBlockCenterOutOfPossession: number;
  averageWidthInPossession: number;
  averageWidthOutOfPossession: number;
  blockCenterRange: number;
  blockCenterStdDev: number;
}

export interface MonteCarloSpatialAggregate {
  columns: number;
  rows: number;
  home: SpatialTeamAggregate;
  away: SpatialTeamAggregate;
}

export interface SensitivityResult {
  stat: AnalyzedStat;
  boost: number;
  averageGoalDifferenceDelta: number;
  homeWinRateDelta: number;
  secondaryMetricLabel: string;
  secondaryMetricDelta: number;
}

export interface RoleExperimentResult {
  configuredAverageGoalDifference: number;
  neutralRolesAverageGoalDifference: number;
  delta: number;
}

export interface MonteCarloResponse {
  seedPrefix: string;
  runs: number;
  durationMs: number;
  baseline: MonteCarloAggregate;
  spatial: MonteCarloSpatialAggregate | null;
  sensitivity: SensitivityResult[];
  roleExperiment: RoleExperimentResult | null;
  notes: string[];
}
