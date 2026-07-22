import { positionCompatibility } from "@/lib/game/compatibility";
import { FORMATION_433 } from "@/lib/game/formations";
import type { PlayerCard, Role, TeamSelection } from "@/lib/game/types";
import type { SquadOpponent } from "./api-types";

const DEFINITIONS = [
  { id: "france-2026", nation: "France", name: "France 2026" },
  { id: "argentina-2026", nation: "Argentina", name: "Argentine 2026" },
  { id: "england-2026", nation: "England", name: "Angleterre 2026" },
  { id: "spain-2026", nation: "Spain", name: "Espagne 2026" },
  { id: "brazil-2026", nation: "Brazil", name: "Brésil 2026" },
  { id: "portugal-2026", nation: "Portugal", name: "Portugal 2026" },
  { id: "germany-2026", nation: "Germany", name: "Allemagne 2026" },
  { id: "netherlands-2026", nation: "Netherlands", name: "Pays-Bas 2026" },
] as const;

const ROLES: Partial<Record<string, Role>> = {
  CDM: "DEFENSIVE",
  LCM: "CREATOR",
  RCM: "NORMAL",
  LW: "OFFENSIVE",
  ST: "OFFENSIVE",
  RW: "CREATOR",
};

export function createOpponentCatalog(players: PlayerCard[]): SquadOpponent[] {
  return DEFINITIONS.map((definition) => {
    const pool = players.filter(
      (player) => player.nationalityName === definition.nation,
    );
    if (pool.length < 18) {
      throw new Error(`Effectif insuffisant pour ${definition.name}.`);
    }

    const used = new Set<number>();
    const starters: Record<string, number> = {};
    for (const slot of FORMATION_433) {
      const player = [...pool]
        .filter((candidate) => !used.has(candidate.playerId))
        .sort((left, right) =>
          opponentScore(right, slot.position) - opponentScore(left, slot.position),
        )[0];
      if (!player) throw new Error(`Onze incomplet pour ${definition.name}.`);
      starters[slot.id] = player.playerId;
      used.add(player.playerId);
    }

    const bench = [...pool]
      .filter((player) => !used.has(player.playerId))
      .sort((left, right) => right.overall - left.overall)
      .slice(0, 7)
      .map((player) => player.playerId);
    const selection: TeamSelection = {
      name: definition.name,
      formationId: "4-3-3",
      starters,
      bench,
      roles: ROLES,
      tactics: { blockHeight: "NORMAL", buildUp: "BALANCED" },
    };
    const selectedIds = new Set([...Object.values(starters), ...bench]);

    return {
      ...definition,
      selection,
      players: pool.filter((player) => selectedIds.has(player.playerId)),
    };
  });
}

function opponentScore(player: PlayerCard, position: Parameters<typeof positionCompatibility>[1]): number {
  return positionCompatibility(player, position) * 1000 + player.overall * 10 + player.potential;
}
