import type { SeededRng } from "./rng";
import type {
  MatchEvent,
  MatchSimulationOutput,
  PlayerCard,
  Position,
  ReplayFrame,
  Role,
  TeamMatchStats,
  TeamSelection,
  TeamSide,
  Vec2,
  FormationId,
} from "./types";

export type RuntimePlayerMatchStats = {
  logicalSecondsPlayed: number;
  distanceCovered: number;
  touches: number;
  goals: number;
  assists: number;
  ownGoals: number;
  shots: number;
  shotsOnTarget: number;
  passesAttempted: number;
  passesCompleted: number;
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
};

export type TeamIndex = 0 | 1;

export type RuntimePlayer = {
  runtimeId: string;
  card: PlayerCard;
  teamIndex: TeamIndex;
  side: TeamSide;
  shirtNumber: number;
  active: boolean;
  injured: boolean;
  redCard: boolean;
  yellowCards: number;
  energy: number;
  pos: Vec2;
  target: Vec2;
  slotId: string | null;
  assignedPosition: Position | null;
  role: Role;
  formationId: FormationId;
  synergyBonus: number;
  stunnedUntil: number;
  runTarget: Vec2 | null;
  runUntil: number;
  matchStats: RuntimePlayerMatchStats;
};

export type RuntimeTeam = {
  index: TeamIndex;
  side: TeamSide;
  name: string;
  selection: TeamSelection;
  players: RuntimePlayer[];
  substitutionsUsed: number;
  lastSubstitutionDisplayedMinute: number;
  pendingSubstitutions: Array<{ outgoingRuntimeId: string; reason: string }>;
  score: number;
  stats: Omit<TeamMatchStats, "possession" | "averageStarterEnergy"> & {
    possessionTicks: number;
  };
  lastCompletedPass: {
    passerId: string;
    receiverId: string;
    at: number;
  } | null;
};

export type ControlledBall = {
  mode: "CONTROLLED";
  ownerId: string;
  pos: Vec2;
  controlOffset?: Vec2;
  controlAt?: number;
};

/** Dette historique conservée jusqu'à la migration complète vers LooseBall. */
export type TransitBall = {
  mode: "TRANSIT";
  kind: "PASS" | "SHOT";
  actorId: string;
  from: Vec2;
  to: Vec2;
  pos: Vec2;
  elapsed: number;
  duration: number;
  intendedReceiverId?: string;
  passSuccess?: boolean;
  interceptId?: string;
  shotResult?: "GOAL" | "SAVE_CATCH" | "SAVE_REBOUND" | "MISS";
  goalkeeperId?: string;
  reboundTo?: Vec2;
};

export type LooseBall = {
  mode: "LOOSE";
  pos: Vec2;
  age: number;
  velocity: Vec2;
  deceleration: number;
  sourceTeamIndex?: TeamIndex;
  actorId?: string;
  intendedReceiverId?: string;
  kind?: "PASS" | "SHOT" | "REBOUND" | "DEFLECTION" | "SET_PIECE";
  lastTouchTeamIndex?: TeamIndex;
  lastTouchPlayerId?: string;
  setPieceOrigin?: RestartType;
  assistCandidateId?: string;
};

export type DeadBall = {
  mode: "DEAD";
  pos: Vec2;
};

export type RuntimeBall = ControlledBall | TransitBall | LooseBall | DeadBall;

export type RestartType =
  | "KICKOFF"
  | "THROW_IN"
  | "CORNER"
  | "GOAL_KICK"
  | "FREE_KICK"
  | "PENALTY";

export type RestartState = {
  type: RestartType;
  teamIndex: TeamIndex;
  spot: Vec2;
  takerId: string;
  resumeAt: number;
  directShotPreferred: boolean;
  wallPlayerIds: string[];
  countsForAddedTime: boolean;
};

export type SpatialTeamAccumulator = {
  samples: number;
  allPlayersHeatmap: number[];
  playerHeatmaps: Record<number, number[]>;
  heatmapSlices: Record<SpatialSliceKey, SpatialHeatmapAccumulator>;
  positionHeatmaps: Partial<Record<Position, number[]>>;
  blockCenterProgressSum: number;
  blockCenterProgressSquaredSum: number;
  blockCenterMin: number;
  blockCenterMax: number;
  blockDepthSum: number;
  blockWidthSum: number;
  playersInAttackingHalfSum: number;
  defensiveLineProgressSum: number;
  possessionSamples: number;
  outOfPossessionSamples: number;
  possessionBlockCenterSum: number;
  outOfPossessionBlockCenterSum: number;
  possessionWidthSum: number;
  outOfPossessionWidthSum: number;
};

export type SpatialSliceKey = "ALL" | "FIRST_HALF" | "SECOND_HALF" | "IN_POSSESSION" | "OUT_OF_POSSESSION";

export type SpatialHeatmapAccumulator = {
  allPlayersHeatmap: number[];
  playerHeatmaps: Record<number, number[]>;
};

export type SpatialAccumulator = {
  columns: number;
  rows: number;
  teams: [SpatialTeamAccumulator, SpatialTeamAccumulator];
};

export type MatchState = {
  t: number;
  logicalDuration: number;
  regulationLogicalDuration: number;
  period: 1 | 2;
  periodElapsed: number;
  periodRegulationDuration: number;
  periodAddedTarget: number;
  firstHalfAddedLogical: number;
  secondHalfAddedLogical: number;
  addedTimeAnnounced: boolean;
  matchEnded: boolean;
  restart: RestartState | null;
  teams: [RuntimeTeam, RuntimeTeam];
  allPlayers: RuntimePlayer[];
  ball: RuntimeBall;
  events: MatchEvent[];
  frames: ReplayFrame[];
  nextDecisionAt: number;
  nextReplayAt: number;
  nextSpatialAt: number;
  halftimeEmitted: boolean;
  rng: SeededRng;
  controlStartedAt: number;
  recordReplay: boolean;
  recordSpatialAnalytics: boolean;
  spatial: SpatialAccumulator;
  possessionTeamIndex: TeamIndex;
  possessionChangedAt: number;
  notifications: MatchSimulationOutput["notifications"];
};

export function createEmptyStats(): RuntimeTeam["stats"] {
  return {
    shots: 0,
    shotsOnTarget: 0,
    passesAttempted: 0,
    passesCompleted: 0,
    backwardPasses: 0,
    goalkeeperBackPasses: 0,
    ownGoals: 0,
    dribbles: 0,
    progressiveRuns: 0,
    duelsWon: 0,
    transitionShots: 0,
    possessionRegains: 0,
    tackles: 0,
    fouls: 0,
    yellowCards: 0,
    redCards: 0,
    offsides: 0,
    substitutions: 0,
    throwIns: 0,
    corners: 0,
    goalKicks: 0,
    freeKicks: 0,
    penalties: 0,
    goalkeeperSaves: 0,
    goalsFromSetPieces: 0,
    possessionTicks: 0,
  };
}

export function createEmptyPlayerMatchStats(): RuntimePlayerMatchStats {
  return {
    logicalSecondsPlayed: 0,
    distanceCovered: 0,
    touches: 0,
    goals: 0,
    assists: 0,
    ownGoals: 0,
    shots: 0,
    shotsOnTarget: 0,
    passesAttempted: 0,
    passesCompleted: 0,
    dribbles: 0,
    progressiveRuns: 0,
    tackles: 0,
    interceptions: 0,
    duelsWon: 0,
    possessionRegains: 0,
    fouls: 0,
    yellowCards: 0,
    redCards: 0,
    offsides: 0,
    goalkeeperSaves: 0,
  };
}
