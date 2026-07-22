import { effectiveStats, positionCompatibility } from "./compatibility";
import {
  advanceBallPosition,
  decayBallVelocity,
  predictLooseBallStop,
} from "./ball-physics";
import { assertTeamSelection, MATCH_CONTRACT_VERSION } from "./contract";
import { clamp, ENGINE_VERSION, MATCH_CONFIG, round } from "./config";
import {
  attackDirection,
  anchorForSide,
  FORMATION_433,
  getSlot,
  opponentGoal,
  ownGoal,
} from "./formations";
import {
  distanceBetween,
  lerp,
  lineYAtX,
  moveTowards,
  normalizeVector,
  pointToSegmentDistance,
  rotateVector,
  vectorLength,
} from "./geometry";
import { SeededRng } from "./rng";
import {
  handleFoul,
  maybeInjuryFromContact,
  type DisciplineHooks,
} from "./discipline";
import {
  classifyBoundaryCrossing,
  detectPitchBoundaryCrossing,
  type BoundaryCrossing,
} from "./pitch-rules";
import {
  executeRestart as executeRestartController,
  scheduleRestart as scheduleRestartController,
  type RestartHooks,
  type ScheduleRestartParams,
} from "./restarts";
import {
  tryPhysicalShotInterception,
  type ShotInterceptionHooks,
} from "./shot-interceptions";
import {
  createEmptyStats,
  type LooseBall,
  type MatchState,
  type RestartState,
  type RestartType,
  type RuntimePlayer,
  type RuntimeTeam,
  type TeamIndex,
} from "./runtime";
import {
  captureSpatialSample,
  createSpatialAccumulator,
  finalizeSpatialAnalytics,
} from "./spatial-analytics";
import {
  evaluateAutomaticSubstitutions,
  processPendingSubstitutions,
  queueSubstitution,
  recomputeSynergy,
  type SubstitutionHooks,
} from "./substitutions";
import type {
  MatchEvent,
  MatchReplay,
  MatchSimulationOutput,
  MatchSimulationInput,
  PlayerCard,
  Position,
  ReplayFrame,
  ReplayPlayerMeta,
  TeamMatchStats,
  TeamSelection,
  TeamSide,
  Vec2,
} from "./types";

type ActionCandidate =
  | { kind: "PASS"; targetId: string; utility: number }
  | { kind: "SHOT"; utility: number }
  | { kind: "DRIBBLE"; utility: number }
  | { kind: "HOLD"; utility: number };

const SUBSTITUTION_HOOKS: SubstitutionHooks = {
  getPlayer,
  setControlledBall,
  emit,
};

const SHOT_INTERCEPTION_HOOKS: ShotInterceptionHooks = {
  getPlayer,
  setControlledBall,
  emit,
};

const DISCIPLINE_HOOKS: DisciplineHooks = {
  emit,
  scheduleRestart,
};

const RESTART_HOOKS: RestartHooks = {
  getPlayer,
  setControlledBall,
  startShot,
  startPass,
  positionPlayersForRestart,
  captureFrame,
  emit,
  emitAt,
};


