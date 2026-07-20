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
  averageHomePossession: number;
  averageAwayPossession: number;
  averageHomeStarterEnergy: number;
  averageAwayStarterEnergy: number;
}

export interface SensitivityResult {
  stat: AnalyzedStat;
  boost: number;
  averageGoalDifferenceDelta: number;
  homeWinRateDelta: number;
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
  sensitivity: SensitivityResult[];
  roleExperiment: RoleExperimentResult | null;
  notes: string[];
}
