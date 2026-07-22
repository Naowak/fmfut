import { effectiveStats } from "./compatibility";
import { clamp, MATCH_CONFIG } from "./config";
import { attackDirection } from "./formations";
import {
  moveTowards,
  normalizeVector,
  pointToSegmentDistance,
  rotateVector,
  vectorLength,
} from "./geometry";
import type { MatchState, RuntimePlayer, TeamIndex } from "./runtime";
import type { MatchEvent, Vec2 } from "./types";

export interface ShotInterceptionHooks {
  getPlayer(state: MatchState, runtimeId: string): RuntimePlayer | undefined;
  setControlledBall(state: MatchState, player: RuntimePlayer, pos?: Vec2): void;
  emit(state: MatchState, event: Omit<MatchEvent, "t">): void;
}

export function tryPhysicalShotInterception(
  state: MatchState,
  segmentStart: Vec2,
  segmentEnd: Vec2,
  hooks: ShotInterceptionHooks,
): boolean {
  if (state.ball.mode !== "LOOSE" || state.ball.kind !== "SHOT") return false;

  const shot = state.ball;
  const shooter = shot.actorId ? hooks.getPlayer(state, shot.actorId) : undefined;
  const defendingTeamIndex = shooter
    ? otherTeamIndex(shooter.teamIndex)
    : shot.lastTouchTeamIndex !== undefined
      ? otherTeamIndex(shot.lastTouchTeamIndex)
      : otherTeamIndex(state.possessionTeamIndex);
  const defendingTeam = state.teams[defendingTeamIndex];
  const goalkeeper = defendingTeam.players.find(
    (player) => player.active && player.slotId === "GK",
  );
  const ballSpeed = vectorLength(shot.velocity);

  if (goalkeeper?.active && goalkeeper.assignedPosition) {
    const distance = pointToSegmentDistance(goalkeeper.pos, segmentStart, segmentEnd);
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
        1 - clamp(distance / MATCH_CONFIG.ball.goalkeeperParryRadius, 0, 1);
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
        goalkeeper.matchStats.goalkeeperSaves += 1;
        goalkeeper.matchStats.duelsWon += 1;
        if (shot.actorId) {
          const shooter = hooks.getPlayer(state, shot.actorId);
          if (shooter) shooter.matchStats.shotsOnTarget += 1;
        }
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
          hooks.setControlledBall(state, goalkeeper, { ...shot.pos });
          hooks.emit(state, {
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
        hooks.emit(state, {
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
      const deflected = rotateVector(current, state.rng.between(-0.85, 0.85));
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

function otherTeamIndex(index: TeamIndex): TeamIndex {
  return index === 0 ? 1 : 0;
}
