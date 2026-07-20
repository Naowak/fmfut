import type { PlayerCard, TeamSelection } from "./types";

export const DEFAULT_HOME_SELECTION: TeamSelection = {
  name: "Paris AI",
  formationId: "4-3-3",
  starters: {
    GK: 192119,
    LB: 212622,
    LCB: 237383,
    RCB: 203376,
    RB: 235212,
    CDM: 231866,
    LCM: 252371,
    RCM: 251854,
    LW: 238794,
    ST: 231747,
    RW: 209331
  },
  bench: [212831, 231443, 202126, 256630, 233419],
  roles: {
    CDM: "DEFENSIVE",
    LCM: "CREATOR",
    RCM: "NORMAL",
    LW: "OFFENSIVE",
    ST: "OFFENSIVE",
    RW: "CREATOR",
    LB: "NORMAL",
    RB: "OFFENSIVE"
  },
  tactics: {
    blockHeight: "NORMAL",
    buildUp: "BALANCED"
  }
};

export const DEFAULT_AWAY_SELECTION: TeamSelection = {
  name: "World XI",
  formationId: "4-3-3",
  starters: {
    GK: 230621,
    LB: 235212,
    LCB: 203376,
    RCB: 232580,
    RB: 212622,
    CDM: 239053,
    LCM: 255253,
    RCM: 256790,
    LW: 233419,
    ST: 239085,
    RW: 246669
  },
  bench: [200389, 233731, 188545, 212198, 257534],
  roles: {
    CDM: "PRESSING",
    LCM: "CREATOR",
    RCM: "OFFENSIVE",
    LW: "OFFENSIVE",
    ST: "OFFENSIVE",
    RW: "NORMAL"
  },
  tactics: {
    blockHeight: "NORMAL",
    buildUp: "BALANCED"
  }
};

export function assertSelectionPlayersExist(
  selection: TeamSelection,
  players: PlayerCard[],
): void {
  const ids = new Set(players.map((player) => player.playerId));
  const requestedIds = [
    ...Object.values(selection.starters),
    ...selection.bench,
  ];

  const missing = requestedIds.filter((id) => !ids.has(id));
  if (missing.length > 0) {
    throw new Error(
      `Joueurs manquants pour "${selection.name}": ${missing.join(", ")}. ` +
        "Le CSV de démonstration ou ton export doit contenir ces player_id.",
    );
  }
}
