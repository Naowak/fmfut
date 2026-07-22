import type {
  PlayerCard,
  Position,
  Role,
  TeamSelection,
} from "@/lib/game/types";

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

export interface SquadOpponent {
  id: string;
  nation: string;
  name: string;
  selection: TeamSelection;
  players: PlayerCard[];
}

export interface SquadTeamAverage {
  goals: number;
  shots: number;
  shotsOnTarget: number;
  shotConversion: number;
  passesAttempted: number;
  passesCompleted: number;
  passCompletion: number;
  backwardPasses: number;
  goalkeeperBackPasses: number;
  ownGoals: number;
  possession: number;
  dribbles: number;
  progressiveRuns: number;
  duelsWon: number;
  transitionShots: number;
  possessionRegains: number;
  tackles: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  offsides: number;
  throwIns: number;
  corners: number;
  goalKicks: number;
  freeKicks: number;
  penalties: number;
  goalkeeperSaves: number;
  goalsFromSetPieces: number;
  substitutions: number;
  averageStarterEnergy: number;
}

export interface SquadPlayerAverage {
  playerId: number;
  playerName: string;
  shirtNumber: number;
  position: Position | null;
  role: Role;
  starter: boolean;
  appearanceRate: number;
  minutesPlayed: number;
  distanceCovered: number;
  touches: number;
  goals: number;
  assists: number;
  ownGoals: number;
  shots: number;
  shotsOnTarget: number;
  shotAccuracy: number;
  passesAttempted: number;
  passesCompleted: number;
  passCompletion: number;
  dribbles: number;
  progressiveRuns: number;
  tackles: number;
  interceptions: number;
  duelsWon: number;
  possessionRegains: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  offsides: number;
  goalkeeperSaves: number;
  energyStart: number;
  energyEnd: number;
}

export interface SquadPreviewResponse {
  runs: number;
  teamName: string;
  opponentName: string;
  outcomes: {
    homeWinRate: number;
    drawRate: number;
    awayWinRate: number;
  };
  home: SquadTeamAverage;
  away: SquadTeamAverage;
  distributions: {
    homeGoals: SquadDistribution;
    awayGoals: SquadDistribution;
    goalDifference: SquadDistribution;
    homeShots: SquadDistribution;
    homePossession: SquadDistribution;
  };
  players: SquadPlayerAverage[];
  reliability: "LOW" | "MEDIUM" | "HIGH";
}

export interface SquadDistribution {
  mean: number;
  p05: number;
  median: number;
  p95: number;
}
