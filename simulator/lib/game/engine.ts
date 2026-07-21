import { effectiveStats, positionCompatibility } from "./compatibility";
import { clamp, ENGINE_VERSION, MATCH_CONFIG, round } from "./config";
import {
  attackDirection,
  anchorForSide,
  FORMATION_433,
  getSlot,
  opponentGoal,
  ownGoal,
} from "./formations";
import { SeededRng } from "./rng";
import type {
  MatchEvent,
  MatchReplay,
  MatchSimulationOutput,
  MatchSpatialAnalytics,
  PlayerCard,
  Position,
  ReplayFrame,
  ReplayPlayerMeta,
  Role,
  TeamMatchStats,
  TeamSelection,
  TeamSpatialAnalytics,
  TeamSide,
  Vec2,
} from "./types";

type TeamIndex = 0 | 1;

type RuntimePlayer = {
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
  synergyBonus: number;
  stunnedUntil: number;
  runTarget: Vec2 | null;
  runUntil: number;
};

type RuntimeTeam = {
  index: TeamIndex;
  side: TeamSide;
  name: string;
  selection: TeamSelection;
  players: RuntimePlayer[];
  substitutionsUsed: number;
  lastSubstitutionDisplayedMinute: number;
  score: number;
  stats: Omit<TeamMatchStats, "possession" | "averageStarterEnergy"> & {
    possessionTicks: number;
  };
};

type ControlledBall = {
  mode: "CONTROLLED";
  ownerId: string;
  pos: Vec2;
  controlOffset?: Vec2;
  controlAt?: number;
};

