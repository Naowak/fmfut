import { positionCompatibility } from "@/lib/game/compatibility";
import { FORMATION_433 } from "@/lib/game/formations";
import type {
  PlayerCard,
  Position,
  Role,
  TeamSelection,
} from "@/lib/game/types";

export const SQUAD_SLOT_IDS = [
  "GK",
  "LB",
  "LCB",
  "RCB",
  "RB",
  "CDM",
  "LCM",
  "RCM",
  "LW",
  "ST",
  "RW",
] as const;

export type SquadSlotId = (typeof SQUAD_SLOT_IDS)[number];

export interface SquadDraft {
  name: string;
  starters: Partial<Record<SquadSlotId, PlayerCard>>;
  bench: PlayerCard[];
  roles: Partial<Record<SquadSlotId, Role>>;
  tactics: NonNullable<TeamSelection["tactics"]>;
}

export interface SquadSnapshot {
  version: 1;
  savedAt: string;
  draft: SquadDraft;
}

export interface SquadAxis {
  id: "BUILD_UP" | "CREATION" | "FINISHING" | "RECOVERY" | "PACE" | "DEPTH";
  label: string;
  score: number;
  explanation: string;
}

export interface SquadWarning {
  level: "INFO" | "WARNING" | "BLOCKING";
  message: string;
}

export interface SlotDiagnostic {
  slotId: SquadSlotId;
  position: Position;
  compatibility: number;
  compatibilityLabel: "NATUREL" | "ADAPTE" | "HORS_POSTE";
  synergyBonus: number;
  roleFit: number;
}

export interface SquadDiagnostics {
  complete: boolean;
  filledSlots: number;
  averageCompatibility: number;
  synergyLinks: number;
  totalSynergyBonus: number;
  slots: SlotDiagnostic[];
  axes: SquadAxis[];
  warnings: SquadWarning[];
}

export function createEmptyDraft(name = "Mon XI"): SquadDraft {
  return {
    name,
    starters: {},
    bench: [],
    roles: {},
    tactics: { blockHeight: "NORMAL", buildUp: "BALANCED" },
  };
}

export function draftFromSelection(
  selection: TeamSelection,
  players: PlayerCard[],
): SquadDraft {
  const byId = new Map(players.map((player) => [player.playerId, player]));
  const starters: SquadDraft["starters"] = {};
  for (const slotId of SQUAD_SLOT_IDS) {
    const player = byId.get(selection.starters[slotId]);
    if (!player) throw new Error(`Joueur du slot ${slotId} introuvable.`);
    starters[slotId] = player;
  }
  return {
    name: selection.name,
    starters,
    bench: selection.bench.map((id) => {
      const player = byId.get(id);
      if (!player) throw new Error(`Remplaçant ${id} introuvable.`);
      return player;
    }),
    roles: { ...(selection.roles as SquadDraft["roles"]) },
    tactics: selection.tactics ?? {
      blockHeight: "NORMAL",
      buildUp: "BALANCED",
    },
  };
}

export function assignPlayerToSlot(
  draft: SquadDraft,
  slotId: SquadSlotId,
  player: PlayerCard,
): SquadDraft {
  const sourceSlot = SQUAD_SLOT_IDS.find(
    (candidate) => draft.starters[candidate]?.playerId === player.playerId,
  );
  const displaced = draft.starters[slotId];
  const benchIndex = draft.bench.findIndex(
    (candidate) => candidate.playerId === player.playerId,
  );
  if (sourceSlot === slotId) return draft;
  if (sourceSlot && displaced) {
    return {
      ...draft,
      starters: {
        ...draft.starters,
        [sourceSlot]: displaced,
        [slotId]: player,
      },
    };
  }
  if (benchIndex >= 0 && displaced) {
    const bench = [...draft.bench];
    bench[benchIndex] = displaced;
    return {
      ...draft,
      starters: { ...draft.starters, [slotId]: player },
      bench,
    };
  }
  const cleaned = removePlayer(draft, player.playerId);
  return {
    ...cleaned,
    starters: { ...cleaned.starters, [slotId]: player },
  };
}

export function addPlayerToBench(
  draft: SquadDraft,
  player: PlayerCard,
  maxBench = 7,
): SquadDraft {
  const alreadyOnBench = draft.bench.some(
    (candidate) => candidate.playerId === player.playerId,
  );
  if (!alreadyOnBench && draft.bench.length >= maxBench) return draft;
  const cleaned = removePlayer(draft, player.playerId);
  return { ...cleaned, bench: [...cleaned.bench, player] };
}

