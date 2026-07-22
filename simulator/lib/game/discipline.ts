import { MATCH_CONFIG } from "./config";
import { penaltySpotForAttack, isInsideOwnPenaltyArea } from "./restart-helpers";
import type { MatchState, RestartType, RuntimePlayer, TeamIndex } from "./runtime";
import { queueSubstitution, recomputeSynergy } from "./substitutions";
import type { MatchEvent, Vec2 } from "./types";

type ScheduleRestartParams = {
  type: RestartType;
  teamIndex: TeamIndex;
  spot: Vec2;
  pause: number;
  message?: string;
};

export interface DisciplineHooks {
  emit(state: MatchState, event: Omit<MatchEvent, "t">): void;
  scheduleRestart(state: MatchState, params: ScheduleRestartParams): void;
}

export function handleFoul(
  state: MatchState,
  defender: RuntimePlayer,
  victim: RuntimePlayer,
  hooks: DisciplineHooks,
): void {
  state.teams[defender.teamIndex].stats.fouls += 1;
  defender.matchStats.fouls += 1;
  hooks.emit(state, {
    type: "FOUL",
    team: defender.side,
    playerId: defender.card.playerId,
    runtimeId: defender.runtimeId,
    message: `Faute de ${defender.card.shortName} sur ${victim.card.shortName}.`,
  });

  const severity = state.rng.next();
  if (severity < 0.018) giveRedCard(state, defender, "carton rouge direct", hooks);
  else if (severity < 0.29) giveYellowCard(state, defender, hooks);

  maybeInjuryFromContact(state, victim, defender, hooks, 1.8);
  const penalty = isInsideOwnPenaltyArea(victim.pos, defender.side);
  hooks.scheduleRestart(state, {
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

function giveYellowCard(
  state: MatchState,
  player: RuntimePlayer,
  hooks: DisciplineHooks,
): void {
  player.yellowCards += 1;
  state.teams[player.teamIndex].stats.yellowCards += 1;
  player.matchStats.yellowCards += 1;
  hooks.emit(state, {
    type: "YELLOW_CARD",
    team: player.side,
    playerId: player.card.playerId,
    runtimeId: player.runtimeId,
    message: `Carton jaune pour ${player.card.shortName}.`,
  });
  if (player.yellowCards >= 2) {
    giveRedCard(state, player, "deuxième carton jaune", hooks);
  }
}

function giveRedCard(
  state: MatchState,
  player: RuntimePlayer,
  reason: string,
  hooks: DisciplineHooks,
): void {
  if (player.redCard) return;
  player.redCard = true;
  player.active = false;
  state.teams[player.teamIndex].stats.redCards += 1;
  player.matchStats.redCards += 1;
  hooks.emit(state, {
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
  if (state.ball.mode === "CONTROLLED" && state.ball.ownerId === player.runtimeId) {
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

export function maybeInjuryFromContact(
  state: MatchState,
  victim: RuntimePlayer,
  other: RuntimePlayer,
  hooks: Pick<DisciplineHooks, "emit">,
  multiplier = 1,
): void {
  if (victim.injured || !victim.active) return;
  const fatigueFactor = 1 + (100 - victim.energy) / 80;
  const physicalProtection = 1.25 - victim.card.stats.physical / 200;
  const probability = 0.0012 * multiplier * fatigueFactor * physicalProtection;
  if (!state.rng.chance(probability)) return;

  victim.injured = true;
  hooks.emit(state, {
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
  queueSubstitution(state, victim, "blessure");
  if (
    multiplier > 1.5 &&
    other.active &&
    !other.injured &&
    state.rng.chance(probability * 0.12)
  ) {
    other.injured = true;
    queueSubstitution(state, other, "blessure");
  }
}