type TransitBall = {
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

type LooseBall = {
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
};

type DeadBall = {
  mode: "DEAD";
  pos: Vec2;
};

type RuntimeBall = ControlledBall | TransitBall | LooseBall | DeadBall;

type RestartType =
  | "KICKOFF"
  | "THROW_IN"
  | "CORNER"
  | "GOAL_KICK"
  | "FREE_KICK"
  | "PENALTY";

type RestartState = {
  type: RestartType;
  teamIndex: TeamIndex;
  spot: Vec2;
  takerId: string;
  resumeAt: number;
  directShotPreferred: boolean;
  wallPlayerIds: string[];
  countsForAddedTime: boolean;
};

type SpatialTeamAccumulator = {
  samples: number;
  allPlayersHeatmap: number[];
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

type SpatialAccumulator = {
  columns: number;
  rows: number;
  teams: [SpatialTeamAccumulator, SpatialTeamAccumulator];
};

type MatchState = {
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

type ActionCandidate =
  | { kind: "PASS"; targetId: string; utility: number }
  | { kind: "SHOT"; utility: number }
  | { kind: "DRIBBLE"; utility: number }
  | { kind: "HOLD"; utility: number };

const EMPTY_STATS = () => ({
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
});

export function simulateMatch(params: {
  home: TeamSelection;
  away: TeamSelection;
  players: PlayerCard[];
  seed: string;
  logicalSeconds?: number;
  recordReplay?: boolean;
  recordSpatialAnalytics?: boolean;
}): MatchSimulationOutput {
  const regulationLogicalDuration = clamp(
    params.logicalSeconds ?? MATCH_CONFIG.logicalSeconds,
    60,
    900,
  );
  const periodRegulationDuration = regulationLogicalDuration / 2;

  const playerMap = new Map(
    params.players.map((player) => [player.playerId, player]),
  );

  const home = createRuntimeTeam(
    0,
    "HOME",
    params.home,
    playerMap,
  );
  const away = createRuntimeTeam(
    1,
    "AWAY",
    params.away,
    playerMap,
  );

  const allPlayers = [...home.players, ...away.players];
  recomputeSynergy(home);
  recomputeSynergy(away);

  const rng = new SeededRng(params.seed);
  const kickoffOwner =
    findActiveBySlot(home, "ST") ?? firstActiveOutfield(home);

  const state: MatchState = {
    t: 0,
    logicalDuration: regulationLogicalDuration,
    regulationLogicalDuration,
    period: 1,
    periodElapsed: 0,
    periodRegulationDuration,
    periodAddedTarget: 0,
    firstHalfAddedLogical: 0,
    secondHalfAddedLogical: 0,
    addedTimeAnnounced: false,
    matchEnded: false,
    restart: null,
    teams: [home, away],
    allPlayers,
    ball: {
      mode: "CONTROLLED",
      ownerId: kickoffOwner.runtimeId,
      pos: { x: 0.5, y: 0.5 },
    },
    events: [],
    frames: [],
    nextDecisionAt: 0,
    nextReplayAt: MATCH_CONFIG.replayFrameInterval,
    nextSpatialAt: 0,
    halftimeEmitted: false,
    rng,
    controlStartedAt: 0,
    recordReplay: params.recordReplay ?? true,
    recordSpatialAnalytics: params.recordSpatialAnalytics ?? false,
    spatial: createSpatialAccumulator(),
    possessionTeamIndex: home.index,
    possessionChangedAt: 0,
    notifications: {
      injuries: [],
      suspensions: [],
    },
  };

  resetForKickoff(state, home.index);
  emit(state, {
    type: "KICKOFF",
    team: "HOME",
    message: `Coup d'envoi pour ${home.name}.`,
  });
  if (state.recordReplay) {
    captureFrame(state);
  }

  const safetyLimit = regulationLogicalDuration * 1.65;
  while (!state.matchEnded && state.t < safetyLimit) {
    if (
      !state.addedTimeAnnounced &&
      state.periodElapsed >= state.periodRegulationDuration
    ) {
      state.addedTimeAnnounced = true;
      if (state.periodAddedTarget > 0.05) {
        emit(state, {
          type: "ADDED_TIME",
          message: `${Math.max(1, Math.ceil(logicalExtraToDisplayedMinutes(state, state.periodAddedTarget)))} minute(s) de temps additionnel.`,
        });
      }
    }

    if (
      !state.restart &&
      state.periodElapsed >=
      state.periodRegulationDuration + state.periodAddedTarget
    ) {
      if (state.period === 1) {
        state.firstHalfAddedLogical = state.periodAddedTarget;
        emit(state, {
          type: "HALF_TIME",
          message: "Mi-temps.",
        });
        state.period = 2;
        state.periodElapsed = 0;
        state.periodAddedTarget = 0;
        state.addedTimeAnnounced = false;
        state.halftimeEmitted = true;
        state.nextDecisionAt = state.t;
        resetForKickoff(state, away.index);
        emit(state, {
          type: "KICKOFF",
          team: "AWAY",
          message: `${away.name} donne le coup d'envoi de la seconde période.`,
        });
        if (state.recordReplay) captureFrame(state);
      } else {
        state.secondHalfAddedLogical = state.periodAddedTarget;
        state.matchEnded = true;
        break;
      }
    }

    if (state.t + 1e-9 >= state.nextDecisionAt) {
      if (!state.restart) {
        decisionTick(state);
      }
      state.nextDecisionAt += MATCH_CONFIG.decisionInterval;
    }

    const dt = MATCH_CONFIG.physicsStep;

    updateMovement(state, dt);
    if (state.restart && state.t + dt >= state.restart.resumeAt) {
      executeRestart(state);
    } else {
      updateBall(state, dt);
    }
    updatePossessionCounter(state);
    evaluateAutomaticSubstitutions(state);

    if (
      state.recordSpatialAnalytics &&
      state.t + 1e-9 >= state.nextSpatialAt
    ) {
      captureSpatialSample(state);
      state.nextSpatialAt += MATCH_CONFIG.spatialSampleInterval;
    }

    if (state.restart?.countsForAddedTime) {
      state.periodAddedTarget = Math.min(
        MATCH_CONFIG.addedTime.maxLogicalSecondsPerHalf,
        state.periodAddedTarget +
          dt * MATCH_CONFIG.addedTime.compensationRatio,
      );
    }

    state.t += dt;
    state.periodElapsed += dt;

    if (
      state.recordReplay &&
      state.t + 1e-9 >= state.nextReplayAt
    ) {
      captureFrame(state);
      state.nextReplayAt += MATCH_CONFIG.replayFrameInterval;
    }
  }

  state.logicalDuration = state.t;
  emit(state, {
    type: "FULL_TIME",
    message: `Fin du match : ${home.name} ${home.score} - ${away.score} ${away.name}.`,
  });
  if (state.recordReplay) {
    captureFrame(state);
  }

  const totalPossessionTicks =
    home.stats.possessionTicks + away.stats.possessionTicks;

  const homeStats: TeamMatchStats = {
    ...withoutPossessionTicks(home.stats),
    averageStarterEnergy: averageStarterEnergy(home),
    possession:
      totalPossessionTicks === 0
        ? 50
        : round(
            (home.stats.possessionTicks / totalPossessionTicks) * 100,
            1,
          ),
  };

  const awayStats: TeamMatchStats = {
    ...withoutPossessionTicks(away.stats),
    averageStarterEnergy: averageStarterEnergy(away),
    possession: round(100 - homeStats.possession, 1),
  };

  const analytics = state.recordSpatialAnalytics
    ? finalizeSpatialAnalytics(state.spatial)
    : undefined;

  const replay: MatchReplay = {
    engineVersion: ENGINE_VERSION,
    seed: params.seed,
    logicalDuration: state.logicalDuration,
    regulationLogicalDuration: state.regulationLogicalDuration,
    displayedMinutes: MATCH_CONFIG.displayedMinutes,
    addedTime: {
      firstHalfMinutes: round(logicalExtraToDisplayedMinutes(state, state.firstHalfAddedLogical), 1),
      secondHalfMinutes: round(logicalExtraToDisplayedMinutes(state, state.secondHalfAddedLogical), 1),
    },
    frameInterval: MATCH_CONFIG.replayFrameInterval,
    homeName: home.name,
    awayName: away.name,
    players: buildReplayMetadata(state.allPlayers),
    frames: state.frames,
    events: state.events,
  };

  return {
    result: {
      homeScore: home.score,
      awayScore: away.score,
      homeName: home.name,
      awayName: away.name,
    },
    stats: {
      home: homeStats,
      away: awayStats,
    },
    notifications: state.notifications,
    analytics,
    replay,
  };
}

function createRuntimeTeam(
  index: TeamIndex,
  side: TeamSide,
  selection: TeamSelection,
  playerMap: Map<number, PlayerCard>,
): RuntimeTeam {
  const players: RuntimePlayer[] = [];

  FORMATION_433.forEach((slot, slotIndex) => {
    const playerId = selection.starters[slot.id];
    const card = playerMap.get(playerId);
    if (!card) {
      throw new Error(
        `Joueur ${playerId} introuvable pour le slot ${slot.id} de ${selection.name}.`,
      );
    }

    const anchor = anchorForSide(slot.anchor, side);
    players.push({
      runtimeId: `${side}:${card.playerId}:START:${slot.id}`,
      card,
      teamIndex: index,
      side,
      shirtNumber: slotIndex + 1,
      active: true,
      injured: false,
      redCard: false,
      yellowCards: 0,
      energy: 100,
      pos: { ...anchor },
      target: { ...anchor },
      slotId: slot.id,
      assignedPosition: slot.position,
      role: selection.roles?.[slot.id] ?? "NORMAL",
      synergyBonus: 0,
      stunnedUntil: 0,
      runTarget: null,
      runUntil: 0,
    });
  });

  selection.bench.forEach((playerId, benchIndex) => {
    const card = playerMap.get(playerId);
    if (!card) {
      throw new Error(
        `Remplaçant ${playerId} introuvable pour ${selection.name}.`,
      );
    }

    players.push({
      runtimeId: `${side}:${card.playerId}:BENCH:${benchIndex}`,
      card,
      teamIndex: index,
      side,
      shirtNumber: 12 + benchIndex,
      active: false,
      injured: false,
      redCard: false,
      yellowCards: 0,
      energy: 100,
      pos: { x: -1, y: -1 },
      target: { x: -1, y: -1 },
      slotId: null,
      assignedPosition: null,
      role: "NORMAL",
      synergyBonus: 0,
      stunnedUntil: 0,
      runTarget: null,
      runUntil: 0,
    });
  });

  return {
    index,
    side,
    name: selection.name,
    selection,
    players,
    substitutionsUsed: 0,
    lastSubstitutionDisplayedMinute: -999,
    score: 0,
    stats: EMPTY_STATS(),
  };
}

function decisionTick(state: MatchState): void {
  updateOffBallRuns(state);
  updatePlayerTargets(state);

  if (state.ball.mode === "LOOSE") {
    resolveLooseBall(state);
    return;
  }

  if (state.ball.mode !== "CONTROLLED") {
    return;
  }

  const owner = getPlayer(state, state.ball.ownerId);
  if (!owner?.active || owner.redCard || owner.injured) {
    state.ball = {
      mode: "LOOSE",
      pos: { ...state.ball.pos },
      age: 0,
      velocity: { x: 0, y: 0 },
      deceleration: MATCH_CONFIG.ball.passDeceleration,
      lastTouchTeamIndex: owner?.teamIndex,
      lastTouchPlayerId: owner?.runtimeId,
    };
    return;
  }

  if (attemptDefensiveDuel(state, owner)) {
    return;
  }

  const action = chooseBallAction(state, owner);

  switch (action.kind) {
    case "PASS":
      startPass(state, owner, action.targetId);
      break;
    case "SHOT":
      startShot(state, owner);
      break;
    case "DRIBBLE":
      state.teams[owner.teamIndex].stats.dribbles += 1;
      setDribbleTarget(state, owner);
      emit(state, {
        type: "DRIBBLE",
        team: owner.side,
        playerId: owner.card.playerId,
        runtimeId: owner.runtimeId,
        message: `${owner.card.shortName} progresse balle au pied.`,
      });
      break;
    case "HOLD":
      owner.target = {
        x: clamp(owner.pos.x + attackDirection(owner.side) * 0.015, 0.02, 0.98),
        y: clamp(owner.pos.y + state.rng.between(-0.015, 0.015), 0.03, 0.97),
      };
      break;
  }
}

function chooseBallAction(
  state: MatchState,
  owner: RuntimePlayer,
): ActionCandidate {
  if (!owner.assignedPosition) {
    return { kind: "HOLD", utility: 0.1 };
  }

  const team = state.teams[owner.teamIndex];
  const opponents = state.teams[otherTeamIndex(owner.teamIndex)].players.filter(
    (player) => player.active && player.stunnedUntil <= state.t,
  );
  const teammates = team.players.filter(
    (player) => player.active && player.runtimeId !== owner.runtimeId,
  );

  const stats = effectiveStats({
    player: owner.card,
    assignedPosition: owner.assignedPosition,
    energy: owner.energy,
    synergyBonus: owner.synergyBonus,
  });

  const candidates: ActionCandidate[] = [];
  const shotQuality = estimateShotQuality(owner.pos, owner.side);
  const controlAge = state.t - state.controlStartedAt;
  const nearestOpponentDistance = nearestDistance(owner.pos, opponents);
  const ownerPressure = clamp((0.11 - nearestOpponentDistance) / 0.11);

  if (shotQuality > 0.055) {
    candidates.push({
      kind: "SHOT",
      utility:
        shotQuality * 1.00 +
        (owner.role === "OFFENSIVE" ? 0.01 : 0),
    });
  }

  for (const teammate of teammates) {
    if (!teammate.assignedPosition) {
      continue;
    }

    const distance = distanceBetween(owner.pos, teammate.pos);
    if (distance > 0.58) {
      continue;
    }

    const direction = attackDirection(owner.side);
    const rawProgress = (teammate.pos.x - owner.pos.x) * direction;
    const progression = clamp((rawProgress + 0.15) / 0.55);
    const backwardAmount = clamp(-rawProgress / 0.30);
    const receiverSpace = clamp(nearestDistance(teammate.pos, opponents) / 0.16);
    const laneSafety = 1 - passingLaneRisk(owner.pos, teammate.pos, opponents);
    const distanceComfort = 1 - clamp(distance / 0.55);

    let utility =
      0.34 * progression +
      0.27 * receiverSpace +
      0.27 * laneSafety +
      0.12 * distanceComfort;

    if (backwardAmount > 0) {
      utility -=
        MATCH_CONFIG.passing.backwardPenalty * backwardAmount *
        (1 - ownerPressure * MATCH_CONFIG.passing.backwardPressureRelief);

      // Les grosses remises de 10%+ de longueur de terrain ne sont retenues
      // qu'en vraie situation de pression. Cela conserve les passes de soutien
      // sans produire des renversements arrière artificiels en permanence.
      if (rawProgress < -0.10 && ownerPressure < 0.55) {
        utility -= 0.34 * (1 - ownerPressure);
      }
    }

    if (teammate.assignedPosition === "GK") {
      // Le gardien reste une soupape sous pression, pas une destination de
      // circulation normale. Cela évite les remises arrière absurdes et les
      // séries défenseur -> gardien sans nécessité.
      utility -= MATCH_CONFIG.passing.goalkeeperBasePenalty;
      utility += ownerPressure * MATCH_CONFIG.passing.goalkeeperPressureRelief;
      if (distance < 0.20) utility += 0.08;
      if (owner.assignedPosition === "CB" || owner.assignedPosition === "LB" || owner.assignedPosition === "RB") {
        utility += 0.04 * ownerPressure;
      }
    }

    if (team.selection.tactics?.buildUp === "SHORT") {
      utility += 0.12 * distanceComfort;
    } else if (team.selection.tactics?.buildUp === "DIRECT") {
      utility += 0.12 * progression;
    }

    if (owner.role === "CREATOR") {
      utility += 0.05 * progression;
    }

    if (
      MATCH_CONFIG.offsides.enabled &&
      isPlayerOffside(state, owner, teammate)
    ) {
      // Un joueur intelligent évite presque toujours cette option via l'utility.
      // La pénalité n'est pas infinie : une mauvaise décision peut encore arriver.
      utility -= 0.85;
    }

    if (
      teammate.runTarget &&
      teammate.runUntil > state.t
    ) {
      utility += 0.14 * progression + 0.05;
    }

    if (
      controlAge <
      MATCH_CONFIG.possession.minControlSecondsBeforeEasyPass
    ) {
      utility -= 0.12;
    }

    candidates.push({
      kind: "PASS",
      targetId: teammate.runtimeId,
      utility,
    });
  }

  const spaceAhead = spaceAheadScore(owner, opponents);
  candidates.push({
    kind: "DRIBBLE",
    utility:
      0.24 +
      0.35 * spaceAhead +
      0.08 * (stats.technique / 100) +
      (owner.role === "OFFENSIVE" ? 0.02 : 0),
  });

  candidates.push({
    kind: "HOLD",
    utility: 0.18 + (owner.role === "DEFENSIVE" ? 0.04 : 0),
  });

  const temperature = decisionTemperature(stats.intelligence);
  return softmaxPick(candidates, temperature, state.rng);
}

function softmaxPick<T extends { utility: number }>(
  candidates: T[],
  temperature: number,
  rng: SeededRng,
): T {
  const maxUtility = Math.max(...candidates.map((candidate) => candidate.utility));
  const weights = candidates.map((candidate) =>
    Math.exp((candidate.utility - maxUtility) / Math.max(temperature, 0.001)),
  );
  const sum = weights.reduce((acc, value) => acc + value, 0);
  let cursor = rng.next() * sum;

  for (let i = 0; i < candidates.length; i += 1) {
    cursor -= weights[i];
    if (cursor <= 0) {
      return candidates[i];
    }
  }

  return candidates[candidates.length - 1];
}

function decisionTemperature(intelligence: number): number {
  const normalized = clamp(intelligence / 100);
  const { temperatureMin, temperatureMax, temperatureGamma } =
    MATCH_CONFIG.decision;
  return (
    temperatureMin +
    (1 - normalized) ** temperatureGamma *
      (temperatureMax - temperatureMin)
  );
}

function startPass(
  state: MatchState,
  passer: RuntimePlayer,
  receiverId: string,
  options?: { skipOffside?: boolean; setPieceOrigin?: RestartType },
): void {
  const receiver = getPlayer(state, receiverId);
  if (!receiver || !passer.assignedPosition) {
    return;
  }

  const team = state.teams[passer.teamIndex];
  const kickOrigin =
    state.ball.mode === "CONTROLLED" && state.ball.ownerId === passer.runtimeId
      ? { ...state.ball.pos }
      : { ...passer.pos };

  if (
    !options?.skipOffside &&
    MATCH_CONFIG.offsides.enabled &&
    isPlayerOffside(state, passer, receiver)
  ) {
    team.stats.passesAttempted += 1;
    team.stats.offsides += 1;
    emit(state, {
      type: "OFFSIDE",
      team: passer.side,
      playerId: receiver.card.playerId,
      runtimeId: receiver.runtimeId,
      message: `${receiver.card.shortName} est signalé hors-jeu.`,
    });

    scheduleRestart(state, {
      type: "FREE_KICK",
      teamIndex: otherTeamIndex(passer.teamIndex),
      spot: { ...receiver.pos },
      pause: MATCH_CONFIG.setPieces.freeKickPause,
      message: `Coup franc indirect après le hors-jeu de ${receiver.card.shortName}.`,
    });
    return;
  }
  const opponents = state.teams[otherTeamIndex(passer.teamIndex)].players.filter(
    (player) => player.active,
  );
  const stats = effectiveStats({
    player: passer.card,
    assignedPosition: passer.assignedPosition,
    energy: passer.energy,
    synergyBonus: passer.synergyBonus,
  });

  const isGoalkeeperBackPass =
    receiver.assignedPosition === "GK" && receiver.teamIndex === passer.teamIndex;

  const receiverTarget = isGoalkeeperBackPass
    ? {
        // On vise volontairement quelques mètres DEVANT le gardien, côté
        // terrain. Une remise au gardien ne doit jamais être calibrée comme
        // une passe qui s'arrête sur la ligne de but.
        x: clamp(
          receiver.pos.x +
            attackDirection(receiver.side) * MATCH_CONFIG.passing.goalkeeperSafeLead,
          0.04,
          0.96,
        ),
        y: receiver.pos.y,
      }
    : receiver.runTarget && receiver.runUntil > state.t
      ? {
          x: lerp(receiver.pos.x, receiver.runTarget.x, 0.58),
          y: lerp(receiver.pos.y, receiver.runTarget.y, 0.58),
        }
      : {
          x: lerp(receiver.pos.x, receiver.target.x, 0.28),
          y: lerp(receiver.pos.y, receiver.target.y, 0.28),
        };

  const distance = distanceBetween(kickOrigin, receiverTarget);
  const pressure = clamp(
    (0.07 - nearestDistance(passer.pos, opponents)) / 0.07,
  );
  const laneRisk = passingLaneRisk(passer.pos, receiverTarget, opponents);

  // La qualité de passe influe sur la précision et le dosage, pas sur une
  // réussite booléenne décidée au moment de la frappe.
  const passQuality = clamp(
    (0.78 * stats.passing +
      0.16 * stats.technique +
      0.06 * stats.intelligence) /
      100,
  );

  const errorMagnitude =
    (1 - passQuality) *
    (0.018 + distance * 0.11) *
    (0.75 + pressure * 0.75 + laneRisk * 0.55) *
    (isGoalkeeperBackPass ? MATCH_CONFIG.passing.goalkeeperErrorMultiplier : 1);
  const errorAngle = state.rng.between(0, Math.PI * 2);

  const target = {
    x: clamp(
      receiverTarget.x + Math.cos(errorAngle) * errorMagnitude,
      0.02,
      0.98,
    ),
    y: clamp(
      receiverTarget.y + Math.sin(errorAngle) * errorMagnitude,
      0.03,
      0.97,
    ),
  };

  const travelDistance = distanceBetween(passer.pos, target);
  const idealSpeed = Math.sqrt(
    2 * MATCH_CONFIG.ball.passDeceleration * Math.max(travelDistance, 0.01),
  ) * 1.08;
  const powerError =
    state.rng.between(-0.22, 0.22) *
    (1 - passQuality) *
    (1 + pressure * 0.5) *
    (isGoalkeeperBackPass
      ? MATCH_CONFIG.passing.goalkeeperPowerErrorMultiplier
      : 1);
  const kickSpeed = clamp(
    idealSpeed *
      (1 + powerError) *
      (isGoalkeeperBackPass ? MATCH_CONFIG.passing.goalkeeperSpeedMultiplier : 1),
    MATCH_CONFIG.ball.passMinSpeed,
    isGoalkeeperBackPass ? 0.25 : MATCH_CONFIG.ball.passMaxSpeed,
  );

  const direction = normalizeVector({
    x: target.x - kickOrigin.x,
    y: target.y - kickOrigin.y,
  });

  team.stats.passesAttempted += 1;
  const passProgress =
    (receiverTarget.x - kickOrigin.x) * attackDirection(passer.side);
  if (passProgress < -0.025) team.stats.backwardPasses += 1;
  if (isGoalkeeperBackPass) team.stats.goalkeeperBackPasses += 1;

  state.ball = {
    mode: "LOOSE",
    pos: { ...kickOrigin },
    age: 0,
    velocity: {
      x: direction.x * kickSpeed,
      y: direction.y * kickSpeed,
    },
    deceleration: MATCH_CONFIG.ball.passDeceleration,
    sourceTeamIndex: passer.teamIndex,
    actorId: passer.runtimeId,
    intendedReceiverId: receiver.runtimeId,
    kind: "PASS",
    lastTouchTeamIndex: passer.teamIndex,
    lastTouchPlayerId: passer.runtimeId,
    setPieceOrigin: options?.setPieceOrigin,
  };

  // Le receveur et les adversaires proches commencent immédiatement à courir
  // vers le point d'arrêt prédit de la balle.
  resolveLooseBall(state);

  emit(state, {
    type: "PASS",
    team: passer.side,
    playerId: passer.card.playerId,
    runtimeId: passer.runtimeId,
    message: `${passer.card.shortName} cherche ${receiver.card.shortName}.`,
  });
}

function startShot(
  state: MatchState,
  shooter: RuntimePlayer,
  setPieceOrigin?: RestartType,
): void {
  if (!shooter.assignedPosition) {
    return;
  }

  const shotOrigin =
    state.ball.mode === "CONTROLLED" && state.ball.ownerId === shooter.runtimeId
      ? { ...state.ball.pos }
      : { ...shooter.pos };
  const attackingTeam = state.teams[shooter.teamIndex];
  const defendingTeam = state.teams[otherTeamIndex(shooter.teamIndex)];
  const goalkeeper =
    findActiveBySlot(defendingTeam, "GK") ??
    defendingTeam.players.find((player) => player.active);

  const shooterStats = effectiveStats({
    player: shooter.card,
    assignedPosition: shooter.assignedPosition,
    energy: shooter.energy,
    synergyBonus: shooter.synergyBonus,
  });

  const goal = opponentGoal(shooter.side);
  const distance = distanceBetween(shotOrigin, goal);
  const execution = clamp(
    (0.84 * shooterStats.shooting +
      0.14 * shooterStats.technique +
      0.02 * shooterStats.intelligence) /
      100,
  );

  // Aucun résultat n'est tiré ici. Les stats déterminent seulement la direction
  // et la vitesse initiales. Le but sera validé uniquement si la balle traverse
  // réellement la ligne entre les poteaux.
  const aimedY =
    0.5 + state.rng.between(-0.095, 0.095);
  const aimError =
    0.032 +
    (1 - execution) * (0.22 + distance * 0.30);
  const targetY = aimedY + state.rng.between(-aimError, aimError);
  const beyondGoalX = goal.x + attackDirection(shooter.side) * 0.035;
  const direction = normalizeVector({
    x: beyondGoalX - shotOrigin.x,
    y: targetY - shotOrigin.y,
  });
  const shotSpeed = clamp(
    MATCH_CONFIG.ball.shotMinSpeed +
      execution *
        (MATCH_CONFIG.ball.shotMaxSpeed - MATCH_CONFIG.ball.shotMinSpeed) +
      state.rng.between(-0.035, 0.035),
    MATCH_CONFIG.ball.shotMinSpeed,
    MATCH_CONFIG.ball.shotMaxSpeed,
  );

  attackingTeam.stats.shots += 1;
  if (
    state.t - state.possessionChangedAt <=
    MATCH_CONFIG.possession.transitionShotWindowSeconds
  ) {
    attackingTeam.stats.transitionShots += 1;
  }

  state.ball = {
    mode: "LOOSE",
    pos: { ...shotOrigin },
    age: 0,
    velocity: {
      x: direction.x * shotSpeed,
      y: direction.y * shotSpeed,
    },
    deceleration: MATCH_CONFIG.ball.shotDeceleration,
    sourceTeamIndex: shooter.teamIndex,
    actorId: shooter.runtimeId,
    kind: "SHOT",
    lastTouchTeamIndex: shooter.teamIndex,
    lastTouchPlayerId: shooter.runtimeId,
    setPieceOrigin,
  };

  if (goalkeeper?.active) {
    // Le gardien anticipe le point d'intersection avec sa ligne de but. Il doit
    // ensuite physiquement atteindre la trajectoire pour pouvoir intervenir.
    const intersectionY = lineYAtX(
      shotOrigin,
      { x: beyondGoalX, y: targetY },
      goal.x,
    );
    goalkeeper.target = {
      x: goalkeeper.side === "HOME" ? 0.018 : 0.982,
      y: clamp(
        intersectionY,
        MATCH_CONFIG.ball.goalMouthMinY - 0.05,
        MATCH_CONFIG.ball.goalMouthMaxY + 0.05,
      ),
    };
  }

  emit(state, {
    type: "SHOT",
    team: shooter.side,
    playerId: shooter.card.playerId,
    runtimeId: shooter.runtimeId,
    message: `${shooter.card.shortName} tente sa chance !`,
  });
}

function updateBall(state: MatchState, dt: number): void {
  if (state.ball.mode === "DEAD") {
    return;
  }

  if (state.ball.mode === "CONTROLLED") {
    const owner = getPlayer(state, state.ball.ownerId);
    if (owner?.active) {
      const elapsed = state.t - (state.ball.controlAt ?? state.t);
      const settle = 1 - clamp(elapsed / 0.28, 0, 1);
      const offset = state.ball.controlOffset ?? { x: 0, y: 0 };
      state.ball.pos = {
        x: owner.pos.x + offset.x * settle,
        y: owner.pos.y + offset.y * settle,
      };
    } else {
      state.ball = {
        mode: "LOOSE",
        pos: { ...state.ball.pos },
        age: 0,
        velocity: { x: 0, y: 0 },
        deceleration: MATCH_CONFIG.ball.passDeceleration,
        lastTouchTeamIndex: owner?.teamIndex,
        lastTouchPlayerId: owner?.runtimeId,
      };
    }
    return;
  }

  if (state.ball.mode === "TRANSIT") {
    // Compatibilité de replay avec d'anciens états ; la V0.5 ne crée plus de
    // TransitBall pour les nouvelles actions.
    state.ball.elapsed += dt;
    const progress = clamp(state.ball.elapsed / state.ball.duration);
    state.ball.pos = {
      x: lerp(state.ball.from.x, state.ball.to.x, progress),
      y: lerp(state.ball.from.y, state.ball.to.y, progress),
    };
    if (progress >= 1) {
      state.ball = {
        mode: "LOOSE",
        pos: { ...state.ball.pos },
        age: 0,
        velocity: { x: 0, y: 0 },
        deceleration: MATCH_CONFIG.ball.passDeceleration,
      };
    }
    return;
  }

  let remaining = dt;
  while (remaining > 1e-9 && state.ball.mode === "LOOSE") {
    const step = Math.min(MATCH_CONFIG.ballSubstep, remaining);
    remaining -= step;

    const ball = state.ball;
    const previousPos = { ...ball.pos };
    const currentSpeed = vectorLength(ball.velocity);

    if (currentSpeed > 0) {
      ball.pos = {
        x: ball.pos.x + ball.velocity.x * step,
        y: ball.pos.y + ball.velocity.y * step,
      };
    }
    ball.age += step;

    if (ball.kind === "SHOT") {
      if (tryPhysicalShotInterception(state, previousPos, ball.pos)) {
        if (state.ball.mode !== "LOOSE") return;
      }
    }

    if (state.ball.mode !== "LOOSE") return;

    const crossing = detectPitchBoundaryCrossing(previousPos, state.ball.pos);
    if (crossing) {
      state.ball.pos = { ...crossing.point };
      handleBoundaryCrossing(state, crossing);
      return;
    }

    const speedBeforeDecay = vectorLength(state.ball.velocity);
    if (speedBeforeDecay > 0) {
      const nextSpeed = Math.max(
        0,
        speedBeforeDecay - state.ball.deceleration * step,
      );
      if (nextSpeed <= MATCH_CONFIG.ball.looseBallStopSpeed) {
        state.ball.velocity = { x: 0, y: 0 };
      } else {
        const direction = normalizeVector(state.ball.velocity);
        state.ball.velocity = {
          x: direction.x * nextSpeed,
          y: direction.y * nextSpeed,
        };
      }
    }

    // Pas de collision "balayée" qui attribuerait la balle à distance : avec
    // les sous-pas physiques, un joueur ne contrôle que si la balle se trouve
    // réellement dans son rayon au sous-pas courant.
    if (
      state.ball.kind !== "SHOT" ||
      vectorLength(state.ball.velocity) <
        MATCH_CONFIG.ball.comfortableControlSpeed * 0.72
    ) {
      tryControlLooseBall(state);
    }
  }
}

function tryPhysicalShotInterception(
  state: MatchState,
  segmentStart: Vec2,
  segmentEnd: Vec2,
): boolean {
  if (state.ball.mode !== "LOOSE" || state.ball.kind !== "SHOT") {
    return false;
  }

  const shot = state.ball;
  const shooter = shot.actorId ? getPlayer(state, shot.actorId) : undefined;
  const defendingTeamIndex = shooter
    ? otherTeamIndex(shooter.teamIndex)
    : shot.lastTouchTeamIndex !== undefined
      ? otherTeamIndex(shot.lastTouchTeamIndex)
      : otherTeamIndex(state.possessionTeamIndex);
  const defendingTeam = state.teams[defendingTeamIndex];
  const goalkeeper = findActiveBySlot(defendingTeam, "GK");
  const ballSpeed = vectorLength(shot.velocity);

  if (goalkeeper?.active && goalkeeper.assignedPosition) {
    const distance = pointToSegmentDistance(
      goalkeeper.pos,
      segmentStart,
      segmentEnd,
    );
    if (distance <= MATCH_CONFIG.ball.goalkeeperParryRadius) {
      const stats = effectiveStats({
        player: goalkeeper.card,
        assignedPosition: goalkeeper.assignedPosition,
        energy: goalkeeper.energy,
        synergyBonus: goalkeeper.synergyBonus,
      });
      const reachQuality = clamp(
        (0.40 * stats.technique +
          0.28 * stats.intelligence +
          0.18 * stats.speed +
          0.14 * stats.physical) /
          100,
      );
      const exactness =
        1 -
        clamp(
          distance / MATCH_CONFIG.ball.goalkeeperParryRadius,
          0,
          1,
        );
      const touchProbability = clamp(
        0.34 + 0.58 * reachQuality + 0.26 * exactness - 0.12 * ballSpeed,
        0.16,
        0.99,
      );

      if (state.rng.chance(touchProbability)) {
        defendingTeam.stats.goalkeeperSaves += 1;
        if (shot.sourceTeamIndex !== undefined) {
          state.teams[shot.sourceTeamIndex].stats.shotsOnTarget += 1;
        }
        defendingTeam.stats.duelsWon += 1;
        const catchProbability = clamp(
          0.12 +
            0.52 * reachQuality +
            0.22 * exactness -
            0.42 * clamp(ballSpeed / MATCH_CONFIG.ball.shotMaxSpeed),
          0.04,
          0.78,
        );

        if (
          distance <= MATCH_CONFIG.ball.goalkeeperCatchRadius &&
          state.rng.chance(catchProbability)
        ) {
          goalkeeper.pos = moveTowards(
            goalkeeper.pos,
            shot.pos,
            MATCH_CONFIG.ball.goalkeeperCatchRadius,
          );
          setControlledBall(state, goalkeeper, { ...shot.pos });
          emit(state, {
            type: "SAVE",
            team: goalkeeper.side,
            playerId: goalkeeper.card.playerId,
            runtimeId: goalkeeper.runtimeId,
            message: `${goalkeeper.card.shortName} capte le tir sur sa trajectoire.`,
          });
          return true;
        }

        const awayFromGoal = attackDirection(goalkeeper.side);
        const rebound = normalizeVector({
          x: awayFromGoal + state.rng.between(-0.18, 0.18),
          y: state.rng.between(-0.65, 0.65),
        });
        shot.pos = { ...segmentEnd };
        shot.velocity = {
          x: rebound.x * Math.max(0.10, ballSpeed * 0.42),
          y: rebound.y * Math.max(0.10, ballSpeed * 0.42),
        };
        shot.deceleration = MATCH_CONFIG.ball.reboundDeceleration;
        shot.kind = "REBOUND";
        shot.lastTouchTeamIndex = goalkeeper.teamIndex;
        shot.lastTouchPlayerId = goalkeeper.runtimeId;
        emit(state, {
          type: "SAVE",
          team: goalkeeper.side,
          playerId: goalkeeper.card.playerId,
          runtimeId: goalkeeper.runtimeId,
          message: `${goalkeeper.card.shortName} repousse le tir !`,
        });
        return true;
      }
    }
  }

  // Un défenseur placé physiquement sur la trajectoire peut contrer le tir.
  const blockers = defendingTeam.players
    .filter(
      (player) =>
        player.active &&
        player.assignedPosition !== "GK" &&
        player.runtimeId !== shot.actorId &&
        player.stunnedUntil <= state.t,
    )
    .map((player) => ({
      player,
      distance: pointToSegmentDistance(player.pos, segmentStart, segmentEnd),
    }))
    .filter(({ distance }) => distance <= 0.010)
    .sort((a, b) => a.distance - b.distance);

  const blocker = blockers[0]?.player;
  if (blocker?.assignedPosition) {
    const stats = effectiveStats({
      player: blocker.card,
      assignedPosition: blocker.assignedPosition,
      energy: blocker.energy,
      synergyBonus: blocker.synergyBonus,
    });
    const blockProbability = clamp(
      0.22 + 0.28 * (stats.physical / 100) + 0.25 * (stats.intelligence / 100),
      0.15,
      0.78,
    );
    if (state.rng.chance(blockProbability)) {
      const current = normalizeVector(shot.velocity);
      const deflected = rotateVector(
        current,
        state.rng.between(-0.85, 0.85),
      );
      shot.velocity = {
        x: deflected.x * ballSpeed * 0.52,
        y: deflected.y * ballSpeed * 0.52,
      };
      shot.deceleration = MATCH_CONFIG.ball.reboundDeceleration;
      shot.kind = "DEFLECTION";
      shot.lastTouchTeamIndex = blocker.teamIndex;
      shot.lastTouchPlayerId = blocker.runtimeId;
      return true;
    }
  }

  return false;
}

type BoundaryCrossing = {
  boundary: "LEFT_GOAL_LINE" | "RIGHT_GOAL_LINE" | "TOP_TOUCHLINE" | "BOTTOM_TOUCHLINE";
  point: Vec2;
};

function detectPitchBoundaryCrossing(
  from: Vec2,
  to: Vec2,
): BoundaryCrossing | null {
  const candidates: Array<BoundaryCrossing & { t: number }> = [];

  const addX = (x: number, boundary: BoundaryCrossing["boundary"]) => {
    const dx = to.x - from.x;
    if (Math.abs(dx) < 1e-9) return;
    const t = (x - from.x) / dx;
    if (t > 0 && t <= 1) {
      const y = from.y + (to.y - from.y) * t;
      if (y >= 0 && y <= 1) candidates.push({ boundary, point: { x, y }, t });
    }
  };
  const addY = (y: number, boundary: BoundaryCrossing["boundary"]) => {
    const dy = to.y - from.y;
    if (Math.abs(dy) < 1e-9) return;
    const t = (y - from.y) / dy;
    if (t > 0 && t <= 1) {
      const x = from.x + (to.x - from.x) * t;
      if (x >= 0 && x <= 1) candidates.push({ boundary, point: { x, y }, t });
    }
  };

  if (to.x < 0) addX(0, "LEFT_GOAL_LINE");
  if (to.x > 1) addX(1, "RIGHT_GOAL_LINE");
  if (to.y < 0) addY(0, "TOP_TOUCHLINE");
  if (to.y > 1) addY(1, "BOTTOM_TOUCHLINE");

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.t - b.t);
  const { boundary, point } = candidates[0];
  return { boundary, point };
}

function handleBoundaryCrossing(
  state: MatchState,
  crossing: BoundaryCrossing,
): void {
  if (state.ball.mode !== "LOOSE") return;
  const ball = state.ball;
  const lastTouchTeam = ball.lastTouchTeamIndex ?? ball.sourceTeamIndex ?? state.possessionTeamIndex;

  if (
    crossing.boundary === "TOP_TOUCHLINE" ||
    crossing.boundary === "BOTTOM_TOUCHLINE"
  ) {
    const restartTeam = otherTeamIndex(lastTouchTeam);
    scheduleRestart(state, {
      type: "THROW_IN",
      teamIndex: restartTeam,
      spot: {
        x: clamp(crossing.point.x, 0.03, 0.97),
        y: crossing.boundary === "TOP_TOUCHLINE" ? 0 : 1,
      },
      pause: MATCH_CONFIG.setPieces.throwInPause,
    });
    return;
  }

  const isLeft = crossing.boundary === "LEFT_GOAL_LINE";
  const defendingTeamIndex: TeamIndex = isLeft ? 0 : 1;
  const attackingTeamIndex = otherTeamIndex(defendingTeamIndex);
  const betweenPosts =
    crossing.point.y >= MATCH_CONFIG.ball.goalMouthMinY &&
    crossing.point.y <= MATCH_CONFIG.ball.goalMouthMaxY;

  if (betweenPosts) {
    registerPhysicalGoal(state, attackingTeamIndex, ball);
    return;
  }

  if (
    ball.kind === "SHOT" &&
    ball.lastTouchTeamIndex === ball.sourceTeamIndex &&
    ball.actorId
  ) {
    const shooter = getPlayer(state, ball.actorId);
    emit(state, {
      type: "MISS",
      team: shooter?.side,
      playerId: shooter?.card.playerId,
      runtimeId: shooter?.runtimeId,
      message: shooter
        ? `${shooter.card.shortName} ne cadre pas.`
        : "Le tir passe à côté.",
    });
  }

  if (lastTouchTeam === defendingTeamIndex) {
    const cornerY = crossing.point.y < 0.5 ? 0 : 1;
    scheduleRestart(state, {
      type: "CORNER",
      teamIndex: attackingTeamIndex,
      spot: { x: isLeft ? 0 : 1, y: cornerY },
      pause: MATCH_CONFIG.setPieces.cornerPause,
    });
  } else {
    scheduleRestart(state, {
      type: "GOAL_KICK",
      teamIndex: defendingTeamIndex,
      spot: {
        x: isLeft ? 0.07 : 0.93,
        y: 0.5,
      },
      pause: MATCH_CONFIG.setPieces.goalKickPause,
    });
  }
}

function registerPhysicalGoal(
  state: MatchState,
  scoringTeamIndex: TeamIndex,
  ball: LooseBall,
): void {
  const scoringTeam = state.teams[scoringTeamIndex];
  scoringTeam.score += 1;
  if (ball.kind === "SHOT" && ball.sourceTeamIndex !== undefined) {
    state.teams[ball.sourceTeamIndex].stats.shotsOnTarget += 1;
  }

  const lastTouch = ball.lastTouchPlayerId
    ? getPlayer(state, ball.lastTouchPlayerId)
    : undefined;
  const scorer = lastTouch?.teamIndex === scoringTeamIndex ? lastTouch : undefined;
  if (
    lastTouch &&
    lastTouch.teamIndex !== scoringTeamIndex &&
    ball.kind === "PASS" &&
    ball.sourceTeamIndex === lastTouch.teamIndex
  ) {
    // On ne compte comme CSC que les vraies remises de sa propre équipe qui
    // terminent dans le but. Une parade ou une déviation sur un tir adverse
    // reste créditée au tireur, comme au football réel.
    state.teams[lastTouch.teamIndex].stats.ownGoals += 1;
  }
  const message = scorer
    ? `BUT ! ${scorer.card.shortName} marque pour ${scoringTeam.name}.`
    : `BUT ! ${scoringTeam.name} marque, avec une dernière déviation adverse.`;

  if (ball.setPieceOrigin && ball.setPieceOrigin !== "KICKOFF") {
    scoringTeam.stats.goalsFromSetPieces += 1;
  }

  emit(state, {
    type: "GOAL",
    team: scoringTeam.side,
    playerId: scorer?.card.playerId,
    runtimeId: scorer?.runtimeId,
    message,
  });

  scheduleRestart(state, {
    type: "KICKOFF",
    teamIndex: otherTeamIndex(scoringTeamIndex),
    spot: { x: 0.5, y: 0.5 },
    pause: MATCH_CONFIG.setPieces.kickoffPause,
    emitStartEvent: false,
    preserveScene: true,
  });
}

function attemptDefensiveDuel(
  state: MatchState,
  owner: RuntimePlayer,
): boolean {
  const opponents = state.teams[otherTeamIndex(owner.teamIndex)].players.filter(
    (player) =>
      player.active &&
      !player.redCard &&
      !player.injured &&
      player.stunnedUntil <= state.t,
  );

  const defender = nearestPlayerToPoint(owner.pos, opponents);
  if (!defender || distanceBetween(owner.pos, defender.pos) > 0.035) {
    return false;
  }

  if (!defender.assignedPosition || !owner.assignedPosition) {
    return false;
  }

  const defenderStats = effectiveStats({
    player: defender.card,
    assignedPosition: defender.assignedPosition,
    energy: defender.energy,
    synergyBonus: defender.synergyBonus,
  });

  const ownerStats = effectiveStats({
    player: owner.card,
    assignedPosition: owner.assignedPosition,
    energy: owner.energy,
    synergyBonus: owner.synergyBonus,
  });

  const tackleProbability = clamp(
    0.24 +
      0.28 * (defenderStats.physical / 100) +
      0.16 * (defenderStats.intelligence / 100) +
      0.03 * (defenderStats.speed / 100) -
      0.22 * (ownerStats.technique / 100) -
      0.16 * (ownerStats.physical / 100) -
      0.05 * (ownerStats.speed / 100),
    0.08,
    0.62,
  );

  if (state.rng.chance(tackleProbability)) {
    state.teams[defender.teamIndex].stats.tackles += 1;
    state.teams[defender.teamIndex].stats.duelsWon += 1;

    const stunDuration = state.rng.between(
      MATCH_CONFIG.duels.loserStunMinSeconds,
      MATCH_CONFIG.duels.loserStunMaxSeconds,
    );
    owner.stunnedUntil = Math.max(
      owner.stunnedUntil,
      state.t + stunDuration,
    );

    defender.target = {
      x: clamp(
        defender.pos.x +
          attackDirection(defender.side) * 0.08,
        0.02,
        0.98,
      ),
      y: clamp(
        defender.pos.y + state.rng.between(-0.035, 0.035),
        0.04,
        0.96,
      ),
    };

    setControlledBall(state, defender);
    emit(state, {
      type: "TACKLE",
      team: defender.side,
      playerId: defender.card.playerId,
      runtimeId: defender.runtimeId,
      message: `${defender.card.shortName} récupère le ballon sur ${owner.card.shortName}.`,
    });
    maybeInjuryFromContact(state, owner, defender);
    return true;
  }

  // La stat Physique ne doit pas rendre mécaniquement un joueur plus fautif.
  // L'agressivité détaillée du dataset pourra être réintroduite plus tard.
  const foulProbability = 0.04;
  if (state.rng.chance(foulProbability)) {
    handleFoul(state, defender, owner);
    return true;
  }

  maybeInjuryFromContact(state, owner, defender);
  return false;
}

function handleFoul(
  state: MatchState,
  defender: RuntimePlayer,
  victim: RuntimePlayer,
): void {
  const team = state.teams[defender.teamIndex];
  team.stats.fouls += 1;

  emit(state, {
    type: "FOUL",
    team: defender.side,
    playerId: defender.card.playerId,
    runtimeId: defender.runtimeId,
    message: `Faute de ${defender.card.shortName} sur ${victim.card.shortName}.`,
  });

  const severity = state.rng.next();
  if (severity < 0.018) {
    giveRedCard(state, defender, "carton rouge direct");
  } else if (severity < 0.29) {
    giveYellowCard(state, defender);
  }

  maybeInjuryFromContact(state, victim, defender, 1.8);

  const penalty = isInsideOwnPenaltyArea(victim.pos, defender.side);
  scheduleRestart(state, {
    type: penalty ? "PENALTY" : "FREE_KICK",
    teamIndex: victim.teamIndex,
    spot: penalty ? penaltySpotForAttack(victim.side) : { ...victim.pos },
    pause: penalty
      ? MATCH_CONFIG.setPieces.penaltyPause
      : MATCH_CONFIG.setPieces.freeKickPause,
    message: penalty
      ? `Penalty pour ${state.teams[victim.teamIndex].name} !`
      : `Coup franc pour ${state.teams[victim.teamIndex].name}.`,
  });
}

function giveYellowCard(state: MatchState, player: RuntimePlayer): void {
  player.yellowCards += 1;
  state.teams[player.teamIndex].stats.yellowCards += 1;

  emit(state, {
    type: "YELLOW_CARD",
    team: player.side,
    playerId: player.card.playerId,
    runtimeId: player.runtimeId,
    message: `Carton jaune pour ${player.card.shortName}.`,
  });

  if (player.yellowCards >= 2) {
    giveRedCard(state, player, "deuxième carton jaune");
  }
}

function giveRedCard(
  state: MatchState,
  player: RuntimePlayer,
  reason: string,
): void {
  if (player.redCard) {
    return;
  }

  player.redCard = true;
  player.active = false;
  state.teams[player.teamIndex].stats.redCards += 1;

  emit(state, {
    type: "RED_CARD",
    team: player.side,
    playerId: player.card.playerId,
    runtimeId: player.runtimeId,
    message: `${player.card.shortName} est expulsé (${reason}).`,
  });

  state.notifications.suspensions.push({
    team: player.side,
    playerId: player.card.playerId,
    playerName: player.card.shortName,
    matches: 1,
    reason,
  });

  if (
    state.ball.mode === "CONTROLLED" &&
    state.ball.ownerId === player.runtimeId
  ) {
    state.ball = {
      mode: "LOOSE",
      pos: { ...player.pos },
      age: 0,
      velocity: { x: 0, y: 0 },
      deceleration: MATCH_CONFIG.ball.passDeceleration,
      lastTouchTeamIndex: player.teamIndex,
      lastTouchPlayerId: player.runtimeId,
    };
  }

  recomputeSynergy(state.teams[player.teamIndex]);
}

function maybeInjuryFromContact(
  state: MatchState,
  victim: RuntimePlayer,
  other: RuntimePlayer,
  multiplier = 1,
): void {
  if (victim.injured || !victim.active) {
    return;
  }

  const fatigueFactor = 1 + (100 - victim.energy) / 80;
  const physicalProtection = 1.25 - victim.card.stats.physical / 200;
  const probability =
    0.0012 * multiplier * fatigueFactor * physicalProtection;

  if (!state.rng.chance(probability)) {
    return;
  }

  victim.injured = true;

  emit(state, {
    type: "INJURY",
    team: victim.side,
    playerId: victim.card.playerId,
    runtimeId: victim.runtimeId,
    message: `${victim.card.shortName} est blessé.`,
  });

  state.notifications.injuries.push({
    team: victim.side,
    playerId: victim.card.playerId,
    playerName: victim.card.shortName,
    unavailableMatches: 1,
  });

  substitutePlayer(state, victim, "blessure");

  // Petit risque de blessure secondaire sur un choc violent.
  if (
    multiplier > 1.5 &&
    other.active &&
    !other.injured &&
    state.rng.chance(probability * 0.12)
  ) {
    other.injured = true;
    substitutePlayer(state, other, "blessure");
  }
}

function resolveLooseBall(state: MatchState): void {
  if (state.ball.mode !== "LOOSE") {
    return;
  }

  const predictedStop = predictLooseBallStop(state.ball);

  // Chaque équipe envoie au maximum deux joueurs vers la balle. L'éventuel
  // receveur visé est prioritaire, mais il doit physiquement rejoindre la balle.
  for (const team of state.teams) {
    const candidates = team.players
      .filter(
        (player) =>
          player.active &&
          !player.injured &&
          !player.redCard &&
          player.assignedPosition &&
          player.stunnedUntil <= state.t,
      )
      .sort((a, b) => {
        const aPriority =
          state.ball.mode === "LOOSE" &&
          a.runtimeId === state.ball.intendedReceiverId
            ? -0.08
            : 0;
        const bPriority =
          state.ball.mode === "LOOSE" &&
          b.runtimeId === state.ball.intendedReceiverId
            ? -0.08
            : 0;
        return (
          distanceBetween(a.pos, predictedStop) + aPriority -
          (distanceBetween(b.pos, predictedStop) + bPriority)
        );
      })
      .slice(0, 2);

    for (const player of candidates) {
      player.target = { ...predictedStop };
    }
  }

  // Pour une balle déjà quasiment immobile, une prise de contrôle n'est
  // possible qu'à très courte distance. Aucun joueur n'est téléporté dessus.
  tryControlLooseBall(state);
}

function tryControlLooseBall(
  state: MatchState,
): void {
  if (state.ball.mode !== "LOOSE") {
    return;
  }

  const looseBall = state.ball;
  const ballSpeed = vectorLength(looseBall.velocity ?? { x: 0, y: 0 });
  const candidates = state.allPlayers
    .filter(
      (player) =>
        player.active &&
        !player.injured &&
        !player.redCard &&
        player.assignedPosition &&
        player.stunnedUntil <= state.t &&
        !(
          looseBall.actorId === player.runtimeId &&
          looseBall.age < 0.45
        ),
    )
    .map((player) => {
      const stats = effectiveStats({
        player: player.card,
        assignedPosition: player.assignedPosition!,
        energy: player.energy,
        synergyBonus: player.synergyBonus,
      });
      const isIntendedGoalkeeperBackPass =
        player.assignedPosition === "GK" &&
        player.runtimeId === looseBall.intendedReceiverId &&
        player.teamIndex === looseBall.sourceTeamIndex &&
        looseBall.kind === "PASS";
      const controlRadius = isIntendedGoalkeeperBackPass
        ? MATCH_CONFIG.ball.goalkeeperBackPassControlRadius
        : lerp(
            MATCH_CONFIG.ball.controlRadiusMin,
            MATCH_CONFIG.ball.controlRadiusMax,
            stats.technique / 100,
          );
      return {
        player,
        stats,
        distance: distanceBetween(player.pos, looseBall.pos),
        controlRadius,
      };
    })
    .filter((candidate) => candidate.distance <= candidate.controlRadius)
    .sort((a, b) => {
      const aIntended =
        a.player.runtimeId === looseBall.intendedReceiverId ? -0.006 : 0;
      const bIntended =
        b.player.runtimeId === looseBall.intendedReceiverId ? -0.006 : 0;
      return a.distance + aIntended - (b.distance + bIntended);
    });

  for (const candidate of candidates) {
    const { player, stats } = candidate;
    const firstTouchQuality = clamp(
      (0.52 * stats.technique +
        0.26 * stats.passing +
        0.08 * stats.intelligence +
        0.14 * stats.physical) /
        100,
    );
    const speedDifficulty = clamp(
      ballSpeed / MATCH_CONFIG.ball.comfortableControlSpeed,
      0,
      1.8,
    );
    let controlProbability = clamp(
      0.30 +
        0.68 * firstTouchQuality -
        0.30 * Math.max(0, speedDifficulty - 0.45),
      0.10,
      0.98,
    );

    if (player.runtimeId === looseBall.intendedReceiverId) {
      controlProbability = clamp(controlProbability + 0.10, 0, 0.99);
    }

    if (
      player.assignedPosition === "GK" &&
      player.runtimeId === looseBall.intendedReceiverId &&
      player.teamIndex === looseBall.sourceTeamIndex &&
      looseBall.kind === "PASS"
    ) {
      // Contrôle au pied d'une passe volontaire : le gardien anticipe la
      // remise et bénéficie d'un rayon d'approche supérieur. Il ne "capte"
      // pas la balle avec les mains, mais il ne la regarde plus filer dans son
      // propre but comme un tir adverse.
      controlProbability = clamp(controlProbability + 0.24, 0, 0.995);
    }

    if (ballSpeed <= MATCH_CONFIG.ball.looseBallStopSpeed * 1.5) {
      controlProbability = Math.max(controlProbability, 0.94);
    }

    if (!state.rng.chance(controlProbability)) {
      // Mauvais contrôle : la balle est freinée et légèrement déviée, mais
      // continue d'exister physiquement au lieu d'être attribuée au joueur.
      const currentVelocity = state.ball.velocity ?? { x: 0, y: 0 };
      const angle = state.rng.between(-0.22, 0.22);
      state.ball.velocity = rotateVector(
        {
          x: currentVelocity.x * 0.72,
          y: currentVelocity.y * 0.72,
        },
        angle,
      );
      continue;
    }

    const passSourceTeam = state.ball.sourceTeamIndex;
    const passActorId = state.ball.actorId;
    const wasPass = state.ball.kind === "PASS";

    if (
      wasPass &&
      passSourceTeam !== undefined &&
      player.teamIndex === passSourceTeam &&
      player.runtimeId !== passActorId
    ) {
      state.teams[player.teamIndex].stats.passesCompleted += 1;
    } else if (
      wasPass &&
      passSourceTeam !== undefined &&
      player.teamIndex !== passSourceTeam
    ) {
      emit(state, {
        type: "INTERCEPTION",
        team: player.side,
        playerId: player.card.playerId,
        runtimeId: player.runtimeId,
        message: `${player.card.shortName} coupe la trajectoire et récupère le ballon.`,
      });
    }

    setControlledBall(state, player, { ...looseBall.pos });
    return;
  }
}

function predictLooseBallStop(ball: LooseBall): Vec2 {
  const velocity = ball.velocity ?? { x: 0, y: 0 };
  const speed = vectorLength(velocity);
  if (speed <= MATCH_CONFIG.ball.looseBallStopSpeed) {
    return { ...ball.pos };
  }

  const deceleration =
    ball.deceleration ?? MATCH_CONFIG.ball.passDeceleration;
  const stopDistance = (speed * speed) / (2 * Math.max(deceleration, 0.001));
  const direction = normalizeVector(velocity);

  return {
    x: clamp(ball.pos.x + direction.x * stopDistance, 0.02, 0.98),
    y: clamp(ball.pos.y + direction.y * stopDistance, 0.03, 0.97),
  };
}

function setControlledBall(
  state: MatchState,
  player: RuntimePlayer,
  contactPos: Vec2 = player.pos,
): void {
  if (state.possessionTeamIndex !== player.teamIndex) {
    state.possessionTeamIndex = player.teamIndex;
    state.possessionChangedAt = state.t;
    state.teams[player.teamIndex].stats.possessionRegains += 1;
  }

  state.ball = {
    mode: "CONTROLLED",
    ownerId: player.runtimeId,
    pos: { ...contactPos },
    controlOffset: {
      x: contactPos.x - player.pos.x,
      y: contactPos.y - player.pos.y,
    },
    controlAt: state.t,
  };
  state.controlStartedAt = state.t;
}

function updateOffBallRuns(state: MatchState): void {
  if (state.ball.mode !== "CONTROLLED") {
    return;
  }

  const owner = getPlayer(state, state.ball.ownerId);
  if (!owner) {
    return;
  }

  for (const team of state.teams) {
    const hasPossession = team.index === owner.teamIndex;

    for (const player of team.players) {
      if (!hasPossession || !player.active) {
        player.runTarget = null;
        player.runUntil = 0;
      } else if (player.runUntil <= state.t) {
        player.runTarget = null;
      }
    }

    if (!hasPossession) {
      continue;
    }

    const existingRuns = team.players.filter(
      (player) =>
        player.active &&
        player.runTarget &&
        player.runUntil > state.t,
    ).length;

    if (existingRuns >= 3) {
      continue;
    }

    const candidates = team.players.filter(
      (player) =>
        player.active &&
        player.runtimeId !== owner.runtimeId &&
        player.assignedPosition &&
        player.assignedPosition !== "GK" &&
        player.runUntil <= state.t &&
        player.stunnedUntil <= state.t,
    );

    for (const player of candidates) {
      if (team.players.filter(
        (candidate) =>
          candidate.active &&
          candidate.runTarget &&
          candidate.runUntil > state.t,
      ).length >= 3) {
        break;
      }

      const stats = effectiveStats({
        player: player.card,
        assignedPosition: player.assignedPosition!,
        energy: player.energy,
        synergyBonus: player.synergyBonus,
      });

      const positionFactor =
        player.assignedPosition === "ST" ||
        player.assignedPosition === "LW" ||
        player.assignedPosition === "RW"
          ? 1.35
          : player.assignedPosition === "CAM" ||
              player.assignedPosition === "LM" ||
              player.assignedPosition === "RM"
            ? 1.1
            : player.assignedPosition === "CM"
              ? 0.82
              : 0.38;

      const roleFactor =
        player.role === "OFFENSIVE"
          ? 1.08
          : player.role === "CREATOR"
            ? 1.03
            : player.role === "DEFENSIVE"
              ? 0.85
              : 1;

      const chance =
        MATCH_CONFIG.offBallRuns.baseChancePerDecision *
        positionFactor *
        roleFactor *
        (0.75 + 0.25 * stats.intelligence / 100);

      if (!state.rng.chance(chance)) {
        continue;
      }

      const direction = attackDirection(player.side);
      const depth = state.rng.between(
        MATCH_CONFIG.offBallRuns.minDepth,
        MATCH_CONFIG.offBallRuns.maxDepth,
      );
      const lateralFreedom =
        player.assignedPosition === "LW" ||
        player.assignedPosition === "RW" ||
        player.assignedPosition === "LM" ||
        player.assignedPosition === "RM"
          ? 0.10
          : 0.07;

      const rawRunTarget = {
        x: clamp(
          player.pos.x + direction * depth,
          0.05,
          0.95,
        ),
        y: clamp(
          player.pos.y +
            state.rng.between(-lateralFreedom, lateralFreedom),
          0.06,
          0.94,
        ),
      };

      player.runTarget = MATCH_CONFIG.offsides.enabled
        ? adjustRunTargetForOffside(
            state,
            owner,
            player,
            rawRunTarget,
            stats.intelligence,
          )
        : rawRunTarget;
      player.runUntil =
        state.t +
        state.rng.between(
          MATCH_CONFIG.offBallRuns.minDuration,
          MATCH_CONFIG.offBallRuns.maxDuration,
        );

      team.stats.progressiveRuns += 1;
    }
  }
}

function updatePlayerTargets(state: MatchState): void {
  const owner =
    state.ball.mode === "CONTROLLED"
      ? getPlayer(state, state.ball.ownerId)
      : undefined;
  const ballPosition = state.ball.pos;

  for (const team of state.teams) {
    const hasPossession = state.possessionTeamIndex === team.index;
    const direction = attackDirection(team.side);
    const ballProgress = toTeamProgress(ballPosition.x, team.side);

    const tacticAdvance =
      team.selection.tactics?.blockHeight === "HIGH"
        ? 0.055
        : team.selection.tactics?.blockHeight === "LOW"
          ? -0.055
          : 0;

    const transitionBlend = clamp(
      (state.t - state.possessionChangedAt) / 3.5,
    );
    const phaseAdvance = hasPossession
      ? lerp(
          MATCH_CONFIG.block.defenseBaseRetreat,
          MATCH_CONFIG.block.attackBaseAdvance,
          transitionBlend,
        )
      : lerp(
          MATCH_CONFIG.block.attackBaseAdvance,
          MATCH_CONFIG.block.defenseBaseRetreat,
          transitionBlend,
        );
    const ballFollow =
      (ballProgress - 0.5) *
      (hasPossession
        ? MATCH_CONFIG.block.ballFollowAttack
        : MATCH_CONFIG.block.ballFollowDefense);
    const blockAdvance = clamp(
      phaseAdvance + tacticAdvance + ballFollow,
      -0.19,
      0.22,
    );

    const buildUp = team.selection.tactics?.buildUp ?? "BALANCED";
    const widthTacticModifier =
      buildUp === "SHORT" ? -0.05 : buildUp === "DIRECT" ? 0.04 : 0;
    const widthScale =
      (hasPossession
        ? MATCH_CONFIG.block.attackWidth
        : MATCH_CONFIG.block.defenseWidth) + widthTacticModifier;
    const depthScale = hasPossession
      ? MATCH_CONFIG.block.attackDepth
      : MATCH_CONFIG.block.defenseDepth;
    const lateralShift =
      (ballPosition.y - 0.5) *
      (hasPossession
        ? MATCH_CONFIG.block.lateralBallFollowAttack
        : MATCH_CONFIG.block.lateralBallFollowDefense);

    const activePlayers = team.players.filter(
      (player) => player.active && player.slotId,
    );

    for (const player of activePlayers) {
      const slot = getSlot(player.slotId!);
      const anchor = anchorForSide(slot.anchor, player.side);
      const anchorProgress = toTeamProgress(anchor.x, player.side);
      const roleShift =
        player.role === "OFFENSIVE"
          ? 0.012
          : player.role === "DEFENSIVE"
            ? -0.012
            : 0;

      const lineFollowFactor =
        player.assignedPosition === "GK"
          ? 0.34
          : player.assignedPosition === "CB" ||
              player.assignedPosition === "LB" ||
              player.assignedPosition === "RB"
            ? 0.82
            : player.assignedPosition === "ST" ||
                player.assignedPosition === "LW" ||
                player.assignedPosition === "RW"
              ? 1.08
              : 1;

      const targetProgress = clamp(
        MATCH_CONFIG.block.baseCenterProgress +
          (anchorProgress - MATCH_CONFIG.block.baseCenterProgress) * depthScale +
          blockAdvance * lineFollowFactor +
          roleShift,
        0.025,
        0.975,
      );

      let target: Vec2 = {
        x: fromTeamProgress(targetProgress, player.side),
        y: clamp(
          0.5 + (anchor.y - 0.5) * widthScale + lateralShift,
          0.035,
          0.965,
        ),
      };

      if (
        hasPossession &&
        player.runtimeId !== owner?.runtimeId &&
        player.runTarget &&
        player.runUntil > state.t
      ) {
        target = { ...player.runTarget };
      }

      player.target = target;
    }

    // Le pressing est une déformation locale du bloc, pas une téléportation de
    // toute la structure vers le porteur.
    if (owner && owner.teamIndex !== team.index) {
      const defenders = activePlayers
        .filter(
          (player) =>
            player.assignedPosition !== "GK" &&
            player.stunnedUntil <= state.t,
        )
        .sort(
          (a, b) =>
            distanceBetween(a.pos, owner.pos) -
            distanceBetween(b.pos, owner.pos),
        );

      const pressers = defenders.slice(
        0,
        defenders[0]?.role === "PRESSING" ? 2 : 1,
      );

      pressers.forEach((presser, index) => {
        const pressureDistance = index === 0 ? 0.012 : 0.035;
        presser.target = {
          x: clamp(
            owner.pos.x -
              attackDirection(owner.side) * pressureDistance,
            0.02,
            0.98,
          ),
          y: clamp(
            owner.pos.y + (index === 0 ? 0 : 0.025),
            0.03,
            0.97,
          ),
        };
      });
    }
  }
}

function setDribbleTarget(
  state: MatchState,
  owner: RuntimePlayer,
): void {
  const direction = attackDirection(owner.side);
  const opponents = state.teams[otherTeamIndex(owner.teamIndex)].players.filter(
    (player) => player.active,
  );

  const nearby = nearestPlayerToPoint(owner.pos, opponents);
  let lateral = state.rng.between(-0.035, 0.035);

  if (nearby && Math.abs(nearby.pos.y - owner.pos.y) < 0.05) {
    lateral =
      nearby.pos.y > owner.pos.y
        ? -state.rng.between(0.025, 0.06)
        : state.rng.between(0.025, 0.06);
  }

  owner.target = {
    x: clamp(owner.pos.x + direction * 0.15, 0.02, 0.98),
    y: clamp(owner.pos.y + lateral, 0.04, 0.96),
  };
}

function updateMovement(state: MatchState, dt: number): void {
  for (const player of state.allPlayers) {
    if (!player.active || !player.assignedPosition) {
      continue;
    }

    const stats = effectiveStats({
      player: player.card,
      assignedPosition: player.assignedPosition,
      energy: player.energy,
      synergyBonus: player.synergyBonus,
    });

    const controlled =
      state.ball.mode === "CONTROLLED" &&
      state.ball.ownerId === player.runtimeId;

    let speedPerSecond =
      MATCH_CONFIG.movement.minSpeedPerLogicalSecond +
      (stats.speed / 100) *
        (MATCH_CONFIG.movement.maxSpeedPerLogicalSecond -
          MATCH_CONFIG.movement.minSpeedPerLogicalSecond);

    if (player.stunnedUntil > state.t) {
      speedPerSecond *= MATCH_CONFIG.duels.stunnedSpeedMultiplier;
    }

    if (
      player.assignedPosition === "GK" &&
      state.ball.mode === "LOOSE" &&
      state.ball.kind === "SHOT" &&
      state.ball.sourceTeamIndex !== player.teamIndex
    ) {
      // Réflexe/détente du gardien : accélération contextuelle, mais le joueur
      // doit toujours atteindre physiquement la trajectoire de balle.
      speedPerSecond *= 1.45 + (stats.intelligence / 100) * 0.65;
    }

    const isMakingRun =
      Boolean(player.runTarget) && player.runUntil > state.t;
    if (state.restart) {
      speedPerSecond *= MATCH_CONFIG.movement.restartRepositionMultiplier;
    } else if (
      !controlled &&
      !isMakingRun &&
      state.ball.mode !== "LOOSE"
    ) {
      speedPerSecond *= MATCH_CONFIG.movement.shapeRepositionMultiplier;
    }

    if (controlled) {
      const controlRatio = clamp(stats.technique / 100);
      const multiplier =
        MATCH_CONFIG.movement.controlledBallSpeedMultiplierMin +
        controlRatio *
          (MATCH_CONFIG.movement.controlledBallSpeedMultiplierMax -
            MATCH_CONFIG.movement.controlledBallSpeedMultiplierMin);
      speedPerSecond *= multiplier;
    }

    const before = { ...player.pos };
    player.pos = moveTowards(
      player.pos,
      player.target,
      speedPerSecond * dt,
    );

    const moved = distanceBetween(before, player.pos);
    const roleCost =
      player.role === "PRESSING"
        ? MATCH_CONFIG.fatigue.pressingCostMultiplier
        : 1;
    const physicalEfficiency = 1.16 - player.card.stats.physical * 0.0035;
    player.energy = clamp(
      player.energy -
        moved *
          MATCH_CONFIG.fatigue.distanceEnergyCost *
          roleCost *
          physicalEfficiency,
      0,
      100,
    );
  }
}

function evaluateAutomaticSubstitutions(state: MatchState): void {
  const displayedMinute =
    (state.t / state.logicalDuration) * MATCH_CONFIG.displayedMinutes;

  if (displayedMinute < MATCH_CONFIG.substitutions.minimumDisplayedMinute) {
    return;
  }

  for (const team of state.teams) {
    if (team.substitutionsUsed >= MATCH_CONFIG.maxSubstitutions) {
      continue;
    }

    if (
      displayedMinute - team.lastSubstitutionDisplayedMinute <
      MATCH_CONFIG.substitutions.cooldownDisplayedMinutes
    ) {
      continue;
    }

    const plannedTarget = MATCH_CONFIG.substitutions.plannedWindows.filter(
      (minute) => displayedMinute >= minute,
    ).length;
    const plannedRotationDue = team.substitutionsUsed < plannedTarget;

    const candidates = team.players
      .filter(
        (player) =>
          player.active &&
          !player.injured &&
          !player.redCard &&
          player.assignedPosition !== "GK",
      )
      .sort((a, b) => substitutionPriority(b) - substitutionPriority(a));

    const candidate = candidates[0];
    if (!candidate) {
      continue;
    }

    const emergencyFatigue =
      candidate.energy < MATCH_CONFIG.substitutions.emergencyEnergyThreshold;
    const usefulPlannedRotation =
      plannedRotationDue &&
      (candidate.energy < MATCH_CONFIG.substitutions.plannedEnergyThreshold ||
        candidate.yellowCards > 0 ||
        displayedMinute >= 78);

    if (!emergencyFatigue && !usefulPlannedRotation) {
      continue;
    }

    const reason = candidate.yellowCards > 0
      ? "carton"
      : emergencyFatigue
        ? "fatigue"
        : "rotation";

    substitutePlayer(state, candidate, reason);
  }
}

function substitutionPriority(player: RuntimePlayer): number {
  const fatigueScore = 100 - player.energy;
  const yellowScore = player.yellowCards > 0 ? 18 : 0;
  const roleScore = player.role === "PRESSING" ? 5 : 0;
  return fatigueScore + yellowScore + roleScore;
}

function substitutePlayer(
  state: MatchState,
  outgoing: RuntimePlayer,
  reason: string,
): boolean {
  const team = state.teams[outgoing.teamIndex];

  if (
    team.substitutionsUsed >= MATCH_CONFIG.maxSubstitutions ||
    !outgoing.assignedPosition ||
    !outgoing.slotId
  ) {
    if (outgoing.injured) {
      outgoing.active = false;
    }
    return false;
  }

  const outgoingIsGoalkeeper = outgoing.assignedPosition === "GK";
  const bench = team.players
    .filter(
      (player) =>
        !player.active &&
        !player.injured &&
        !player.redCard &&
        player.slotId === null &&
        (outgoingIsGoalkeeper
          ? player.card.primaryPosition === "GK"
          : player.card.primaryPosition !== "GK"),
    )
    .sort(
      (a, b) =>
        positionCompatibility(b.card, outgoing.assignedPosition!) -
        positionCompatibility(a.card, outgoing.assignedPosition!),
    );

  const incoming = bench[0];
  if (!incoming) {
    if (outgoing.injured) {
      outgoing.active = false;
    }
    return false;
  }

  const inheritedSlot = outgoing.slotId;
  const inheritedPosition = outgoing.assignedPosition;
  const inheritedRole = outgoing.role;
  const inheritedPositionOnPitch = { ...outgoing.pos };

  outgoing.active = false;
  incoming.active = true;
  incoming.slotId = inheritedSlot;
  incoming.assignedPosition = inheritedPosition;
  incoming.role = inheritedRole;
  incoming.pos = inheritedPositionOnPitch;
  incoming.target = inheritedPositionOnPitch;
  incoming.energy = 100;

  team.substitutionsUsed += 1;
  team.stats.substitutions += 1;
  team.lastSubstitutionDisplayedMinute =
    (state.t / state.logicalDuration) * MATCH_CONFIG.displayedMinutes;
  recomputeSynergy(team);

  if (
    state.ball.mode === "CONTROLLED" &&
    state.ball.ownerId === outgoing.runtimeId
  ) {
    setControlledBall(state, incoming);
  }

  emit(state, {
    type: "SUBSTITUTION",
    team: team.side,
    playerId: incoming.card.playerId,
    runtimeId: incoming.runtimeId,
    message: `${incoming.card.shortName} remplace ${outgoing.card.shortName} (${reason}).`,
  });

  return true;
}

function recomputeSynergy(team: RuntimeTeam): void {
  const bySlot = new Map(
    team.players
      .filter((player) => player.active && player.slotId)
      .map((player) => [player.slotId!, player]),
  );

  for (const player of team.players) {
    if (!player.active || !player.slotId) {
      player.synergyBonus = 0;
      continue;
    }

    const slot = getSlot(player.slotId);
    const matchingNeighbors = slot.neighbors
      .map((neighborId) => bySlot.get(neighborId))
      .filter(
        (neighbor): neighbor is RuntimePlayer =>
          Boolean(neighbor) &&
          neighbor!.card.nationalityName ===
            player.card.nationalityName,
      ).length;

    player.synergyBonus = Math.min(
      MATCH_CONFIG.synergy.maxIntelligenceBonus,
      matchingNeighbors *
        MATCH_CONFIG.synergy.intelligencePerMatchingNeighbor,
    );
  }
}


type ScheduleRestartParams = {
  type: RestartType;
  teamIndex: TeamIndex;
  spot: Vec2;
  pause: number;
  message?: string;
  emitStartEvent?: boolean;
  preserveScene?: boolean;
};

function scheduleRestart(
  state: MatchState,
  params: ScheduleRestartParams,
): void {
  const team = state.teams[params.teamIndex];
  const spot = {
    x: clamp(params.spot.x, 0, 1),
    y: clamp(params.spot.y, 0, 1),
  };
  const taker = selectRestartTaker(state, params.type, params.teamIndex, spot);
  if (!taker) return;

  const directShotPreferred =
    params.type === "PENALTY" ||
    (params.type === "FREE_KICK" &&
      distanceBetween(spot, opponentGoal(team.side)) <=
        MATCH_CONFIG.setPieces.closeFreeKickDistance);
  const wallPlayerIds =
    params.type === "FREE_KICK" && directShotPreferred
      ? selectWallPlayers(state, otherTeamIndex(params.teamIndex), spot)
      : [];

  const deadBallPos = params.preserveScene
    ? { ...state.ball.pos }
    : { ...spot };
  state.ball = { mode: "DEAD", pos: deadBallPos };
  state.restart = {
    type: params.type,
    teamIndex: params.teamIndex,
    spot,
    takerId: taker.runtimeId,
    resumeAt: state.t + params.pause,
    directShotPreferred,
    wallPlayerIds,
    countsForAddedTime: params.type !== "KICKOFF" || state.t > 0,
  };
  state.possessionTeamIndex = params.teamIndex;

  const stats = team.stats;
  switch (params.type) {
    case "THROW_IN": stats.throwIns += 1; break;
    case "CORNER": stats.corners += 1; break;
    case "GOAL_KICK": stats.goalKicks += 1; break;
    case "FREE_KICK": stats.freeKicks += 1; break;
    case "PENALTY": stats.penalties += 1; break;
    default: break;
  }

  if (!params.preserveScene) {
    positionPlayersForRestart(state, state.restart);
  }

  if (params.emitStartEvent ?? true) {
    const defaultMessage = restartDefaultMessage(params.type, team.name);
    emit(state, {
      type: params.type,
      team: team.side,
      playerId: taker.card.playerId,
      runtimeId: taker.runtimeId,
      message: params.message ?? defaultMessage,
    });
  }
}

function executeRestart(state: MatchState): void {
  const restart = state.restart;
  if (!restart) return;

  const team = state.teams[restart.teamIndex];
  if (restart.type === "KICKOFF") {
    positionPlayersForRestart(state, restart);
  }
  let taker = getPlayer(state, restart.takerId);
  if (!taker?.active) {
    taker = selectRestartTaker(state, restart.type, restart.teamIndex, restart.spot);
  }
  if (!taker) {
    state.restart = null;
    return;
  }

  taker.pos = { ...restart.spot };
  taker.target = { ...restart.spot };
  state.restart = null;

  if (restart.type === "KICKOFF") {
    setControlledBall(state, taker);
    emit(state, {
      type: "KICKOFF",
      team: team.side,
      playerId: taker.card.playerId,
      runtimeId: taker.runtimeId,
      message: `${team.name} remet le ballon en jeu.`,
    });
    return;
  }

  if (restart.type === "PENALTY") {
    setControlledBall(state, taker);
    startShot(state, taker, "PENALTY");
    return;
  }

  if (restart.type === "FREE_KICK" && restart.directShotPreferred) {
    const stats = taker.assignedPosition
      ? effectiveStats({
          player: taker.card,
          assignedPosition: taker.assignedPosition,
          energy: taker.energy,
          synergyBonus: taker.synergyBonus,
        })
      : null;
    const directChance = stats
      ? clamp(0.25 + 0.42 * (stats.intelligence / 100) + 0.18 * (stats.shooting / 100), 0.2, 0.82)
      : 0.35;
    if (state.rng.chance(directChance)) {
      setControlledBall(state, taker);
      startShot(state, taker, "FREE_KICK");
      return;
    }
  }

  const target = selectRestartPassTarget(state, restart, taker);
  if (target) {
    setControlledBall(state, taker);
    startPass(state, taker, target.runtimeId, {
      skipOffside: true,
      setPieceOrigin: restart.type,
    });
  } else {
    setControlledBall(state, taker);
  }
}

function restartDefaultMessage(type: RestartType, teamName: string): string {
  switch (type) {
    case "THROW_IN": return `Touche pour ${teamName}.`;
    case "CORNER": return `Corner pour ${teamName}.`;
    case "GOAL_KICK": return `Six mètres pour ${teamName}.`;
    case "FREE_KICK": return `Coup franc pour ${teamName}.`;
    case "PENALTY": return `Penalty pour ${teamName} !`;
    case "KICKOFF": return `Coup d'envoi pour ${teamName}.`;
  }
}

function selectRestartTaker(
  state: MatchState,
  type: RestartType,
  teamIndex: TeamIndex,
  spot: Vec2,
): RuntimePlayer | undefined {
  const team = state.teams[teamIndex];
  const active = team.players.filter((player) => player.active && !player.redCard && !player.injured);
  if (type === "GOAL_KICK") {
    return findActiveBySlot(team, "GK") ?? active[0];
  }
  if (type === "PENALTY") {
    return [...active]
      .filter((player) => player.assignedPosition !== "GK")
      .sort((a, b) => b.card.stats.shooting - a.card.stats.shooting)[0];
  }

  const outfield = active.filter((player) => player.assignedPosition !== "GK");
  if (type === "FREE_KICK") {
    return [...outfield]
      .sort((a, b) => {
        const da = distanceBetween(a.pos, spot) - (a.card.stats.shooting + a.card.stats.passing) / 2500;
        const db = distanceBetween(b.pos, spot) - (b.card.stats.shooting + b.card.stats.passing) / 2500;
        return da - db;
      })[0];
  }
  return [...outfield].sort((a, b) => distanceBetween(a.pos, spot) - distanceBetween(b.pos, spot))[0];
}

function selectRestartPassTarget(
  state: MatchState,
  restart: RestartState,
  taker: RuntimePlayer,
): RuntimePlayer | undefined {
  const teammates = state.teams[restart.teamIndex].players.filter(
    (player) => player.active && player.runtimeId !== taker.runtimeId,
  );

  if (restart.type === "CORNER") {
    return [...teammates]
      .filter((player) => player.assignedPosition !== "GK")
      .sort((a, b) => {
        const aScore = a.card.stats.physical * 0.55 + a.card.stats.shooting * 0.45;
        const bScore = b.card.stats.physical * 0.55 + b.card.stats.shooting * 0.45;
        return bScore - aScore;
      })[0];
  }

  if (restart.type === "GOAL_KICK") {
    const preferred = teammates.filter((player) => ["CB", "LB", "RB", "CDM"].includes(player.assignedPosition ?? ""));
    return state.rng.pick(preferred.length > 0 ? preferred : teammates);
  }

  return [...teammates]
    .filter((player) => player.assignedPosition !== "GK")
    .sort((a, b) => distanceBetween(a.pos, restart.spot) - distanceBetween(b.pos, restart.spot))[0];
}

function selectWallPlayers(
  state: MatchState,
  defendingTeamIndex: TeamIndex,
  spot: Vec2,
): string[] {
  const team = state.teams[defendingTeamIndex];
  const count = clamp(
    Math.round(3 + (1 - distanceBetween(spot, opponentGoal(state.teams[otherTeamIndex(defendingTeamIndex)].side))) * 2),
    MATCH_CONFIG.setPieces.wallMinPlayers,
    MATCH_CONFIG.setPieces.wallMaxPlayers,
  );
  return team.players
    .filter((player) => player.active && player.assignedPosition !== "GK")
    .sort((a, b) => distanceBetween(a.pos, spot) - distanceBetween(b.pos, spot))
    .slice(0, count)
    .map((player) => player.runtimeId);
}

function positionPlayersForRestart(
  state: MatchState,
  restart: RestartState,
): void {
  // Un arrêt de jeu autorise un repositionnement complet : on repart d'une
  // structure propre avant d'appliquer les positions spécifiques du coup de pied arrêté.
  for (const team of state.teams) {
    for (const player of team.players) {
      if (!player.active || !player.slotId) continue;
      const anchor = anchorForSide(getSlot(player.slotId).anchor, player.side);
      player.pos = { ...anchor };
      player.target = { ...anchor };
      player.runTarget = null;
      player.runUntil = 0;
    }
  }

  const taker = getPlayer(state, restart.takerId);
  if (taker) {
    taker.pos = { ...restart.spot };
    taker.target = { ...restart.spot };
  }

  const attackingTeam = state.teams[restart.teamIndex];
  const defendingTeam = state.teams[otherTeamIndex(restart.teamIndex)];
  const direction = attackDirection(attackingTeam.side);
  const targetGoal = opponentGoal(attackingTeam.side);

  if (restart.type === "KICKOFF") {
    const striker = findActiveBySlot(attackingTeam, "ST") ?? taker;
    if (striker) {
      striker.pos = { x: 0.5 - direction * 0.012, y: 0.5 };
      striker.target = { ...striker.pos };
      restart.takerId = striker.runtimeId;
    }
    return;
  }

  if (restart.type === "CORNER") {
    const attackers = attackingTeam.players.filter((player) => player.active && player.runtimeId !== restart.takerId && player.assignedPosition !== "GK");
    attackers.forEach((player, index) => {
      const progress = 0.86 + (index % 3) * 0.025;
      player.pos = {
        x: fromTeamProgress(progress, attackingTeam.side),
        y: clamp(0.36 + (index % 5) * 0.07, 0.30, 0.70),
      };
      player.target = { ...player.pos };
    });
    defendingTeam.players.filter((player) => player.active && player.assignedPosition !== "GK").forEach((player, index) => {
      player.pos = {
        x: fromTeamProgress(0.88 - (index % 2) * 0.025, attackingTeam.side),
        y: clamp(0.34 + (index % 6) * 0.065, 0.28, 0.72),
      };
      player.target = { ...player.pos };
    });
  }

  if (restart.type === "PENALTY") {
    // Les deux gardiens restent dans LEUR propre but. Dans les versions
    // précédentes, seul le gardien défenseur était exclu du repositionnement
    // collectif : le gardien de l'équipe qui tirait le penalty pouvait donc
    // être envoyé près de la surface adverse.
    const defendingKeeper = findActiveBySlot(defendingTeam, "GK");
    const attackingKeeper = findActiveBySlot(attackingTeam, "GK");

    if (defendingKeeper) {
      const defendedGoal = ownGoal(defendingKeeper.side);
      defendingKeeper.pos = {
        x: defendingKeeper.side === "HOME" ? 0.018 : 0.982,
        y: defendedGoal.y,
      };
      defendingKeeper.target = { ...defendingKeeper.pos };
    }

    if (attackingKeeper) {
      const own = ownGoal(attackingKeeper.side);
      attackingKeeper.pos = {
        x: attackingKeeper.side === "HOME" ? 0.028 : 0.972,
        y: own.y,
      };
      attackingKeeper.target = { ...attackingKeeper.pos };
    }

    const outsideProgress = 0.78;
    [...attackingTeam.players, ...defendingTeam.players]
      .filter(
        (player) =>
          player.active &&
          player.runtimeId !== restart.takerId &&
          player.assignedPosition !== "GK",
      )
      .forEach((player, index) => {
        player.pos = {
          x: fromTeamProgress(
            outsideProgress - (index % 2) * 0.025,
            attackingTeam.side,
          ),
          y: clamp(0.28 + (index % 8) * 0.065, 0.24, 0.76),
        };
        player.target = { ...player.pos };
      });
  }

  if (restart.type === "FREE_KICK" && restart.wallPlayerIds.length > 0) {
    const toGoal = normalizeVector({
      x: targetGoal.x - restart.spot.x,
      y: targetGoal.y - restart.spot.y,
    });
    const perpendicular = { x: -toGoal.y, y: toGoal.x };
    restart.wallPlayerIds.forEach((runtimeId, index) => {
      const player = getPlayer(state, runtimeId);
      if (!player) return;
      const offset = (index - (restart.wallPlayerIds.length - 1) / 2) * 0.022;
      player.pos = {
        x: clamp(restart.spot.x + toGoal.x * MATCH_CONFIG.setPieces.wallDistance + perpendicular.x * offset, 0.02, 0.98),
        y: clamp(restart.spot.y + toGoal.y * MATCH_CONFIG.setPieces.wallDistance + perpendicular.y * offset, 0.03, 0.97),
      };
      player.target = { ...player.pos };
    });
  }
}

function isInsideOwnPenaltyArea(pos: Vec2, defendingSide: TeamSide): boolean {
  const progress = toTeamProgress(pos.x, defendingSide);
  return (
    progress <= MATCH_CONFIG.setPieces.penaltyAreaDepth &&
    Math.abs(pos.y - 0.5) <= MATCH_CONFIG.setPieces.penaltyAreaHalfWidth
  );
}

function penaltySpotForAttack(attackingSide: TeamSide): Vec2 {
  return {
    x: attackingSide === "HOME"
      ? 1 - MATCH_CONFIG.setPieces.penaltySpotDistanceFromGoal
      : MATCH_CONFIG.setPieces.penaltySpotDistanceFromGoal,
    y: 0.5,
  };
}

function lineYAtX(from: Vec2, to: Vec2, x: number): number {
  const dx = to.x - from.x;
  if (Math.abs(dx) < 1e-9) return to.y;
  const t = (x - from.x) / dx;
  return from.y + (to.y - from.y) * t;
}

function logicalExtraToDisplayedMinutes(
  state: MatchState,
  logicalSeconds: number,
): number {
  return (logicalSeconds / state.periodRegulationDuration) * 45;
}

function currentClockLabel(state: MatchState): string {
  const regulation = state.periodRegulationDuration;
  const elapsed = state.periodElapsed;
  const baseMinute = state.period === 1 ? 0 : 45;

  if (elapsed <= regulation) {
    const seconds = baseMinute * 60 + (elapsed / regulation) * 45 * 60;
    const minute = Math.floor(seconds / 60);
    const second = Math.floor(seconds % 60);
    return `${minute}:${String(second).padStart(2, "0")}`;
  }

  const addedSeconds = ((elapsed - regulation) / regulation) * 45 * 60;
  const addedMinute = Math.floor(addedSeconds / 60) + 1;
  const marker = state.period === 1 ? 45 : 90;
  return `${marker}+${addedMinute}`;
}

function resetForKickoff(
  state: MatchState,
  kickoffTeamIndex: TeamIndex,
): void {
  for (const team of state.teams) {
    for (const player of team.players) {
      if (!player.active || !player.slotId) {
        continue;
      }
      const slot = getSlot(player.slotId);
      const anchor = anchorForSide(slot.anchor, player.side);
      player.pos = { ...anchor };
      player.target = { ...anchor };
    }
  }

  const kickoffTeam = state.teams[kickoffTeamIndex];
  const owner =
    findActiveBySlot(kickoffTeam, "ST") ??
    firstActiveOutfield(kickoffTeam);

  owner.pos = {
    x: 0.5 - attackDirection(owner.side) * 0.012,
    y: 0.5,
  };
  owner.target = { ...owner.pos };

  setControlledBall(state, owner);
}

function captureFrame(state: MatchState): void {
  const frame: ReplayFrame = {
    t: round(state.t, 3),
    clock: {
      period: state.period,
      periodElapsed: round(state.periodElapsed, 3),
      regulationPeriodDuration: state.periodRegulationDuration,
    },
    ball: {
      x: round(state.ball.pos.x),
      y: round(state.ball.pos.y),
      ownerId:
        state.ball.mode === "CONTROLLED"
          ? state.ball.ownerId
          : null,
      dead: state.ball.mode === "DEAD",
    },
    players: state.allPlayers.map((player) => ({
      id: player.runtimeId,
      x: round(player.pos.x),
      y: round(player.pos.y),
      energy: round(player.energy, 1),
      active: player.active,
    })),
  };

  const last = state.frames[state.frames.length - 1];
  if (!last || Math.abs(last.t - frame.t) > 0.001) {
    state.frames.push(frame);
  }
}

function emit(
  state: MatchState,
  event: Omit<MatchEvent, "t">,
): void {
  if (!state.recordReplay) {
    return;
  }

  state.events.push({
    t: round(state.t, 3),
    clockLabel: event.clockLabel ?? currentClockLabel(state),
    ...event,
  });
}

function updatePossessionCounter(state: MatchState): void {
  if (state.ball.mode === "DEAD") {
    return;
  }
  state.teams[state.possessionTeamIndex].stats.possessionTicks += 1;
}

function buildReplayMetadata(
  players: RuntimePlayer[],
): ReplayPlayerMeta[] {
  return players.map((player) => ({
    runtimeId: player.runtimeId,
    playerId: player.card.playerId,
    team: player.side,
    shortName: player.card.shortName,
    nationalityName: player.card.nationalityName,
    position: player.assignedPosition,
    shirtNumber: player.shirtNumber,
  }));
}

function estimateShotQuality(pos: Vec2, side: TeamSide): number {
  const goal = opponentGoal(side);
  const distance = distanceBetween(pos, goal);
  const angleFactor = clamp(1 - Math.abs(pos.y - 0.5) * 1.2, 0.22, 1);
  const distanceFactor = 1 / (1 + Math.exp((distance - 0.25) * 15));
  return clamp(distanceFactor * angleFactor);
}

function passingLaneRisk(
  from: Vec2,
  to: Vec2,
  opponents: RuntimePlayer[],
): number {
  if (opponents.length === 0) {
    return 0;
  }

  const minDistance = Math.min(
    ...opponents.map((opponent) =>
      pointToSegmentDistance(opponent.pos, from, to),
    ),
  );

  return clamp((0.065 - minDistance) / 0.065);
}

function spaceAheadScore(
  owner: RuntimePlayer,
  opponents: RuntimePlayer[],
): number {
  const direction = attackDirection(owner.side);
  const ahead = {
    x: clamp(owner.pos.x + direction * 0.1, 0, 1),
    y: owner.pos.y,
  };
  return clamp(nearestDistance(ahead, opponents) / 0.16);
}

function pointToSegmentDistance(
  point: Vec2,
  start: Vec2,
  end: Vec2,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return distanceBetween(point, start);
  }

  const t = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) /
      lengthSquared,
  );

  const projection = {
    x: start.x + t * dx,
    y: start.y + t * dy,
  };

  return distanceBetween(point, projection);
}