export function removePlayer(draft: SquadDraft, playerId: number): SquadDraft {
  const starters = Object.fromEntries(
    Object.entries(draft.starters).filter(
      ([, player]) => player?.playerId !== playerId,
    ),
  ) as SquadDraft["starters"];
  return {
    ...draft,
    starters,
    bench: draft.bench.filter((player) => player.playerId !== playerId),
  };
}

export function playerInDraft(
  draft: SquadDraft,
  playerId: number,
): boolean {
  return allDraftPlayers(draft).some((player) => player.playerId === playerId);
}

export function allDraftPlayers(draft: SquadDraft): PlayerCard[] {
  return [
    ...Object.values(draft.starters).filter(
      (player): player is PlayerCard => Boolean(player),
    ),
    ...draft.bench,
  ];
}

export function toTeamSelection(draft: SquadDraft): TeamSelection {
  const missing = SQUAD_SLOT_IDS.filter((slotId) => !draft.starters[slotId]);
  if (missing.length > 0) {
    throw new Error(`Onze incomplet : ${missing.join(", ")}.`);
  }
  return {
    name: draft.name.trim() || "Mon XI",
    formationId: "4-3-3",
    starters: Object.fromEntries(
      SQUAD_SLOT_IDS.map((slotId) => [slotId, draft.starters[slotId]!.playerId]),
    ),
    bench: draft.bench.map((player) => player.playerId),
    roles: { ...draft.roles },
    tactics: { ...draft.tactics },
  };
}

export function diagnoseSquad(draft: SquadDraft): SquadDiagnostics {
  const slots: SlotDiagnostic[] = [];
  let synergyLinks = 0;
  for (const slot of FORMATION_433) {
    const slotId = slot.id as SquadSlotId;
    const player = draft.starters[slotId];
    if (!player) continue;
    const compatibility = positionCompatibility(player, slot.position);
    const matchingNeighbors = slot.neighbors.filter((neighborId) => {
      const neighbor = draft.starters[neighborId as SquadSlotId];
      return neighbor?.nationalityName === player.nationalityName;
    });
    synergyLinks += matchingNeighbors.length;
    slots.push({
      slotId,
      position: slot.position,
      compatibility,
      compatibilityLabel:
        compatibility >= 0.99
          ? "NATUREL"
          : compatibility >= 0.75
            ? "ADAPTE"
            : "HORS_POSTE",
      synergyBonus: Math.min(6, matchingNeighbors.length * 2),
      roleFit: roleFitScore(player, draft.roles[slotId] ?? "NORMAL"),
    });
  }
  synergyLinks /= 2;

  const starters = Object.values(draft.starters).filter(
    (player): player is PlayerCard => Boolean(player),
  );
  const attack = ["LW", "ST", "RW"]
    .map((slot) => draft.starters[slot as SquadSlotId])
    .filter((player): player is PlayerCard => Boolean(player));
  const midfield = ["CDM", "LCM", "RCM"]
    .map((slot) => draft.starters[slot as SquadSlotId])
    .filter((player): player is PlayerCard => Boolean(player));
  const defense = ["LB", "LCB", "RCB", "RB"]
    .map((slot) => draft.starters[slot as SquadSlotId])
    .filter((player): player is PlayerCard => Boolean(player));

  const axes: SquadAxis[] = [
    axis("BUILD_UP", "Construction", midfield, ["passing", "technique", "intelligence"], "Qualité de circulation et de sortie de balle."),
    axis("CREATION", "Création", [...midfield, ...attack], ["passing", "intelligence", "technique"], "Capacité à identifier et exécuter les bonnes options."),
    axis("FINISHING", "Finition", attack, ["shooting", "technique", "intelligence"], "Menace produite par les trois joueurs offensifs."),
    axis("RECOVERY", "Récupération", [...defense, ...midfield], ["physical", "intelligence", "speed"], "Pression, couverture et capacité à regagner le ballon."),
    axis("PACE", "Vitesse", starters, ["speed"], "Vitesse moyenne de l'ensemble du onze."),
    {
      id: "DEPTH",
      label: "Profondeur du banc",
      score: average(draft.bench.map((player) => player.overall)),
      explanation: "Niveau moyen des solutions disponibles en cours de match.",
    },
  ];

  const warnings: SquadWarning[] = [];
  const missing = SQUAD_SLOT_IDS.filter((slotId) => !draft.starters[slotId]);
  if (missing.length > 0) {
    warnings.push({ level: "BLOCKING", message: `Postes à compléter : ${missing.join(", ")}.` });
  }
  for (const slot of slots.filter((item) => item.compatibility < 0.75)) {
    warnings.push({ level: "WARNING", message: `${draft.starters[slot.slotId]!.shortName} est très hors poste en ${slot.slotId}.` });
  }
  if (!Object.values(draft.roles).includes("CREATOR")) {
    warnings.push({ level: "INFO", message: "Aucun rôle Créateur : la production d'occasions peut devenir prévisible." });
  }
  if (defense.length === 4 && average(defense.map((player) => player.stats.speed)) < 70) {
    warnings.push({ level: "WARNING", message: "La ligne défensive manque de vitesse face aux transitions." });
  }
  if (draft.bench.length < 3) {
    warnings.push({ level: "INFO", message: "Le banc offre peu d'options pour les remplacements automatiques." });
  }

  return {
    complete: missing.length === 0,
    filledSlots: starters.length,
    averageCompatibility:
      slots.length === 0
        ? 0
        : Math.round((slots.reduce((sum, slot) => sum + slot.compatibility, 0) / slots.length) * 100),
    synergyLinks,
    totalSynergyBonus: slots.reduce((sum, slot) => sum + slot.synergyBonus, 0),
    slots,
    axes,
    warnings,
  };
}