export function simulateMatch(
  params: MatchSimulationInput,
): MatchSimulationOutput {
  assertTeamSelection(params.home);
  assertTeamSelection(params.away);
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
        processPendingSubstitutions(state, SUBSTITUTION_HOOKS);
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
    evaluateAutomaticSubstitutions(state, SUBSTITUTION_HOOKS);

    if (
      state.recordSpatialAnalytics &&
      state.t + 1e-9 >= state.nextSpatialAt
    ) {
      captureSpatialSample(
        state.spatial,
        state.teams,
        state.possessionTeamIndex,
      );
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
    contractVersion: MATCH_CONTRACT_VERSION,
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
    pendingSubstitutions: [],
    score: 0,
    stats: createEmptyStats(),
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
  const ownerProgress = toTeamProgress(owner.pos.x, owner.side);
  const ownerSidelineDistance = Math.min(owner.pos.y, 1 - owner.pos.y);
  const trappedNearAttackingCorner =
    ownerProgress >= MATCH_CONFIG.wingPlay.cornerProgressThreshold &&
    ownerSidelineDistance <= MATCH_CONFIG.wingPlay.sidelineThreshold;

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

    if (trappedNearAttackingCorner) {
      // Au lieu de continuer à pousser le ballon jusqu'au drapeau, l'ailier
      // cherche naturellement un centre, un relais intérieur ou une remise.
      const centrality = 1 - clamp(Math.abs(teammate.pos.y - 0.5) / 0.5);
      const receiverProgress = toTeamProgress(teammate.pos.x, teammate.side);
      const isCentralTarget = ["ST", "CAM", "CM"].includes(
        teammate.assignedPosition ?? "",
      );
      if (isCentralTarget || (centrality > 0.52 && receiverProgress > 0.58)) {
        utility +=
          MATCH_CONFIG.wingPlay.centralPassBonus *
          (0.65 + 0.35 * centrality);
      }
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
      0.055 * (stats.technique / 100) +
      (owner.role === "OFFENSIVE" ? 0.02 : 0) -
      (trappedNearAttackingCorner
        ? MATCH_CONFIG.wingPlay.cornerDribblePenalty
        : 0),
  });

  candidates.push({
    kind: "HOLD",
    utility:
      0.18 +
      (owner.role === "DEFENSIVE" ? 0.04 : 0) -
      (trappedNearAttackingCorner ? 0.10 : 0),
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
      ball.pos = advanceBallPosition(ball.pos, ball.velocity, step);
    }
    ball.age += step;

    if (ball.kind === "SHOT") {
      if (
        tryPhysicalShotInterception(
          state,
          previousPos,
          ball.pos,
          SHOT_INTERCEPTION_HOOKS,
        )
      ) {
        if (state.ball.mode !== "LOOSE") return;
      }
    }

    if (state.ball.mode !== "LOOSE") return;

    const crossing = detectPitchBoundaryCrossing(previousPos, state.ball.pos);
    if (crossing) {
      // Le frame d'arrêt conserve la balle légèrement au-delà de la ligne :
      // le viewer montre donc le franchissement physique avant d'annoncer la
      // touche, le corner ou le six mètres.
      const travelDirection = normalizeVector(state.ball.velocity);
      state.ball.pos = {
        x: crossing.point.x + travelDirection.x * 0.010,
        y: crossing.point.y + travelDirection.y * 0.010,
      };
      const elapsedBeforeStep = dt - remaining - step;
      const crossingTime =
        state.t + elapsedBeforeStep + step * crossing.fraction;
      handleBoundaryCrossing(state, crossing, crossingTime);
      if (state.recordReplay) {
        captureFrame(state, crossingTime);
      }
      return;
    }

    state.ball.velocity = decayBallVelocity(
      state.ball.velocity,
      state.ball.deceleration,
      step,
    );

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

function handleBoundaryCrossing(
  state: MatchState,
  crossing: BoundaryCrossing,
  crossingTime: number,
): void {
  if (state.ball.mode !== "LOOSE") return;
  const ball = state.ball;
  const decision = classifyBoundaryCrossing(
    crossing,
    ball,
    state.possessionTeamIndex,
  );
  if (decision.kind === "GOAL") {
    registerPhysicalGoal(state, decision.scoringTeamIndex, ball);
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

  const pause = decision.kind === "THROW_IN"
    ? MATCH_CONFIG.setPieces.throwInPause
    : decision.kind === "CORNER"
      ? MATCH_CONFIG.setPieces.cornerPause
      : MATCH_CONFIG.setPieces.goalKickPause;
  scheduleRestart(state, {
    type: decision.kind,
    teamIndex: decision.teamIndex,
    spot: decision.spot,
    pause,
    preserveScene: true,
    occurredAt: crossingTime,
  });
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
  if (
    !defender ||
    distanceBetween(owner.pos, defender.pos) > MATCH_CONFIG.duels.engagementRadius
  ) {
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

    // Le ballon reste au point de contact réel du duel. Dans les versions
    // précédentes il sautait au centre du défenseur, ce qui amplifiait
    // visuellement la sensation de tacle "à distance".
    const contactPos = { ...state.ball.pos };
    setControlledBall(state, defender, contactPos);
    emit(state, {
      type: "TACKLE",
      team: defender.side,
      playerId: defender.card.playerId,
      runtimeId: defender.runtimeId,
      message: `${defender.card.shortName} récupère le ballon sur ${owner.card.shortName}.`,
    });
    maybeInjuryFromContact(state, owner, defender, DISCIPLINE_HOOKS);
    return true;
  }

  // La stat Physique ne doit pas rendre mécaniquement un joueur plus fautif.
  // L'agressivité détaillée du dataset pourra être réintroduite plus tard.
  const foulProbability = 0.04;
  if (state.rng.chance(foulProbability)) {
    handleFoul(state, defender, owner, DISCIPLINE_HOOKS);
    return true;
  }

  maybeInjuryFromContact(state, owner, defender, DISCIPLINE_HOOKS);
  return false;
}

function goalkeeperMayChaseLooseBall(
  state: MatchState,
  goalkeeper: RuntimePlayer,
  predictedStop: Vec2,
): boolean {
  if (state.ball.mode !== "LOOSE") return false;

  if (
    state.ball.intendedReceiverId === goalkeeper.runtimeId &&
    state.ball.sourceTeamIndex === goalkeeper.teamIndex
  ) {
    return true;
  }

  const progress = toTeamProgress(predictedStop.x, goalkeeper.side);
  if (progress > MATCH_CONFIG.goalkeeper.looseBallMaxProgress) {
    return false;
  }

  const teammates = state.teams[goalkeeper.teamIndex].players.filter(
    (player) =>
      player.active &&
      !player.injured &&
      !player.redCard &&
      player.assignedPosition !== "GK",
  );
  const nearestDefenderDistance = nearestDistance(predictedStop, teammates);
  const goalkeeperDistance = distanceBetween(goalkeeper.pos, predictedStop);

  const dangerousOpponentBall =
    state.ball.sourceTeamIndex !== goalkeeper.teamIndex ||
    ["SHOT", "REBOUND", "DEFLECTION"].includes(state.ball.kind ?? "");

  return (
    dangerousOpponentBall &&
    goalkeeperDistance +
      MATCH_CONFIG.goalkeeper.requiredDistanceAdvantage <
      nearestDefenderDistance
  );
}

function goalkeeperMayControlLooseBall(
  state: MatchState,
  goalkeeper: RuntimePlayer,
  ball: LooseBall,
): boolean {
  if (
    ball.intendedReceiverId === goalkeeper.runtimeId &&
    ball.sourceTeamIndex === goalkeeper.teamIndex
  ) {
    return true;
  }

  const progress = toTeamProgress(ball.pos.x, goalkeeper.side);
  return (
    progress <= MATCH_CONFIG.goalkeeper.looseBallMaxProgress &&
    goalkeeperMayChaseLooseBall(state, goalkeeper, ball.pos)
  );
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
          player.stunnedUntil <= state.t &&
          (
            player.assignedPosition !== "GK" ||
            goalkeeperMayChaseLooseBall(state, player, predictedStop)
          ),
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
        (
          player.assignedPosition !== "GK" ||
          goalkeeperMayControlLooseBall(state, player, looseBall)
        ) &&
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
      (0.47 * stats.technique +
        0.30 * stats.passing +
        0.07 * stats.intelligence +
        0.16 * stats.physical) /
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

      if (player.assignedPosition === "GK") {
        const isOpponentShot =
          state.ball.mode === "LOOSE" &&
          state.ball.kind === "SHOT" &&
          state.ball.sourceTeamIndex !== player.teamIndex;

        if (!isOpponentShot) {
          const keeperProgress = hasPossession
            ? MATCH_CONFIG.goalkeeper.possessionProgress
            : MATCH_CONFIG.goalkeeper.baseProgress;
          const lateralOffset = clamp(
            (ballPosition.y - 0.5) * MATCH_CONFIG.goalkeeper.lateralFollow,
            -MATCH_CONFIG.goalkeeper.maxLateralOffset,
            MATCH_CONFIG.goalkeeper.maxLateralOffset,
          );
          player.target = {
            x: fromTeamProgress(keeperProgress, player.side),
            y: clamp(0.5 + lateralOffset, 0.39, 0.61),
          };
        }
        continue;
      }

      const lineFollowFactor =
        player.assignedPosition === "CB" ||
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

  const progress = toTeamProgress(owner.pos.x, owner.side);
  const sidelineDistance = Math.min(owner.pos.y, 1 - owner.pos.y);

  if (
    progress >= MATCH_CONFIG.wingPlay.cornerProgressThreshold &&
    sidelineDistance <= MATCH_CONFIG.wingPlay.sidelineThreshold
  ) {
    // Sortie du piège du corner : le porteur coupe vers l'intérieur et recule
    // très légèrement au lieu de s'enfermer contre les deux lignes.
    owner.target = {
      x: fromTeamProgress(
        clamp(progress - 0.025, 0.02, 0.96),
        owner.side,
      ),
      y: clamp(
        owner.pos.y +
          Math.sign(0.5 - owner.pos.y) *
            MATCH_CONFIG.wingPlay.inwardEscapeDistance,
        0.08,
        0.92,
      ),
    };
    return;
  }

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
    if (!player.active || !player.assignedPosition || player.injured) {
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


function scheduleRestart(
  state: MatchState,
  params: ScheduleRestartParams,
): void {
  scheduleRestartController(state, params, RESTART_HOOKS);
}

function executeRestart(state: MatchState): void {
  executeRestartController(state, RESTART_HOOKS);
}

function positionTeamsForKickoff(
  state: MatchState,
  kickoffTeamIndex: TeamIndex,
): RuntimePlayer {
  const center = { x: 0.5, y: 0.5 };

  for (const team of state.teams) {
    for (const player of team.players) {
      if (!player.active || !player.slotId) continue;

      const anchor = anchorForSide(getSlot(player.slotId).anchor, player.side);
      let ownHalfProgress = Math.min(
        toTeamProgress(anchor.x, player.side),
        0.47,
      );

      // L'adversaire doit également rester hors du rond central.
      if (team.index !== kickoffTeamIndex) {
        const proposed = {
          x: fromTeamProgress(ownHalfProgress, player.side),
          y: anchor.y,
        };
        if (distanceBetween(proposed, center) < 0.115) {
          ownHalfProgress = Math.min(ownHalfProgress, 0.37);
        }
      }

      player.pos = {
        x: fromTeamProgress(ownHalfProgress, player.side),
        y: anchor.y,
      };
      player.target = { ...player.pos };
      player.runTarget = null;
      player.runUntil = 0;
    }
  }

  const kickoffTeam = state.teams[kickoffTeamIndex];
  const taker =
    findActiveBySlot(kickoffTeam, "ST") ??
    firstActiveOutfield(kickoffTeam);
  taker.pos = {
    x: 0.5 - attackDirection(taker.side) * 0.006,
    y: 0.5,
  };
  taker.target = { ...taker.pos };
  return taker;
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
    const kickoffTaker = positionTeamsForKickoff(state, restart.teamIndex);
    restart.takerId = kickoffTaker.runtimeId;
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
  const owner = positionTeamsForKickoff(state, kickoffTeamIndex);
  setControlledBall(state, owner);
}

function captureFrame(
  state: MatchState,
  frameTime = state.t,
): void {
  const elapsedOffset = Math.max(0, frameTime - state.t);
  const frame: ReplayFrame = {
    t: round(frameTime, 3),
    clock: {
      period: state.period,
      periodElapsed: round(state.periodElapsed + elapsedOffset, 3),
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
  } else {
    // Un événement physique peut arriver exactement au timestamp d'un frame
    // déjà capturé au début du tick. Dans ce cas, le frame post-événement
    // remplace l'ancien afin que la ligne soit visuellement franchie.
    state.frames[state.frames.length - 1] = frame;
  }
}

function emitAt(
  state: MatchState,
  eventTime: number,
  event: Omit<MatchEvent, "t">,
): void {
  if (!state.recordReplay) {
    return;
  }

  state.events.push({
    t: round(eventTime, 3),
    clockLabel: event.clockLabel ?? currentClockLabel(state),
    ...event,
  });
}

function emit(
  state: MatchState,
  event: Omit<MatchEvent, "t">,
): void {
  emitAt(state, state.t, event);
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