function nearestDistance(
  point: Vec2,
  players: RuntimePlayer[],
): number {
  if (players.length === 0) {
    return 1;
  }

  return Math.min(
    ...players.map((player) => distanceBetween(point, player.pos)),
  );
}

function nearestPlayerToPoint(
  point: Vec2,
  players: RuntimePlayer[],
): RuntimePlayer | undefined {
  return players.reduce<RuntimePlayer | undefined>((best, player) => {
    if (!best) {
      return player;
    }
    return distanceBetween(point, player.pos) <
      distanceBetween(point, best.pos)
      ? player
      : best;
  }, undefined);
}


function toTeamProgress(worldX: number, side: TeamSide): number {
  return side === "HOME" ? worldX : 1 - worldX;
}

function fromTeamProgress(progress: number, side: TeamSide): number {
  return side === "HOME" ? progress : 1 - progress;
}

function secondLastOpponentProgress(
  state: MatchState,
  attackingTeamIndex: TeamIndex,
): number {
  const attackingSide = state.teams[attackingTeamIndex].side;
  const opponents = state.teams[otherTeamIndex(attackingTeamIndex)].players
    .filter((player) => player.active && !player.redCard)
    .map((player) => toTeamProgress(player.pos.x, attackingSide))
    .sort((a, b) => b - a);

  return opponents.length >= 2 ? opponents[1] : 1;
}

