import { effectiveStats, positionCompatibility } from "./compatibility";
import { clamp, ENGINE_VERSION, MATCH_CONFIG, round } from "./config";
import {
  attackDirection,
  anchorForSide,
  FORMATION_433,
  getSlot,
  opponentGoal,
} from "./formations";
import { SeededRng } from "./rng";
import type {
  MatchEvent,
  MatchReplay,
  MatchSimulationOutput,
  PlayerCard,
  Position,
  ReplayFrame,
  ReplayPlayerMeta,
  Role,
  TeamMatchStats,
  TeamSelection,
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
  score: number;
  stats: Omit<TeamMatchStats, "possession"> & {
    possessionTicks: number;
  };
};

type ControlledBall = {
  mode: "CONTROLLED";
  ownerId: string;
  pos: Vec2;
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
};

type RuntimeBall = ControlledBall | TransitBall | LooseBall;

type MatchState = {
  t: number;
  logicalDuration: number;
  teams: [RuntimeTeam, RuntimeTeam];
  allPlayers: RuntimePlayer[];
  ball: RuntimeBall;
  events: MatchEvent[];
  frames: ReplayFrame[];
  nextDecisionAt: number;
  nextReplayAt: number;
  halftimeEmitted: boolean;
  rng: SeededRng;
  controlStartedAt: number;
  recordReplay: boolean;
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
  dribbles: 0,
  progressiveRuns: 0,
  duelsWon: 0,
  tackles: 0,
  fouls: 0,
  yellowCards: 0,
  redCards: 0,
  possessionTicks: 0,
});

