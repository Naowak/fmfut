export type Position =
  | "GK"
  | "LB"
  | "CB"
  | "RB"
  | "CDM"
  | "CM"
  | "CAM"
  | "LM"
  | "RM"
  | "LW"
  | "RW"
  | "ST";

export type Role =
  | "DEFENSIVE"
  | "NORMAL"
  | "OFFENSIVE"
  | "CREATOR"
  | "PRESSING";

export type TeamSide = "HOME" | "AWAY";
export type FormationId = "4-3-3" | "4-2-3-1" | "4-1-4-1";

export interface Vec2 {
  x: number;
  y: number;
}

export interface PlayerCard {
  playerId: number;
  shortName: string;
  longName: string;
  nationalityName: string;
  primaryPosition: Position;
  alternativePositions: Position[];
  overall: number;
  potential: number;
  stats: {
    speed: number;
    shooting: number;
    passing: number;
    physical: number;
    technique: number;
    intelligence: number;
  };
}

export interface FormationSlot {
  id: string;
  position: Position;
  anchor: Vec2;
  neighbors: string[];
}

export interface TeamSelection {
  name: string;
  formationId: FormationId;
  starters: Record<string, number>;
  bench: number[];
  roles?: Partial<Record<string, Role>>;
  tactics?: {
    blockHeight: "LOW" | "NORMAL" | "HIGH";
    buildUp: "SHORT" | "BALANCED" | "DIRECT";
    pressing?: "CAUTIOUS" | "BALANCED" | "AGGRESSIVE";
    width?: "NARROW" | "BALANCED" | "WIDE";
  };
}

export interface MatchSimulationRequest {
  contractVersion?: "1.0.0";
  seed?: string;
  logicalSeconds?: number;
  home?: TeamSelection;
  away?: TeamSelection;
}

export interface MatchSimulationInput {
  home: TeamSelection;
  away: TeamSelection;
  players: PlayerCard[];
  seed: string;
  logicalSeconds?: number;
  recordReplay?: boolean;
  recordSpatialAnalytics?: boolean;
}

export interface ReplayPlayerMeta {
  runtimeId: string;
  playerId: number;
  team: TeamSide;
  shortName: string;
  nationalityName: string;
  position: Position | null;
  shirtNumber: number;
}

export interface ReplayPlayerFrame {
  id: string;
  x: number;
  y: number;
  energy: number;
  active: boolean;
}

export interface MatchClock {
  period: 1 | 2;
  periodElapsed: number;
  regulationPeriodDuration: number;
}

export interface ReplayFrame {
  t: number;
  clock: MatchClock;
  ball: {
    x: number;
    y: number;
    ownerId: string | null;
    dead: boolean;
  };
  players: ReplayPlayerFrame[];
}

export type MatchEventType =
  | "KICKOFF"
  | "HALF_TIME"
  | "ADDED_TIME"
  | "FULL_TIME"
  | "PASS"
  | "INTERCEPTION"
  | "OFFSIDE"
  | "TACKLE"
  | "DRIBBLE"
  | "SHOT"
  | "SAVE"
  | "MISS"
  | "GOAL"
  | "FOUL"
  | "YELLOW_CARD"
  | "RED_CARD"
  | "INJURY"
  | "SUBSTITUTION"
  | "THROW_IN"
  | "CORNER"
  | "GOAL_KICK"
  | "FREE_KICK"
  | "PENALTY";

export interface MatchEvent {
  t: number;
  type: MatchEventType;
  team?: TeamSide;
  playerId?: number;
  runtimeId?: string;
  message: string;
  clockLabel?: string;
}

export interface TeamMatchStats {
  shots: number;
  shotsOnTarget: number;
  passesAttempted: number;
  passesCompleted: number;
  backwardPasses: number;
  goalkeeperBackPasses: number;
  ownGoals: number;
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
  substitutions: number;
  throwIns: number;
  corners: number;
  goalKicks: number;
  freeKicks: number;
  penalties: number;
  goalkeeperSaves: number;
  goalsFromSetPieces: number;
  possession: number;
  averageStarterEnergy: number;
}

export interface PlayerMatchStats {
  runtimeId: string;
  playerId: number;
  playerName: string;
  team: TeamSide;
  starter: boolean;
  shirtNumber: number;
  position: Position | null;
  role: Role;
  minutesPlayed: number;
  distanceCovered: number;
  touches: number;
  goals: number;
  assists: number;
  ownGoals: number;
  shots: number;
  shotsOnTarget: number;
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

export interface TeamSpatialAnalytics {
  samples: number;
  allPlayersHeatmap: number[];
  playerHeatmaps: Record<number, number[]>;
  heatmapSlices: Record<SpatialSliceKey, SpatialHeatmapAnalytics>;
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

export type SpatialSliceKey = "ALL" | "FIRST_HALF" | "SECOND_HALF" | "IN_POSSESSION" | "OUT_OF_POSSESSION";

export interface SpatialHeatmapAnalytics {
  allPlayersHeatmap: number[];
  playerHeatmaps: Record<number, number[]>;
}

export interface MatchSpatialAnalytics {
  columns: number;
  rows: number;
  home: TeamSpatialAnalytics;
  away: TeamSpatialAnalytics;
}

export interface MatchReplay {
  engineVersion: string;
  seed: string;
  logicalDuration: number;
  regulationLogicalDuration: number;
  displayedMinutes: number;
  addedTime: {
    firstHalfMinutes: number;
    secondHalfMinutes: number;
  };
  frameInterval: number;
  homeName: string;
  awayName: string;
  players: ReplayPlayerMeta[];
  frames: ReplayFrame[];
  events: MatchEvent[];
}

export interface MatchSimulationOutput {
  contractVersion: "1.0.0";
  result: {
    homeScore: number;
    awayScore: number;
    homeName: string;
    awayName: string;
  };
  stats: {
    home: TeamMatchStats;
    away: TeamMatchStats;
  };
  playerStats: {
    home: PlayerMatchStats[];
    away: PlayerMatchStats[];
  };
  notifications: {
    injuries: Array<{
      team: TeamSide;
      playerId: number;
      playerName: string;
      unavailableMatches: number;
    }>;
    suspensions: Array<{
      team: TeamSide;
      playerId: number;
      playerName: string;
      matches: number;
      reason: string;
    }>;
  };
  analytics?: MatchSpatialAnalytics;
  replay: MatchReplay;
}