function isPlayerOffside(
  state: MatchState,
  passer: RuntimePlayer,
  receiver: RuntimePlayer,
): boolean {
  if (passer.teamIndex !== receiver.teamIndex) {
    return false;
  }

  const receiverProgress = toTeamProgress(receiver.pos.x, passer.side);
  if (receiverProgress <= 0.5) {
    return false;
  }

  const ballProgress = toTeamProgress(passer.pos.x, passer.side);
  const secondLastDefender = secondLastOpponentProgress(
    state,
    passer.teamIndex,
  );
  const offsideLine = Math.max(ballProgress, secondLastDefender);

  return (
    receiverProgress >
    offsideLine + MATCH_CONFIG.offsides.lineBuffer
  );
}

function adjustRunTargetForOffside(
  state: MatchState,
  owner: RuntimePlayer,
  runner: RuntimePlayer,
  target: Vec2,
  intelligence: number,
): Vec2 {
  if (owner.teamIndex !== runner.teamIndex) {
    return target;
  }

  const targetProgress = toTeamProgress(target.x, runner.side);
  if (targetProgress <= 0.5) {
    return target;
  }

  const ballProgress = toTeamProgress(owner.pos.x, runner.side);
  const secondLastDefender = secondLastOpponentProgress(
    state,
    runner.teamIndex,
  );
  const legalLine = Math.max(ballProgress, secondLastDefender);
  const intelligenceFactor = 1 - clamp(intelligence / 100);
  const allowedOvershoot =
    MATCH_CONFIG.offsides.maxLowIntelligenceOvershoot *
    intelligenceFactor *
    state.rng.next();
  const maxProgress = Math.max(
    0.5,
    legalLine - MATCH_CONFIG.offsides.lineBuffer + allowedOvershoot,
  );

  if (targetProgress <= maxProgress) {
    return target;
  }

  return {
    ...target,
    x: fromTeamProgress(maxProgress, runner.side),
  };
}