export function simulateMatch(params: {
  home: TeamSelection;
  away: TeamSelection;
  players: PlayerCard[];
  seed: string;
  logicalSeconds?: number;
  recordReplay?: boolean;
}): MatchSimulationOutput {
  const logicalDuration = clamp(
    params.logicalSeconds ?? MATCH_CONFIG.logicalSeconds,
    60,
    900,
  );

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
    logicalDuration,
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
    halftimeEmitted: false,
    rng,
    controlStartedAt: 0,
    recordReplay: params.recordReplay ?? true,
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

  while (state.t < state.logicalDuration - 1e-9) {
    if (
      !state.halftimeEmitted &&
      state.t >= state.logicalDuration / 2
    ) {
      state.halftimeEmitted = true;
      emit(state, {
        type: "HALF_TIME",
        message: "Mi-temps.",
      });
    }

    if (state.t + 1e-9 >= state.nextDecisionAt) {
      decisionTick(state);
      state.nextDecisionAt += MATCH_CONFIG.decisionInterval;
    }

    const dt = Math.min(
      MATCH_CONFIG.physicsStep,
      state.logicalDuration - state.t,
    );

    updateMovement(state, dt);
    updateBall(state, dt);
    updatePossessionCounter(state);
    evaluateAutomaticSubstitutions(state);

    state.t += dt;

    if (
      state.recordReplay &&
      state.t + 1e-9 >= state.nextReplayAt
    ) {
      captureFrame(state);
      state.nextReplayAt += MATCH_CONFIG.replayFrameInterval;
    }
  }

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
    possession: round(100 - homeStats.possession, 1),
  };

  const replay: MatchReplay = {
    engineVersion: ENGINE_VERSION,
    seed: params.seed,
    logicalDuration: state.logicalDuration,
    displayedMinutes: MATCH_CONFIG.displayedMinutes,
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

  if (shotQuality > 0.09) {
    candidates.push({
      kind: "SHOT",
      utility:
        shotQuality * 0.72 +
        (stats.shooting / 100) * 0.11 +
        (owner.role === "OFFENSIVE" ? 0.035 : 0),
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
    const progression = clamp(
      ((teammate.pos.x - owner.pos.x) * direction + 0.15) / 0.55,
    );
    const receiverSpace = clamp(nearestDistance(teammate.pos, opponents) / 0.16);
    const laneSafety = 1 - passingLaneRisk(owner.pos, teammate.pos, opponents);
    const distanceComfort = 1 - clamp(distance / 0.55);

    let utility =
      0.31 * progression +
      0.29 * receiverSpace +
      0.28 * laneSafety +
      0.12 * distanceComfort;

    if (team.selection.tactics?.buildUp === "SHORT") {
      utility += 0.12 * distanceComfort;
    } else if (team.selection.tactics?.buildUp === "DIRECT") {
      utility += 0.12 * progression;
    }

    if (owner.role === "CREATOR") {
      utility += 0.05 * progression;
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
      0.22 +
      0.30 * spaceAhead +
      0.19 * (stats.technique / 100) +
      0.07 * (stats.speed / 100) +
      (owner.role === "OFFENSIVE" ? 0.08 : 0),
  });

  candidates.push({
    kind: "HOLD",
    utility: 0.18 + (owner.role === "DEFENSIVE" ? 0.08 : 0),
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
): void {
  const receiver = getPlayer(state, receiverId);
  if (!receiver || !passer.assignedPosition) {
    return;
  }

  const team = state.teams[passer.teamIndex];
  const opponents = state.teams[otherTeamIndex(passer.teamIndex)].players.filter(
    (player) => player.active,
  );
  const stats = effectiveStats({
    player: passer.card,
    assignedPosition: passer.assignedPosition,
    energy: passer.energy,
    synergyBonus: passer.synergyBonus,
  });

  const distance = distanceBetween(passer.pos, receiver.pos);
  const pressure = clamp(
    (0.07 - nearestDistance(passer.pos, opponents)) / 0.07,
  );
  const laneRisk = passingLaneRisk(passer.pos, receiver.pos, opponents);

  const probability = clamp(
    0.22 +
      0.43 * (stats.passing / 100) +
      0.14 * (stats.technique / 100) +
      0.09 * (stats.intelligence / 100) -
      0.28 * distance -
      0.22 * pressure -
      0.32 * laneRisk,
    0.05,
    0.97,
  );

  const success = state.rng.chance(probability);
  const interceptor = success
    ? undefined
    : nearestPlayerToPoint(receiver.pos, opponents);

  team.stats.passesAttempted += 1;

  state.ball = {
    mode: "TRANSIT",
    kind: "PASS",
    actorId: passer.runtimeId,
    from: { ...passer.pos },
    to: { ...receiver.pos },
    pos: { ...passer.pos },
    elapsed: 0,
    duration: clamp(
      0.24 + distance * 1.3,
      MATCH_CONFIG.ball.passMinDuration,
      MATCH_CONFIG.ball.passMaxDuration,
    ),
    intendedReceiverId: receiver.runtimeId,
    passSuccess: success,
    interceptId: interceptor?.runtimeId,
  };

  emit(state, {
    type: "PASS",
    team: passer.side,
    playerId: passer.card.playerId,
    runtimeId: passer.runtimeId,
    message: `${passer.card.shortName} cherche ${receiver.card.shortName}.`,
  });
}

function startShot(state: MatchState, shooter: RuntimePlayer): void {
  if (!shooter.assignedPosition) {
    return;
  }

  const attackingTeam = state.teams[shooter.teamIndex];
  const defendingTeam = state.teams[otherTeamIndex(shooter.teamIndex)];
  const goalkeeper =
    findActiveBySlot(defendingTeam, "GK") ??
    defendingTeam.players.find((player) => player.active);

  if (!goalkeeper || !goalkeeper.assignedPosition) {
    return;
  }

  const shooterStats = effectiveStats({
    player: shooter.card,
    assignedPosition: shooter.assignedPosition,
    energy: shooter.energy,
    synergyBonus: shooter.synergyBonus,
  });

  const goalkeeperStats = effectiveStats({
    player: goalkeeper.card,
    assignedPosition: goalkeeper.assignedPosition,
    energy: goalkeeper.energy,
    synergyBonus: goalkeeper.synergyBonus,
  });

  const goal = opponentGoal(shooter.side);
  const shotQuality = estimateShotQuality(shooter.pos, shooter.side);
  const execution =
    (0.65 * shooterStats.shooting +
      0.2 * shooterStats.technique +
      0.15 * shooterStats.intelligence) /
    100;

  const goalkeeperQuality =
    (0.35 * goalkeeperStats.technique +
      0.35 * goalkeeperStats.intelligence +
      0.15 * goalkeeperStats.speed +
      0.15 * goalkeeperStats.physical) /
    100;

  const angleFactor = clamp(1 - Math.abs(shooter.pos.y - 0.5) * 1.25, 0.3, 1);
  const onTargetProbability = clamp(
    0.3 + 0.58 * execution * angleFactor,
    0.18,
    0.94,
  );

  const rawGoalProbability = clamp(
    shotQuality *
      (0.07 + 0.22 * execution) *
      (1.0 - 0.55 * goalkeeperQuality),
    0.01,
    0.72,
  );

  let shotResult: "GOAL" | "SAVE_CATCH" | "SAVE_REBOUND" | "MISS";
  if (!state.rng.chance(onTargetProbability)) {
    shotResult = "MISS";
  } else {
    attackingTeam.stats.shotsOnTarget += 1;
    const conditionalGoal = clamp(
      rawGoalProbability / Math.max(onTargetProbability, 0.1),
      0.02,
      0.82,
    );

    if (state.rng.chance(conditionalGoal)) {
      shotResult = "GOAL";
    } else {
      const catchProbability = clamp(
        0.18 +
          0.55 * goalkeeperQuality -
          0.24 * execution -
          0.10 * shotQuality,
        0.08,
        0.78,
      );
      shotResult = state.rng.chance(catchProbability)
        ? "SAVE_CATCH"
        : "SAVE_REBOUND";
    }
  }

  attackingTeam.stats.shots += 1;

  const targetY =
    shotResult === "MISS"
      ? clamp(goal.y + state.rng.between(-0.18, 0.18), 0.18, 0.82)
      : clamp(goal.y + state.rng.between(-0.07, 0.07), 0.39, 0.61);

  const shotTarget = { x: goal.x, y: targetY };
  const reboundTo =
    shotResult === "SAVE_REBOUND"
      ? {
          x: clamp(
            goalkeeper.pos.x -
              attackDirection(shooter.side) *
                state.rng.between(0.035, 0.09),
            0.03,
            0.97,
          ),
          y: clamp(
            goalkeeper.pos.y + state.rng.between(-0.09, 0.09),
            0.06,
            0.94,
          ),
        }
      : undefined;

  goalkeeper.target = {
    x: clamp(
      lerp(goalkeeper.pos.x, shotTarget.x, 0.35),
      0.02,
      0.98,
    ),
    y: clamp(shotTarget.y, 0.34, 0.66),
  };

  state.ball = {
    mode: "TRANSIT",
    kind: "SHOT",
    actorId: shooter.runtimeId,
    from: { ...shooter.pos },
    to: shotTarget,
    pos: { ...shooter.pos },
    elapsed: 0,
    duration: clamp(
      0.62 + distanceBetween(shooter.pos, goal) * 0.75,
      MATCH_CONFIG.ball.shotMinDuration,
      MATCH_CONFIG.ball.shotMaxDuration,
    ),
    shotResult,
    goalkeeperId: goalkeeper.runtimeId,
    reboundTo,
  };

  emit(state, {
    type: "SHOT",
    team: shooter.side,
    playerId: shooter.card.playerId,
    runtimeId: shooter.runtimeId,
    message: `${shooter.card.shortName} tente sa chance !`,
  });
}

function updateBall(state: MatchState, dt: number): void {
  if (state.ball.mode === "CONTROLLED") {
    const owner = getPlayer(state, state.ball.ownerId);
    if (owner?.active) {
      state.ball.pos = { ...owner.pos };
    } else {
      state.ball = {
        mode: "LOOSE",
        pos: { ...state.ball.pos },
        age: 0,
      };
    }
    return;
  }

  if (state.ball.mode === "LOOSE") {
    state.ball.age += dt;
    return;
  }

  state.ball.elapsed += dt;
  const progress = clamp(state.ball.elapsed / state.ball.duration);
  state.ball.pos = {
    x: lerp(state.ball.from.x, state.ball.to.x, progress),
    y: lerp(state.ball.from.y, state.ball.to.y, progress),
  };

  if (progress < 1) {
    return;
  }

  if (state.ball.kind === "PASS") {
    finishPass(state, state.ball);
  } else {
    finishShot(state, state.ball);
  }
}

function finishPass(state: MatchState, ball: TransitBall): void {
  const actor = getPlayer(state, ball.actorId);
  const receiver = ball.intendedReceiverId
    ? getPlayer(state, ball.intendedReceiverId)
    : undefined;

  if (ball.passSuccess && receiver?.active) {
    state.teams[receiver.teamIndex].stats.passesCompleted += 1;
    setControlledBall(state, receiver);
    return;
  }

  const interceptor = ball.interceptId
    ? getPlayer(state, ball.interceptId)
    : undefined;

  if (interceptor?.active) {
    setControlledBall(state, interceptor);
    emit(state, {
      type: "INTERCEPTION",
      team: interceptor.side,
      playerId: interceptor.card.playerId,
      runtimeId: interceptor.runtimeId,
      message: `${interceptor.card.shortName} coupe la passe.`,
    });
    return;
  }

  state.ball = {
    mode: "LOOSE",
    pos: { ...ball.to },
    age: 0,
  };

  if (actor) {
    emit(state, {
      type: "INTERCEPTION",
      team: otherSide(actor.side),
      message: "La passe n'arrive pas à destination, ballon libre.",
    });
  }
}

function finishShot(state: MatchState, ball: TransitBall): void {
  const shooter = getPlayer(state, ball.actorId);
  const goalkeeper = ball.goalkeeperId
    ? getPlayer(state, ball.goalkeeperId)
    : undefined;

  if (!shooter) {
    state.ball = { mode: "LOOSE", pos: { ...ball.to }, age: 0 };
    return;
  }

  if (ball.shotResult === "GOAL") {
    const team = state.teams[shooter.teamIndex];
    team.score += 1;
    emit(state, {
      type: "GOAL",
      team: shooter.side,
      playerId: shooter.card.playerId,
      runtimeId: shooter.runtimeId,
      message: `BUT ! ${shooter.card.shortName} marque pour ${team.name}.`,
    });
    resetForKickoff(state, otherTeamIndex(shooter.teamIndex));
    return;
  }

  if (ball.shotResult === "SAVE_CATCH" && goalkeeper?.active) {
    setControlledBall(state, goalkeeper);
    emit(state, {
      type: "SAVE",
      team: goalkeeper.side,
      playerId: goalkeeper.card.playerId,
      runtimeId: goalkeeper.runtimeId,
      message: `${goalkeeper.card.shortName} capte le tir.`,
    });
    return;
  }

  if (ball.shotResult === "SAVE_REBOUND" && goalkeeper?.active) {
    state.ball = {
      mode: "LOOSE",
      pos: { ...(ball.reboundTo ?? goalkeeper.pos) },
      age: 0,
    };
    emit(state, {
      type: "SAVE",
      team: goalkeeper.side,
      playerId: goalkeeper.card.playerId,
      runtimeId: goalkeeper.runtimeId,
      message: `${goalkeeper.card.shortName} repousse le tir !`,
    });
    return;
  }

  emit(state, {
    type: "MISS",
    team: shooter.side,
    playerId: shooter.card.playerId,
    runtimeId: shooter.runtimeId,
    message: `${shooter.card.shortName} ne cadre pas.`,
  });

  const defendingTeam = state.teams[otherTeamIndex(shooter.teamIndex)];
  const goalKickKeeper =
    findActiveBySlot(defendingTeam, "GK") ??
    defendingTeam.players.find((player) => player.active);

  if (goalKickKeeper) {
    setControlledBall(state, goalKickKeeper);
  } else {
    state.ball = { mode: "LOOSE", pos: { x: 0.5, y: 0.5 }, age: 0 };
  }
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
    0.26 +
      0.22 * (defenderStats.physical / 100) +
      0.24 * (defenderStats.intelligence / 100) -
      0.2 * (ownerStats.technique / 100) -
      0.08 * (ownerStats.physical / 100),
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

  const aggression = defender.card.stats.physical / 100;
  const foulProbability = 0.035 + 0.055 * aggression;
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

  // Après une faute, on redonne simplement le ballon à la victime.
  setControlledBall(state, victim);

  const severity = state.rng.next();

  if (severity < 0.018) {
    giveRedCard(state, defender, "carton rouge direct");
  } else if (severity < 0.29) {
    giveYellowCard(state, defender);
  }

  maybeInjuryFromContact(state, victim, defender, 1.8);
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

  const candidates = state.allPlayers.filter(
    (player) =>
      player.active &&
      !player.injured &&
      !player.redCard &&
      distanceBetween(player.pos, state.ball.pos) < 0.16 &&
      player.assignedPosition,
  );

  if (candidates.length === 0) {
    return;
  }

  const scored = candidates.map((player) => {
    const stats = effectiveStats({
      player: player.card,
      assignedPosition: player.assignedPosition!,
      energy: player.energy,
      synergyBonus: player.synergyBonus,
    });
    const distanceScore =
      1 - clamp(distanceBetween(player.pos, state.ball.pos) / 0.16);
    const score =
      0.42 * distanceScore +
      0.2 * (stats.speed / 100) +
      0.18 * (stats.physical / 100) +
      0.2 * (stats.intelligence / 100);
    return { player, score };
  });

  const winner = softmaxPick(
    scored.map(({ player, score }) => ({
      player,
      utility: score,
    })),
    0.16,
    state.rng,
  ).player;

  setControlledBall(state, winner);
}


function setControlledBall(
  state: MatchState,
  player: RuntimePlayer,
  pos: Vec2 = player.pos,
): void {
  state.ball = {
    mode: "CONTROLLED",
    ownerId: player.runtimeId,
    pos: { ...pos },
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
          ? 1.45
          : player.role === "CREATOR"
            ? 1.1
            : player.role === "DEFENSIVE"
              ? 0.35
              : 1;

      const chance =
        MATCH_CONFIG.offBallRuns.baseChancePerDecision *
        positionFactor *
        roleFactor *
        (0.55 + 0.45 * stats.intelligence / 100);

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

      player.runTarget = {
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

  for (const team of state.teams) {
    const hasPossession = owner?.teamIndex === team.index;
    const direction = attackDirection(team.side);

    const blockShift =
      team.selection.tactics?.blockHeight === "HIGH"
        ? 0.05
        : team.selection.tactics?.blockHeight === "LOW"
          ? -0.04
          : 0;

    const activePlayers = team.players.filter(
      (player) => player.active && player.slotId,
    );

    for (const player of activePlayers) {
      const slot = getSlot(player.slotId!);
      const anchor = anchorForSide(slot.anchor, player.side);
      const roleShift =
        player.role === "OFFENSIVE"
          ? 0.055
          : player.role === "DEFENSIVE"
            ? -0.045
            : 0;

      const possessionShift = hasPossession ? 0.055 : -0.025;
      const xShift =
        direction * (possessionShift + roleShift + blockShift);

      let target: Vec2 = {
        x: clamp(anchor.x + xShift, 0.025, 0.975),
        y: anchor.y,
      };

      if (
        hasPossession &&
        player.runtimeId !== owner?.runtimeId &&
        player.runTarget &&
        player.runUntil > state.t
      ) {
        target = { ...player.runTarget };
      } else if (owner) {
        const ballAttraction =
          player.role === "PRESSING"
            ? 0.26
            : hasPossession
              ? 0.05
              : 0.13;

        target = {
          x: lerp(target.x, owner.pos.x, ballAttraction),
          y: lerp(target.y, owner.pos.y, ballAttraction),
        };
      }

      player.target = target;
    }

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
          y: clamp(owner.pos.y + (index === 0 ? 0 : 0.025), 0.03, 0.97),
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
    const roleCost = player.role === "PRESSING" ? 1.3 : 1;
    const physicalEfficiency = 1.18 - player.card.stats.physical * 0.004;
    player.energy = clamp(
      player.energy - moved * 19 * roleCost * physicalEfficiency,
      0,
      100,
    );
  }
}

function evaluateAutomaticSubstitutions(state: MatchState): void {
  const displayedMinute =
    (state.t / state.logicalDuration) * MATCH_CONFIG.displayedMinutes;

  if (
    displayedMinute < MATCH_CONFIG.fatigue.autoSubDisplayedMinute
  ) {
    return;
  }

  for (const team of state.teams) {
    if (team.substitutionsUsed >= MATCH_CONFIG.maxSubstitutions) {
      continue;
    }

    const candidate = team.players
      .filter(
        (player) =>
          player.active &&
          !player.injured &&
          !player.redCard &&
          player.assignedPosition !== "GK" &&
          player.energy <
            MATCH_CONFIG.fatigue.autoSubEnergyThreshold,
      )
      .sort((a, b) => a.energy - b.energy)[0];

    if (candidate) {
      substitutePlayer(state, candidate, "fatigue");
    }
  }
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

  const bench = team.players
    .filter(
      (player) =>
        !player.active &&
        !player.injured &&
        !player.redCard &&
        player.slotId === null,
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

  setControlledBall(state, owner, { x: 0.5, y: 0.5 });
}

function captureFrame(state: MatchState): void {
  const frame: ReplayFrame = {
    t: round(state.t, 3),
    ball: {
      x: round(state.ball.pos.x),
      y: round(state.ball.pos.y),
      ownerId:
        state.ball.mode === "CONTROLLED"
          ? state.ball.ownerId
          : null,
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
    ...event,
  });
}

function updatePossessionCounter(state: MatchState): void {
  if (state.ball.mode !== "CONTROLLED") {
    return;
  }

  const owner = getPlayer(state, state.ball.ownerId);
  if (owner) {
    state.teams[owner.teamIndex].stats.possessionTicks += 1;
  }
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

function withoutPossessionTicks(
  stats: RuntimeTeam["stats"],
): Omit<TeamMatchStats, "possession"> {
  return {
    shots: stats.shots,
    shotsOnTarget: stats.shotsOnTarget,
    passesAttempted: stats.passesAttempted,
    passesCompleted: stats.passesCompleted,
    dribbles: stats.dribbles,
    progressiveRuns: stats.progressiveRuns,
    duelsWon: stats.duelsWon,
    tackles: stats.tackles,
    fouls: stats.fouls,
    yellowCards: stats.yellowCards,
    redCards: stats.redCards,
  };
}