export function createSnapshot(draft: SquadDraft): SquadSnapshot {
  return { version: 1, savedAt: new Date().toISOString(), draft };
}

export function parseSnapshot(value: string): SquadSnapshot {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object") throw new Error("Fichier de composition invalide.");
  const snapshot = parsed as Partial<SquadSnapshot>;
  if (snapshot.version !== 1 || !snapshot.draft || !isDraft(snapshot.draft)) {
    throw new Error("Format de composition non reconnu.");
  }
  const ids = allDraftPlayers(snapshot.draft).map((player) => player.playerId);
  if (new Set(ids).size !== ids.length) throw new Error("La composition importée contient un joueur en double.");
  return snapshot as SquadSnapshot;
}

export function roleFitScore(player: PlayerCard, role: Role): number {
  const stats = player.stats;
  const weights: Record<Role, Array<keyof PlayerCard["stats"]>> = {
    DEFENSIVE: ["physical", "intelligence", "passing"],
    NORMAL: ["speed", "shooting", "passing", "physical", "technique", "intelligence"],
    OFFENSIVE: ["shooting", "speed", "technique"],
    CREATOR: ["passing", "intelligence", "technique"],
    PRESSING: ["physical", "speed", "intelligence"],
  };
  return Math.round(average(weights[role].map((stat) => stats[stat])));
}

function axis(
  id: SquadAxis["id"],
  label: string,
  players: PlayerCard[],
  stats: Array<keyof PlayerCard["stats"]>,
  explanation: string,
): SquadAxis {
  return {
    id,
    label,
    score: Math.round(
      average(players.flatMap((player) => stats.map((stat) => player.stats[stat]))),
    ),
    explanation,
  };
}

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isDraft(value: unknown): value is SquadDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<SquadDraft>;
  if (
    typeof draft.name !== "string" ||
    !draft.starters ||
    !draft.roles ||
    !draft.tactics ||
    !Array.isArray(draft.bench) ||
    draft.bench.length > 7
  ) return false;
  const validRoles: Role[] = ["DEFENSIVE", "NORMAL", "OFFENSIVE", "CREATOR", "PRESSING"];
  if (
    !Object.keys(draft.starters).every((slotId) => SQUAD_SLOT_IDS.includes(slotId as SquadSlotId)) ||
    !Object.entries(draft.roles).every(
      ([slotId, role]) =>
        SQUAD_SLOT_IDS.includes(slotId as SquadSlotId) &&
        validRoles.includes(role as Role),
    ) ||
    !["LOW", "NORMAL", "HIGH"].includes(draft.tactics.blockHeight) ||
    !["SHORT", "BALANCED", "DIRECT"].includes(draft.tactics.buildUp)
  ) return false;
  return [...Object.values(draft.starters), ...draft.bench].every(
    (player) => player === undefined || isPlayerCard(player),
  );
}

function isPlayerCard(value: unknown): value is PlayerCard {
  if (!value || typeof value !== "object") return false;
  const player = value as Partial<PlayerCard>;
  return (
    typeof player.playerId === "number" &&
    typeof player.shortName === "string" &&
    typeof player.nationalityName === "string" &&
    typeof player.primaryPosition === "string" &&
    Array.isArray(player.alternativePositions) &&
    typeof player.overall === "number" &&
    Boolean(player.stats) &&
    ["speed", "shooting", "passing", "physical", "technique", "intelligence"].every(
      (stat) => typeof player.stats?.[stat as keyof PlayerCard["stats"]] === "number",
    )
  );
}