function createSpatialAccumulator(): SpatialAccumulator {
  return {
    columns: MATCH_CONFIG.analytics.heatmapColumns,
    rows: MATCH_CONFIG.analytics.heatmapRows,
    teams: [createSpatialTeamAccumulator(), createSpatialTeamAccumulator()],
  };
}

function createSpatialTeamAccumulator(): SpatialTeamAccumulator {
  const cells =
    MATCH_CONFIG.analytics.heatmapColumns *
    MATCH_CONFIG.analytics.heatmapRows;
  const positions: Position[] = [
    "GK",
    "LB",
    "CB",
    "RB",
    "CDM",
    "CM",
    "CAM",
    "LM",
    "RM",
    "LW",
    "RW",
    "ST",
  ];

  return {
    samples: 0,
    allPlayersHeatmap: Array(cells).fill(0),
    positionHeatmaps: Object.fromEntries(
      positions.map((position) => [position, Array(cells).fill(0)]),
    ) as Partial<Record<Position, number[]>>,
    blockCenterProgressSum: 0,
    blockCenterProgressSquaredSum: 0,
    blockCenterMin: 1,
    blockCenterMax: 0,
    blockDepthSum: 0,
    blockWidthSum: 0,
    playersInAttackingHalfSum: 0,
    defensiveLineProgressSum: 0,
    possessionSamples: 0,
    outOfPossessionSamples: 0,
    possessionBlockCenterSum: 0,
    outOfPossessionBlockCenterSum: 0,
    possessionWidthSum: 0,
    outOfPossessionWidthSum: 0,
  };
}

