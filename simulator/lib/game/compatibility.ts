import { MATCH_CONFIG, clamp } from "./config";
import type { PlayerCard, Position } from "./types";

const MATRIX: Record<Position, Partial<Record<Position, number>>> = {
  GK: { GK: 1 },
  LB: { LB: 1, RB: 0.88, CB: 0.8, CDM: 0.8, CM: 0.75, LM: 0.9, LW: 0.8, RM: 0.65, RW: 0.55, CAM: 0.6, ST: 0.5 },
  RB: { RB: 1, LB: 0.88, CB: 0.8, CDM: 0.8, CM: 0.75, RM: 0.9, RW: 0.8, LM: 0.65, LW: 0.55, CAM: 0.6, ST: 0.5 },
  CB: { CB: 1, LB: 0.75, RB: 0.75, CDM: 0.9, CM: 0.7, LM: 0.55, RM: 0.55, LW: 0.4, RW: 0.4, CAM: 0.5, ST: 0.45 },
  CDM: { CDM: 1, CB: 0.9, CM: 0.9, LB: 0.75, RB: 0.75, CAM: 0.75, LM: 0.7, RM: 0.7, LW: 0.55, RW: 0.55, ST: 0.5 },
  CM: { CM: 1, CDM: 0.9, CAM: 0.9, LB: 0.65, RB: 0.65, CB: 0.65, LM: 0.85, RM: 0.85, LW: 0.7, RW: 0.7, ST: 0.65 },
  CAM: { CAM: 1, CM: 0.9, CDM: 0.7, LM: 0.85, RM: 0.85, LW: 0.85, RW: 0.85, ST: 0.8, LB: 0.5, RB: 0.5, CB: 0.45 },
  LM: { LM: 1, LW: 0.95, CM: 0.85, CAM: 0.85, LB: 0.85, RM: 0.75, RW: 0.65, ST: 0.7, CDM: 0.65, CB: 0.5, RB: 0.55 },
  RM: { RM: 1, RW: 0.95, CM: 0.85, CAM: 0.85, RB: 0.85, LM: 0.75, LW: 0.65, ST: 0.7, CDM: 0.65, CB: 0.5, LB: 0.55 },
  LW: { LW: 1, LM: 0.95, RW: 0.85, RM: 0.75, CAM: 0.85, ST: 0.85, CM: 0.7, LB: 0.7, RB: 0.55, CDM: 0.45, CB: 0.35 },
  RW: { RW: 1, RM: 0.95, LW: 0.85, LM: 0.75, CAM: 0.85, ST: 0.85, CM: 0.7, RB: 0.7, LB: 0.55, CDM: 0.45, CB: 0.35 },
  ST: { ST: 1, LW: 0.85, RW: 0.85, CAM: 0.8, LM: 0.7, RM: 0.7, CM: 0.6, CDM: 0.45, LB: 0.4, RB: 0.4, CB: 0.4 },
};

export function positionCompatibility(
  player: PlayerCard,
  assignedPosition: Position,
): number {
  const naturalPositions = new Set([
    player.primaryPosition,
    ...player.alternativePositions,
  ]);

  if (naturalPositions.has(assignedPosition)) {
    return 1;
  }

  if (player.primaryPosition === "GK" || assignedPosition === "GK") {
    return 0.2;
  }

  return MATRIX[player.primaryPosition]?.[assignedPosition] ?? 0.45;
}

export function fatigueMultiplier(energy: number): number {
  const normalized = clamp(energy / 100);
  const min = MATCH_CONFIG.fatigue.minStatMultiplier;
  return min + (1 - min) * Math.sqrt(normalized);
}

export function effectiveStats(params: {
  player: PlayerCard;
  assignedPosition: Position;
  energy: number;
  synergyBonus: number;
}) {
  const { player, assignedPosition, energy, synergyBonus } = params;
  const compatibility = positionCompatibility(player, assignedPosition);
  const fatigue = fatigueMultiplier(energy);
  const fatigueIntelligencePenalty = (100 - energy) * 0.08;

  return {
    speed: player.stats.speed * fatigue,
    shooting:
      player.stats.shooting * (0.95 + 0.05 * compatibility) * fatigue,
    passing:
      player.stats.passing * (0.9 + 0.1 * compatibility) * fatigue,
    physical: player.stats.physical * fatigue,
    technique:
      player.stats.technique * (0.9 + 0.1 * compatibility) * fatigue,
    intelligence: clamp(
      player.stats.intelligence * compatibility +
        synergyBonus -
        fatigueIntelligencePenalty,
      1,
      100,
    ),
    compatibility,
  };
}
