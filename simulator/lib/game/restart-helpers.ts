import { MATCH_CONFIG } from "./config";
import { distanceBetween } from "./geometry";
import type { RestartType, RuntimePlayer, RuntimeTeam } from "./runtime";
import type { TeamSide, Vec2 } from "./types";

export function restartDefaultMessage(
  type: RestartType,
  teamName: string,
): string {
  switch (type) {
    case "THROW_IN": return `Touche pour ${teamName}.`;
    case "CORNER": return `Corner pour ${teamName}.`;
    case "GOAL_KICK": return `Six mètres pour ${teamName}.`;
    case "FREE_KICK": return `Coup franc pour ${teamName}.`;
    case "PENALTY": return `Penalty pour ${teamName} !`;
    case "KICKOFF": return `Coup d'envoi pour ${teamName}.`;
  }
}

export function selectRestartTaker(
  team: RuntimeTeam,
  type: RestartType,
  spot: Vec2,
): RuntimePlayer | undefined {
  const active = team.players.filter(
    (player) => player.active && !player.redCard && !player.injured,
  );
  if (type === "GOAL_KICK") {
    return active.find((player) => player.slotId === "GK") ?? active[0];
  }
  if (type === "PENALTY") {
    return [...active]
      .filter((player) => player.assignedPosition !== "GK")
      .sort((a, b) => b.card.stats.shooting - a.card.stats.shooting)[0];
  }
  const outfield = active.filter((player) => player.assignedPosition !== "GK");
  if (type === "FREE_KICK") {
    return [...outfield].sort((a, b) => {
      const da = distanceBetween(a.pos, spot) -
        (a.card.stats.shooting + a.card.stats.passing) / 2500;
      const db = distanceBetween(b.pos, spot) -
        (b.card.stats.shooting + b.card.stats.passing) / 2500;
      return da - db;
    })[0];
  }
  return [...outfield].sort(
    (a, b) => distanceBetween(a.pos, spot) - distanceBetween(b.pos, spot),
  )[0];
}

export function isInsideOwnPenaltyArea(
  pos: Vec2,
  defendingSide: TeamSide,
): boolean {
  const progress = defendingSide === "HOME" ? pos.x : 1 - pos.x;
  return (
    progress <= MATCH_CONFIG.setPieces.penaltyAreaDepth &&
    Math.abs(pos.y - 0.5) <= MATCH_CONFIG.setPieces.penaltyAreaHalfWidth
  );
}

export function penaltySpotForAttack(attackingSide: TeamSide): Vec2 {
  return {
    x: attackingSide === "HOME"
      ? 1 - MATCH_CONFIG.setPieces.penaltySpotDistanceFromGoal
      : MATCH_CONFIG.setPieces.penaltySpotDistanceFromGoal,
    y: 0.5,
  };
}