function captureSpatialSample(state: MatchState): void {
  const { columns, rows } = state.spatial;

  for (const team of state.teams) {
    const accumulator = state.spatial.teams[team.index];
    const active = team.players.filter(
      (player) => player.active && player.assignedPosition,
    );
    const outfield = active.filter(
      (player) => player.assignedPosition !== "GK",
    );

    accumulator.samples += 1;

    for (const player of active) {
      const progress = clamp(toTeamProgress(player.pos.x, team.side));
      const lateral = clamp(player.pos.y);
      const column = Math.min(
        columns - 1,
        Math.floor(lateral * columns),
      );
      const row = Math.min(rows - 1, Math.floor(progress * rows));
      const index = row * columns + column;
      accumulator.allPlayersHeatmap[index] += 1;
      accumulator.positionHeatmaps[player.assignedPosition!]?.splice(
        index,
        1,
        (accumulator.positionHeatmaps[player.assignedPosition!]![index] ?? 0) + 1,
      );
    }

    if (outfield.length === 0) {
      continue;
    }

    const progresses = outfield.map((player) =>
      toTeamProgress(player.pos.x, team.side),
    );
    const laterals = outfield.map((player) => player.pos.y);
    const blockCenter =
      progresses.reduce((sum, value) => sum + value, 0) /
      progresses.length;
    const blockWidth = Math.max(...laterals) - Math.min(...laterals);
    accumulator.blockCenterProgressSum += blockCenter;
    accumulator.blockCenterProgressSquaredSum += blockCenter * blockCenter;
    accumulator.blockCenterMin = Math.min(accumulator.blockCenterMin, blockCenter);
    accumulator.blockCenterMax = Math.max(accumulator.blockCenterMax, blockCenter);
    accumulator.blockDepthSum +=
      Math.max(...progresses) - Math.min(...progresses);
    accumulator.blockWidthSum += blockWidth;

    if (state.possessionTeamIndex === team.index) {
      accumulator.possessionSamples += 1;
      accumulator.possessionBlockCenterSum += blockCenter;
      accumulator.possessionWidthSum += blockWidth;
    } else {
      accumulator.outOfPossessionSamples += 1;
      accumulator.outOfPossessionBlockCenterSum += blockCenter;
      accumulator.outOfPossessionWidthSum += blockWidth;
    }
    accumulator.playersInAttackingHalfSum += progresses.filter(
      (value) => value > 0.5,
    ).length;

    const defensiveLine = outfield.filter((player) =>
      ["LB", "CB", "RB"].includes(player.assignedPosition!),
    );
    if (defensiveLine.length > 0) {
      accumulator.defensiveLineProgressSum +=
        defensiveLine.reduce(
          (sum, player) =>
            sum + toTeamProgress(player.pos.x, team.side),
          0,
        ) / defensiveLine.length;
    }
  }
}

