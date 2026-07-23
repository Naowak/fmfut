import type { Position, SpatialSliceKey, TeamSide } from "@/lib/game/types";

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
  averageHomeBackwardPasses: number;
  averageAwayBackwardPasses: number;
  averageHomeGoalkeeperBackPasses: number;
  averageAwayGoalkeeperBackPasses: number;
  averageHomeOwnGoals: number;
  averageAwayOwnGoals: number;
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
  playerHeatmaps: Record<number, number[]>;
  heatmapSlices: Record<SpatialSliceKey, { allPlayersHeatmap: number[]; playerHeatmaps: Record<number, number[]> }>;
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
  goalDifferenceStdError: number;
  homeWinRateDelta: number;
  secondaryMetricLabel: string;
  secondaryMetricDelta: number;
}

export interface MicroBenchmarkResult {
  stat: AnalyzedStat;
  label: string;
  baseline: number;
  boosted: number;
  delta: number;
  unit: "%";
  samples: number;
}

export interface RoleExperimentResult {
  configuredAverageGoalDifference: number;
  neutralRolesAverageGoalDifference: number;
  delta: number;
}

export type SampleReliability = "LOW" | "MEDIUM" | "HIGH";

export interface DecisionMetricsPer90 {
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
  attackingContributions: number;
  progressionActions: number;
  defensiveActions: number;
}

export interface PlayerDecisionProfile {
  key: string;
  playerId: number;
  playerName: string;
  team: TeamSide;
  position: Position | null;
  starts: number;
  appearances: number;
  sampledMinutes: number;
  averageMinutes: number;
  passCompletion: number;
  shotAccuracy: number;
  averageEnergyEnd: number;
  disciplineRiskPer90: number;
  reliability: SampleReliability;
  per90: DecisionMetricsPer90;
}

export interface PositionDecisionProfile {
  position: Position;
  appearances: number;
  sampledMinutes: number;
  passCompletion: number;
  shotAccuracy: number;
  per90: DecisionMetricsPer90;
}

export interface MonteCarloResponse {
  seedPrefix: string;
  runs: number;
  durationMs: number;
  baseline: MonteCarloAggregate;
  spatial: MonteCarloSpatialAggregate | null;
  sensitivity: SensitivityResult[];
  microBenchmarks: MicroBenchmarkResult[];
  roleExperiment: RoleExperimentResult | null;
  individual: PlayerDecisionProfile[];
  positions: PositionDecisionProfile[];
  notes: string[];
}

export interface DistributionSummary {
  mean: number;
  standardDeviation: number;
  min: number;
  p05: number;
  median: number;
  p95: number;
  max: number;
}

export interface CalibrationReport {
  runs: number;
  seedPrefix: string;
  invariantViolations: string[];
  outcomes: {
    homeWinRate: number;
    drawRate: number;
    awayWinRate: number;
    averageGoalDifference: number;
  };
  distributions: {
    totalGoals: DistributionSummary;
    homeGoals: DistributionSummary;
    awayGoals: DistributionSummary;
    totalShots: DistributionSummary;
    homeShots: DistributionSummary;
    awayShots: DistributionSummary;
    totalPasses: DistributionSummary;
    totalFouls: DistributionSummary;
    totalCards: DistributionSummary;
    possessionDifference: DistributionSummary;
    homePossession: DistributionSummary;
  };
  individual: PlayerDecisionProfile[];
  positions: PositionDecisionProfile[];
  checks: CalibrationCheck[];
}

export interface CalibrationCheck {
  id: string;
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  passed: boolean;
}

export interface PairedExperimentResult {
  runs: number;
  averageBaselineGoalDifference: number;
  averageVariantGoalDifference: number;
  averageGoalDifferenceDelta: number;
  deltaStandardError: number;
  baselineWinRate: number;
  variantWinRate: number;
  winRateDelta: number;
}
