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
  formationId: "4-3-3";
  starters: Record<string, number>;
  bench: number[];
  roles?: Partial<Record<string, Role>>;
  tactics?: {
    blockHeight: "LOW" | "NORMAL" | "HIGH";
    buildUp: "SHORT" | "BALANCED" | "DIRECT";
  };
}

export interface MatchSimulationRequest {
  seed?: string;
  logicalSeconds?: number;
  home?: TeamSelection;
  away?: TeamSelection;
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

export interface TeamSpatialAnalytics {
  samples: number;
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
