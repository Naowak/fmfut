import type { FormationSlot, TeamSide, Vec2 } from "./types";

export const FORMATION_433: FormationSlot[] = [
  { id: "GK", position: "GK", anchor: { x: 0.055, y: 0.50 }, neighbors: ["LCB", "RCB"] },

  { id: "LB", position: "LB", anchor: { x: 0.20, y: 0.16 }, neighbors: ["LCB", "LCM", "LW"] },
  { id: "LCB", position: "CB", anchor: { x: 0.17, y: 0.37 }, neighbors: ["GK", "LB", "RCB", "CDM"] },
  { id: "RCB", position: "CB", anchor: { x: 0.17, y: 0.63 }, neighbors: ["GK", "RB", "LCB", "CDM"] },
  { id: "RB", position: "RB", anchor: { x: 0.20, y: 0.84 }, neighbors: ["RCB", "RCM", "RW"] },

  { id: "CDM", position: "CDM", anchor: { x: 0.36, y: 0.50 }, neighbors: ["LCB", "RCB", "LCM", "RCM"] },
  { id: "LCM", position: "CM", anchor: { x: 0.47, y: 0.34 }, neighbors: ["LB", "CDM", "RCM", "LW", "ST"] },
  { id: "RCM", position: "CM", anchor: { x: 0.47, y: 0.66 }, neighbors: ["RB", "CDM", "LCM", "RW", "ST"] },

  { id: "LW", position: "LW", anchor: { x: 0.70, y: 0.18 }, neighbors: ["LB", "LCM", "ST"] },
  { id: "ST", position: "ST", anchor: { x: 0.76, y: 0.50 }, neighbors: ["LCM", "RCM", "LW", "RW"] },
  { id: "RW", position: "RW", anchor: { x: 0.70, y: 0.82 }, neighbors: ["RB", "RCM", "ST"] },
];

export const FORMATION_SLOT_IDS = FORMATION_433.map((slot) => slot.id);

export function getSlot(slotId: string): FormationSlot {
  const slot = FORMATION_433.find((candidate) => candidate.id === slotId);
  if (!slot) {
    throw new Error(`Slot de formation inconnu: ${slotId}`);
  }
  return slot;
}

export function anchorForSide(anchor: Vec2, side: TeamSide): Vec2 {
  return side === "HOME"
    ? { ...anchor }
    : { x: 1 - anchor.x, y: anchor.y };
}

export function attackDirection(side: TeamSide): 1 | -1 {
  return side === "HOME" ? 1 : -1;
}

export function ownGoal(side: TeamSide): Vec2 {
  return side === "HOME" ? { x: 0, y: 0.5 } : { x: 1, y: 0.5 };
}

export function opponentGoal(side: TeamSide): Vec2 {
  return side === "HOME" ? { x: 1, y: 0.5 } : { x: 0, y: 0.5 };
}
