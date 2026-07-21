import { positionCompatibility } from "./compatibility";
import { MATCH_CONFIG } from "./config";
import { getSlot } from "./formations";
import type { MatchState, RuntimePlayer, RuntimeTeam } from "./runtime";
import type { MatchEvent } from "./types";

export interface SubstitutionHooks {
  getPlayer(state: MatchState, runtimeId: string): RuntimePlayer | undefined;
  setControlledBall(state: MatchState, player: RuntimePlayer): void;
  emit(state: MatchState, event: Omit<MatchEvent, "t">): void;
}

export function evaluateAutomaticSubstitutions(
  state: MatchState,
  hooks: SubstitutionHooks,
): void {
  if (!state.restart) return;

  processPendingSubstitutions(state, hooks);
  const displayedMinute =
    (state.t / state.logicalDuration) * MATCH_CONFIG.displayedMinutes;

  if (displayedMinute < MATCH_CONFIG.substitutions.minimumDisplayedMinute) {
    return;
  }

  for (const team of state.teams) {
    if (team.substitutionsUsed >= MATCH_CONFIG.maxSubstitutions) continue;
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
    if (!candidate) continue;

    const emergencyFatigue =
      candidate.energy < MATCH_CONFIG.substitutions.emergencyEnergyThreshold;
    const usefulPlannedRotation =
      plannedRotationDue &&
      (candidate.energy < MATCH_CONFIG.substitutions.plannedEnergyThreshold ||
        candidate.yellowCards > 0 ||
        displayedMinute >= 78);
    if (!emergencyFatigue && !usefulPlannedRotation) continue;

    const reason = candidate.yellowCards > 0
      ? "carton"
      : emergencyFatigue
        ? "fatigue"
        : "rotation";
    substitutePlayer(state, candidate, reason, hooks);
  }
}

export function queueSubstitution(
  state: MatchState,
  outgoing: RuntimePlayer,
  reason: string,
): void {
  const team = state.teams[outgoing.teamIndex];
  if (
    team.pendingSubstitutions.some(
      (pending) => pending.outgoingRuntimeId === outgoing.runtimeId,
    )
  ) {
    return;
  }
  team.pendingSubstitutions.push({
    outgoingRuntimeId: outgoing.runtimeId,
    reason,
  });
}

export function processPendingSubstitutions(
  state: MatchState,
  hooks: SubstitutionHooks,
): void {
  for (const team of state.teams) {
    const pending = [...team.pendingSubstitutions];
    team.pendingSubstitutions = [];

    for (const item of pending) {
      const outgoing = hooks.getPlayer(state, item.outgoingRuntimeId);
      if (!outgoing || !outgoing.active || outgoing.redCard) continue;

      const changed = substitutePlayer(state, outgoing, item.reason, hooks);
      if (!changed && outgoing.injured) outgoing.active = false;
    }
  }
}

export function recomputeSynergy(team: RuntimeTeam): void {
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
          neighbor!.card.nationalityName === player.card.nationalityName,
      ).length;
    player.synergyBonus = Math.min(
      MATCH_CONFIG.synergy.maxIntelligenceBonus,
      matchingNeighbors *
        MATCH_CONFIG.synergy.intelligencePerMatchingNeighbor,
    );
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
  hooks: SubstitutionHooks,
): boolean {
  const team = state.teams[outgoing.teamIndex];
  if (
    team.substitutionsUsed >= MATCH_CONFIG.maxSubstitutions ||
    !outgoing.assignedPosition ||
    !outgoing.slotId
  ) {
    if (outgoing.injured) outgoing.active = false;
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
    if (outgoing.injured) outgoing.active = false;
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
    hooks.setControlledBall(state, incoming);
  }
  hooks.emit(state, {
    type: "SUBSTITUTION",
    team: team.side,
    playerId: incoming.card.playerId,
    runtimeId: incoming.runtimeId,
    message: `${incoming.card.shortName} remplace ${outgoing.card.shortName} (${reason}).`,
  });
  return true;
}
