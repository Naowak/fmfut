import type { PlayerDecisionProfile } from "@/lib/analytics/types";
import type { PlayerCard, Position, TeamSelection } from "@/lib/game/types";

export interface Quantiles {
  q10: number;
  q25: number;
  q50: number;
  q75: number;
  q90: number;
}

export interface PositionBenchmarks {
  position: Position;
  sampleSize: number;
  overall: Quantiles;
  stats: Record<keyof PlayerCard["stats"], Quantiles>;
}

export interface SquadBootstrapResponse {
  selection: TeamSelection;
  players: PlayerCard[];
}

export interface SquadPreviewResponse {
  runs: number;
  outcomes: {
    homeWinRate: number;
    drawRate: number;
    awayWinRate: number;
  };
  expected: {
    homeGoals: number;
    awayGoals: number;
    homeShots: number;
    awayShots: number;
    homePossession: number;
  };
  contributors: {
    attacking: PlayerDecisionProfile[];
    defensive: PlayerDecisionProfile[];
  };
  reliability: "EXPLORATORY" | "SOLID";
}