function finalizeSpatialAnalytics(
  spatial: SpatialAccumulator,
): MatchSpatialAnalytics {
  return {
    columns: spatial.columns,
    rows: spatial.rows,
    home: finalizeSpatialTeam(spatial.teams[0]),
    away: finalizeSpatialTeam(spatial.teams[1]),
  };
}

function finalizeSpatialTeam(
  accumulator: SpatialTeamAccumulator,
): TeamSpatialAnalytics {
  const divisor = Math.max(accumulator.samples, 1);
  return {
    samples: accumulator.samples,
    allPlayersHeatmap: accumulator.allPlayersHeatmap,
    positionHeatmaps: accumulator.positionHeatmaps,
    averageBlockCenterProgress: round(
      accumulator.blockCenterProgressSum / divisor,
      3,
    ),
    averageBlockDepth: round(accumulator.blockDepthSum / divisor, 3),
    averageBlockWidth: round(accumulator.blockWidthSum / divisor, 3),
    averagePlayersInAttackingHalf: round(
      accumulator.playersInAttackingHalfSum / divisor,
      2,
    ),
    averageDefensiveLineProgress: round(
      accumulator.defensiveLineProgressSum / divisor,
      3,
    ),
    averageBlockCenterInPossession: round(
      accumulator.possessionBlockCenterSum /
        Math.max(accumulator.possessionSamples, 1),
      3,
    ),
    averageBlockCenterOutOfPossession: round(
      accumulator.outOfPossessionBlockCenterSum /
        Math.max(accumulator.outOfPossessionSamples, 1),
      3,
    ),
    averageWidthInPossession: round(
      accumulator.possessionWidthSum /
        Math.max(accumulator.possessionSamples, 1),
      3,
    ),
    averageWidthOutOfPossession: round(
      accumulator.outOfPossessionWidthSum /
        Math.max(accumulator.outOfPossessionSamples, 1),
      3,
    ),
    blockCenterRange: round(
      Math.max(0, accumulator.blockCenterMax - accumulator.blockCenterMin),
      3,
    ),
    blockCenterStdDev: round(
      Math.sqrt(
        Math.max(
          0,
          accumulator.blockCenterProgressSquaredSum / divisor -
            (accumulator.blockCenterProgressSum / divisor) ** 2,
        ),
      ),
      3,
    ),
  };
}

