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

export interface ReplayFrame {
  t: number;
  ball: {
    x: number;
    y: number;
    ownerId: string | null;
  };
  players: ReplayPlayerFrame[];
}

export type MatchEventType =
  | "KICKOFF"
  | "HALF_TIME"
  | "FULL_TIME"
  | "PASS"
  | "INTERCEPTION"
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
  | "SUBSTITUTION";

export interface MatchEvent {
  t: number;
  type: MatchEventType;
  team?: TeamSide;
  playerId?: number;
  runtimeId?: string;
  message: string;
}

export interface TeamMatchStats {
  shots: number;
  shotsOnTarget: number;
  passesAttempted: number;
  passesCompleted: number;
  dribbles: number;
  progressiveRuns: number;
  duelsWon: number;
  tackles: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  possession: number;
  averageStarterEnergy: number;
}

export interface MatchReplay {
  engineVersion: string;
  seed: string;
  logicalDuration: number;
  displayedMinutes: number;
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
  replay: MatchReplay;
}
