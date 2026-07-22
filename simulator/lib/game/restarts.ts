import { effectiveStats } from "./compatibility";
import { clamp, MATCH_CONFIG } from "./config";
import { opponentGoal } from "./formations";
import { distanceBetween } from "./geometry";
import { restartDefaultMessage, selectRestartTaker } from "./restart-helpers";
import type {
  MatchState,
  RestartState,
  RestartType,
  RuntimePlayer,
  TeamIndex,
} from "./runtime";
import type { MatchEvent, Vec2 } from "./types";

export type ScheduleRestartParams = {
  type: RestartType;
  teamIndex: TeamIndex;
  spot: Vec2;
  pause: number;
  message?: string;
  emitStartEvent?: boolean;
  preserveScene?: boolean;
  occurredAt?: number;
};

export interface RestartHooks {
  getPlayer(state: MatchState, runtimeId: string): RuntimePlayer | undefined;
  setControlledBall(state: MatchState, player: RuntimePlayer, pos?: Vec2): void;
  startShot(state: MatchState, player: RuntimePlayer, origin?: RestartType): void;
  startPass(
    state: MatchState,
    player: RuntimePlayer,
    targetId: string,
    options?: { skipOffside?: boolean; setPieceOrigin?: RestartType },
  ): void;
  positionPlayersForRestart(state: MatchState, restart: RestartState): void;
  captureFrame(state: MatchState): void;
  emit(state: MatchState, event: Omit<MatchEvent, "t">): void;
  emitAt(
    state: MatchState,
    eventTime: number,
    event: Omit<MatchEvent, "t">,
  ): void;
}

export function scheduleRestart(
  state: MatchState,
  params: ScheduleRestartParams,
  hooks: RestartHooks,
): void {
  const team = state.teams[params.teamIndex];
  const spot = { x: clamp(params.spot.x, 0, 1), y: clamp(params.spot.y, 0, 1) };
  const taker = selectRestartTaker(team, params.type, spot);
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

  const deadBallPos = params.preserveScene ? { ...state.ball.pos } : { ...spot };
  state.ball = { mode: "DEAD", pos: deadBallPos };
  state.restart = {
    type: params.type,
    teamIndex: params.teamIndex,
    spot,
    takerId: taker.runtimeId,
    resumeAt: (params.occurredAt ?? state.t) + params.pause,
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
    hooks.positionPlayersForRestart(state, state.restart);
  } else {
    for (const player of state.allPlayers) {
      if (!player.active) continue;
      player.target = { ...player.pos };
      player.runTarget = null;
      player.runUntil = 0;
    }
  }

  if (params.emitStartEvent ?? true) {
    hooks.emitAt(state, params.occurredAt ?? state.t, {
      type: params.type,
      team: team.side,
      playerId: taker.card.playerId,
      runtimeId: taker.runtimeId,
      message: params.message ?? restartDefaultMessage(params.type, team.name),
    });
  }
}

export function executeRestart(state: MatchState, hooks: RestartHooks): void {
  const restart = state.restart;
  if (!restart) return;
  const team = state.teams[restart.teamIndex];
  hooks.positionPlayersForRestart(state, restart);
  let taker = hooks.getPlayer(state, restart.takerId);
  if (!taker?.active) taker = selectRestartTaker(team, restart.type, restart.spot);
  if (!taker) {
    state.restart = null;
    return;
  }

  taker.pos = { ...restart.spot };
  taker.target = { ...restart.spot };
  state.restart = null;

  if (restart.type === "KICKOFF") {
    hooks.setControlledBall(state, taker);
    if (state.recordReplay) hooks.captureFrame(state);
    hooks.emit(state, {
      type: "KICKOFF",
      team: team.side,
      playerId: taker.card.playerId,
      runtimeId: taker.runtimeId,
      message: `${team.name} remet le ballon en jeu.`,
    });
    return;
  }

  if (restart.type === "PENALTY") {
    hooks.setControlledBall(state, taker);
    hooks.startShot(state, taker, "PENALTY");
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
      ? clamp(
          0.25 +
            0.42 * (stats.intelligence / 100) +
            0.18 * (stats.shooting / 100),
          0.2,
          0.82,
        )
      : 0.35;
    if (state.rng.chance(directChance)) {
      hooks.setControlledBall(state, taker);
      hooks.startShot(state, taker, "FREE_KICK");
      return;
    }
  }

  const target = selectRestartPassTarget(state, restart, taker);
  hooks.setControlledBall(state, taker);
  if (target) {
    hooks.startPass(state, taker, target.runtimeId, {
      skipOffside: true,
      setPieceOrigin: restart.type,
    });
  }
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
      .sort((a, b) =>
        b.card.stats.physical * 0.55 + b.card.stats.shooting * 0.45 -
        (a.card.stats.physical * 0.55 + a.card.stats.shooting * 0.45),
      )[0];
  }
  if (restart.type === "GOAL_KICK") {
    const preferred = teammates.filter((player) =>
      ["CB", "LB", "RB", "CDM"].includes(player.assignedPosition ?? ""),
    );
    return state.rng.pick(preferred.length > 0 ? preferred : teammates);
  }
  return [...teammates]
    .filter((player) => player.assignedPosition !== "GK")
    .sort(
      (a, b) =>
        distanceBetween(a.pos, restart.spot) -
        distanceBetween(b.pos, restart.spot),
    )[0];
}

function selectWallPlayers(
  state: MatchState,
  defendingTeamIndex: TeamIndex,
  spot: Vec2,
): string[] {
  const team = state.teams[defendingTeamIndex];
  const count = clamp(
    Math.round(
      3 +
        (1 -
          distanceBetween(
            spot,
            opponentGoal(state.teams[otherTeamIndex(defendingTeamIndex)].side),
          )) *
          2,
    ),
    MATCH_CONFIG.setPieces.wallMinPlayers,
    MATCH_CONFIG.setPieces.wallMaxPlayers,
  );
  return team.players
    .filter((player) => player.active && player.assignedPosition !== "GK")
    .sort((a, b) => distanceBetween(a.pos, spot) - distanceBetween(b.pos, spot))
    .slice(0, count)
    .map((player) => player.runtimeId);
}

function otherTeamIndex(index: TeamIndex): TeamIndex {
  return index === 0 ? 1 : 0;
}