function findActiveBySlot(
  team: RuntimeTeam,
  slotId: string,
): RuntimePlayer | undefined {
  return team.players.find(
    (player) => player.active && player.slotId === slotId,
  );
}

function firstActiveOutfield(team: RuntimeTeam): RuntimePlayer {
  const player =
    team.players.find(
      (candidate) =>
        candidate.active && candidate.assignedPosition !== "GK",
    ) ?? team.players.find((candidate) => candidate.active);

  if (!player) {
    throw new Error(`L'équipe ${team.name} n'a plus aucun joueur actif.`);
  }
  return player;
}

function getPlayer(
  state: MatchState,
  runtimeId: string,
): RuntimePlayer | undefined {
  return state.allPlayers.find((player) => player.runtimeId === runtimeId);
}

function otherTeamIndex(index: TeamIndex): TeamIndex {
  return index === 0 ? 1 : 0;
}

function otherSide(side: TeamSide): TeamSide {
  return side === "HOME" ? "AWAY" : "HOME";
}

function distanceBetween(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function moveTowards(
  current: Vec2,
  target: Vec2,
  maxDistance: number,
): Vec2 {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const distance = Math.hypot(dx, dy);

  if (distance === 0 || distance <= maxDistance) {
    return { ...target };
  }

  const ratio = maxDistance / distance;
  return {
    x: clamp(current.x + dx * ratio, 0.015, 0.985),
    y: clamp(current.y + dy * ratio, 0.025, 0.975),
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function vectorLength(vector: Vec2): number {
  return Math.hypot(vector.x, vector.y);
}

function normalizeVector(vector: Vec2): Vec2 {
  const length = vectorLength(vector);
  if (length <= 1e-9) {
    return { x: 0, y: 0 };
  }
  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function rotateVector(vector: Vec2, angle: number): Vec2 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
}

function averageStarterEnergy(team: RuntimeTeam): number {
  const starters = team.players.filter((player) =>
    player.runtimeId.includes(":START:"),
  );
  if (starters.length === 0) {
    return 100;
  }
  return round(
    starters.reduce((sum, player) => sum + player.energy, 0) /
      starters.length,
    1,
  );
}

function withoutPossessionTicks(
  stats: RuntimeTeam["stats"],
): Omit<TeamMatchStats, "possession" | "averageStarterEnergy"> {
  return {
    shots: stats.shots,
    shotsOnTarget: stats.shotsOnTarget,
    passesAttempted: stats.passesAttempted,
    passesCompleted: stats.passesCompleted,
    backwardPasses: stats.backwardPasses,
    goalkeeperBackPasses: stats.goalkeeperBackPasses,
    ownGoals: stats.ownGoals,
    dribbles: stats.dribbles,
    progressiveRuns: stats.progressiveRuns,
    duelsWon: stats.duelsWon,
    transitionShots: stats.transitionShots,
    possessionRegains: stats.possessionRegains,
    tackles: stats.tackles,
    fouls: stats.fouls,
    yellowCards: stats.yellowCards,
    redCards: stats.redCards,
    offsides: stats.offsides,
    substitutions: stats.substitutions,
    throwIns: stats.throwIns,
    corners: stats.corners,
    goalKicks: stats.goalKicks,
    freeKicks: stats.freeKicks,
    penalties: stats.penalties,
    goalkeeperSaves: stats.goalkeeperSaves,
    goalsFromSetPieces: stats.goalsFromSetPieces,
  };
}
