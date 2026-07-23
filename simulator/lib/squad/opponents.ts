import { positionCompatibility } from "@/lib/game/compatibility";
import { FORMATION_433 } from "@/lib/game/formations";
import type { PlayerCard, Position, Role, TeamSelection } from "@/lib/game/types";
import type { SquadOpponent } from "./api-types";

type TeamDefinition = {
  id: string;
  nation: string;
  name: string;
  flag: string;
  confederation: "AFC" | "CAF" | "Concacaf" | "CONMEBOL" | "OFC" | "UEFA";
};

export const WORLD_CUP_2026_TEAMS: readonly TeamDefinition[] = [
  { id: "canada-2026", nation: "Canada", name: "Canada 2026", flag: "🇨🇦", confederation: "Concacaf" },
  { id: "mexico-2026", nation: "Mexico", name: "Mexique 2026", flag: "🇲🇽", confederation: "Concacaf" },
  { id: "united-states-2026", nation: "United States", name: "États-Unis 2026", flag: "🇺🇸", confederation: "Concacaf" },
  { id: "australia-2026", nation: "Australia", name: "Australie 2026", flag: "🇦🇺", confederation: "AFC" },
  { id: "iraq-2026", nation: "Iraq", name: "Irak 2026", flag: "🇮🇶", confederation: "AFC" },
  { id: "iran-2026", nation: "Iran", name: "Iran 2026", flag: "🇮🇷", confederation: "AFC" },
  { id: "japan-2026", nation: "Japan", name: "Japon 2026", flag: "🇯🇵", confederation: "AFC" },
  { id: "jordan-2026", nation: "Jordan", name: "Jordanie 2026", flag: "🇯🇴", confederation: "AFC" },
  { id: "korea-republic-2026", nation: "Korea Republic", name: "Corée du Sud 2026", flag: "🇰🇷", confederation: "AFC" },
  { id: "qatar-2026", nation: "Qatar", name: "Qatar 2026", flag: "🇶🇦", confederation: "AFC" },
  { id: "saudi-arabia-2026", nation: "Saudi Arabia", name: "Arabie saoudite 2026", flag: "🇸🇦", confederation: "AFC" },
  { id: "uzbekistan-2026", nation: "Uzbekistan", name: "Ouzbékistan 2026", flag: "🇺🇿", confederation: "AFC" },
  { id: "algeria-2026", nation: "Algeria", name: "Algérie 2026", flag: "🇩🇿", confederation: "CAF" },
  { id: "cabo-verde-2026", nation: "Cabo Verde", name: "Cap-Vert 2026", flag: "🇨🇻", confederation: "CAF" },
  { id: "congo-dr-2026", nation: "Congo DR", name: "RD Congo 2026", flag: "🇨🇩", confederation: "CAF" },
  { id: "cote-divoire-2026", nation: "Côte d'Ivoire", name: "Côte d’Ivoire 2026", flag: "🇨🇮", confederation: "CAF" },
  { id: "egypt-2026", nation: "Egypt", name: "Égypte 2026", flag: "🇪🇬", confederation: "CAF" },
  { id: "ghana-2026", nation: "Ghana", name: "Ghana 2026", flag: "🇬🇭", confederation: "CAF" },
  { id: "morocco-2026", nation: "Morocco", name: "Maroc 2026", flag: "🇲🇦", confederation: "CAF" },
  { id: "senegal-2026", nation: "Senegal", name: "Sénégal 2026", flag: "🇸🇳", confederation: "CAF" },
  { id: "south-africa-2026", nation: "South Africa", name: "Afrique du Sud 2026", flag: "🇿🇦", confederation: "CAF" },
  { id: "tunisia-2026", nation: "Tunisia", name: "Tunisie 2026", flag: "🇹🇳", confederation: "CAF" },
  { id: "curacao-2026", nation: "Curacao", name: "Curaçao 2026", flag: "🇨🇼", confederation: "Concacaf" },
  { id: "haiti-2026", nation: "Haiti", name: "Haïti 2026", flag: "🇭🇹", confederation: "Concacaf" },
  { id: "panama-2026", nation: "Panama", name: "Panama 2026", flag: "🇵🇦", confederation: "Concacaf" },
  { id: "argentina-2026", nation: "Argentina", name: "Argentine 2026", flag: "🇦🇷", confederation: "CONMEBOL" },
  { id: "brazil-2026", nation: "Brazil", name: "Brésil 2026", flag: "🇧🇷", confederation: "CONMEBOL" },
  { id: "colombia-2026", nation: "Colombia", name: "Colombie 2026", flag: "🇨🇴", confederation: "CONMEBOL" },
  { id: "ecuador-2026", nation: "Ecuador", name: "Équateur 2026", flag: "🇪🇨", confederation: "CONMEBOL" },
  { id: "paraguay-2026", nation: "Paraguay", name: "Paraguay 2026", flag: "🇵🇾", confederation: "CONMEBOL" },
  { id: "uruguay-2026", nation: "Uruguay", name: "Uruguay 2026", flag: "🇺🇾", confederation: "CONMEBOL" },
  { id: "new-zealand-2026", nation: "New Zealand", name: "Nouvelle-Zélande 2026", flag: "🇳🇿", confederation: "OFC" },
  { id: "austria-2026", nation: "Austria", name: "Autriche 2026", flag: "🇦🇹", confederation: "UEFA" },
  { id: "belgium-2026", nation: "Belgium", name: "Belgique 2026", flag: "🇧🇪", confederation: "UEFA" },
  { id: "bosnia-herzegovina-2026", nation: "Bosnia and Herzegovina", name: "Bosnie-Herzégovine 2026", flag: "🇧🇦", confederation: "UEFA" },
  { id: "croatia-2026", nation: "Croatia", name: "Croatie 2026", flag: "🇭🇷", confederation: "UEFA" },
  { id: "czechia-2026", nation: "Czechia", name: "Tchéquie 2026", flag: "🇨🇿", confederation: "UEFA" },
  { id: "england-2026", nation: "England", name: "Angleterre 2026", flag: "🏴", confederation: "UEFA" },
  { id: "france-2026", nation: "France", name: "France 2026", flag: "🇫🇷", confederation: "UEFA" },
  { id: "germany-2026", nation: "Germany", name: "Allemagne 2026", flag: "🇩🇪", confederation: "UEFA" },
  { id: "netherlands-2026", nation: "Netherlands", name: "Pays-Bas 2026", flag: "🇳🇱", confederation: "UEFA" },
  { id: "norway-2026", nation: "Norway", name: "Norvège 2026", flag: "🇳🇴", confederation: "UEFA" },
  { id: "portugal-2026", nation: "Portugal", name: "Portugal 2026", flag: "🇵🇹", confederation: "UEFA" },
  { id: "scotland-2026", nation: "Scotland", name: "Écosse 2026", flag: "🏴", confederation: "UEFA" },
  { id: "spain-2026", nation: "Spain", name: "Espagne 2026", flag: "🇪🇸", confederation: "UEFA" },
  { id: "sweden-2026", nation: "Sweden", name: "Suède 2026", flag: "🇸🇪", confederation: "UEFA" },
  { id: "switzerland-2026", nation: "Switzerland", name: "Suisse 2026", flag: "🇨🇭", confederation: "UEFA" },
  { id: "turkiye-2026", nation: "Türkiye", name: "Turquie 2026", flag: "🇹🇷", confederation: "UEFA" },
] as const;

const ROLES: Partial<Record<string, Role>> = {
  CDM: "DEFENSIVE",
  LCM: "CREATOR",
  RCM: "NORMAL",
  LW: "OFFENSIVE",
  ST: "OFFENSIVE",
  RW: "CREATOR",
};
const BENCH_POSITIONS: Position[] = ["GK", "CB", "LB", "RB", "CM", "LW", "ST"];

const NATIONAL_TEAM_COLORS: Record<string, readonly [string, string]> = {
  "canada-2026": ["#dc2626", "#f8fafc"], "mexico-2026": ["#15803d", "#dc2626"],
  "united-states-2026": ["#1d4ed8", "#f8fafc"], "australia-2026": ["#eab308", "#166534"],
  "iraq-2026": ["#15803d", "#f8fafc"], "iran-2026": ["#f8fafc", "#dc2626"],
  "japan-2026": ["#1d4ed8", "#f8fafc"], "jordan-2026": ["#f8fafc", "#dc2626"],
  "korea-republic-2026": ["#dc2626", "#f8fafc"], "qatar-2026": ["#881337", "#f8fafc"],
  "saudi-arabia-2026": ["#15803d", "#f8fafc"], "uzbekistan-2026": ["#2563eb", "#f8fafc"],
  "algeria-2026": ["#f8fafc", "#15803d"], "cabo-verde-2026": ["#1d4ed8", "#f8fafc"],
  "congo-dr-2026": ["#2563eb", "#dc2626"], "cote-divoire-2026": ["#ea580c", "#f8fafc"],
  "egypt-2026": ["#dc2626", "#f8fafc"], "ghana-2026": ["#f8fafc", "#eab308"],
  "morocco-2026": ["#dc2626", "#15803d"], "senegal-2026": ["#f8fafc", "#15803d"],
  "south-africa-2026": ["#eab308", "#15803d"], "tunisia-2026": ["#f8fafc", "#dc2626"],
  "curacao-2026": ["#2563eb", "#eab308"], "haiti-2026": ["#1d4ed8", "#dc2626"],
  "panama-2026": ["#dc2626", "#f8fafc"], "argentina-2026": ["#38bdf8", "#f8fafc"],
  "brazil-2026": ["#eab308", "#2563eb"], "colombia-2026": ["#eab308", "#1d4ed8"],
  "ecuador-2026": ["#eab308", "#1d4ed8"], "paraguay-2026": ["#f8fafc", "#dc2626"],
  "uruguay-2026": ["#38bdf8", "#111827"], "new-zealand-2026": ["#111827", "#f8fafc"],
  "austria-2026": ["#dc2626", "#f8fafc"], "belgium-2026": ["#dc2626", "#111827"],
  "bosnia-herzegovina-2026": ["#1d4ed8", "#eab308"], "croatia-2026": ["#f8fafc", "#dc2626"],
  "czechia-2026": ["#f8fafc", "#dc2626"], "england-2026": ["#f8fafc", "#1d4ed8"],
  "france-2026": ["#1d4ed8", "#f8fafc"], "germany-2026": ["#f8fafc", "#111827"],
  "netherlands-2026": ["#ea580c", "#1d4ed8"], "norway-2026": ["#dc2626", "#f8fafc"],
  "portugal-2026": ["#dc2626", "#15803d"], "scotland-2026": ["#1d4ed8", "#f8fafc"],
  "spain-2026": ["#dc2626", "#eab308"], "sweden-2026": ["#eab308", "#2563eb"],
  "switzerland-2026": ["#dc2626", "#f8fafc"], "turkiye-2026": ["#dc2626", "#f8fafc"],
};

export const NEUTRAL_NATIONALITY_FLAG = "🏳️";

export function nationalityFlag(nation: string): string {
  return WORLD_CUP_2026_TEAMS.find((team) => team.nation === nation)?.flag
    ?? NEUTRAL_NATIONALITY_FLAG;
}

export function createOpponentCatalog(players: PlayerCard[]): SquadOpponent[] {
  return WORLD_CUP_2026_TEAMS.map((definition, teamIndex) => {
    const pool = players.filter((player) => player.nationalityName === definition.nation);
    const generated: PlayerCard[] = [];
    const used = new Set<number>();
    const starters: Record<string, number> = {};

    for (const slot of FORMATION_433) {
      const candidate = [...pool]
        .filter((player) => !used.has(player.playerId))
        .filter((player) => positionCompatibility(player, slot.position) >= 0.65)
        .sort((left, right) => opponentScore(right, slot.position) - opponentScore(left, slot.position))[0];
      const player = candidate ?? createReserve(definition, teamIndex, slot.position, generated.length, pool);
      if (!candidate) generated.push(player);
      starters[slot.id] = player.playerId;
      used.add(player.playerId);
    }

    const remaining = pool
      .filter((player) => !used.has(player.playerId))
      .sort((left, right) => right.overall - left.overall);
    const bench: number[] = [];
    for (const position of BENCH_POSITIONS) {
      const bestIndex = remaining.findIndex((player) => positionCompatibility(player, position) >= 0.65);
      const player = bestIndex >= 0
        ? remaining.splice(bestIndex, 1)[0]
        : createReserve(definition, teamIndex, position, generated.length, pool);
      if (bestIndex < 0) generated.push(player);
      bench.push(player.playerId);
      used.add(player.playerId);
    }

    const selection: TeamSelection = {
      name: definition.name,
      formationId: "4-3-3",
      starters,
      bench,
      roles: ROLES,
      tactics: { blockHeight: "NORMAL", buildUp: "BALANCED" },
    };
    const selectedIds = new Set([...Object.values(starters), ...bench]);
    const selectedPlayers = [...pool, ...generated].filter((player) => selectedIds.has(player.playerId));

    return {
      ...definition,
      primaryColor: NATIONAL_TEAM_COLORS[definition.id]?.[0] ?? "#f97316",
      secondaryColor: NATIONAL_TEAM_COLORS[definition.id]?.[1] ?? "#f8fafc",
      selection,
      players: selectedPlayers,
      syntheticPlayers: generated.length,
    };
  }).filter((opponent) => opponent.syntheticPlayers === 0);
}

export function createInternationalTeamContext(players: PlayerCard[]): {
  opponents: SquadOpponent[];
  players: PlayerCard[];
} {
  const opponents = createOpponentCatalog(players);
  const merged = new Map(players.map((player) => [player.playerId, player]));
  for (const opponent of opponents) {
    for (const player of opponent.players) merged.set(player.playerId, player);
  }
  return { opponents, players: [...merged.values()] };
}

function createReserve(
  definition: TeamDefinition,
  teamIndex: number,
  position: Position,
  reserveIndex: number,
  pool: PlayerCard[],
): PlayerCard {
  const average = (selector: (player: PlayerCard) => number, fallback: number) =>
    pool.length > 0
      ? Math.round(pool.reduce((sum, player) => sum + selector(player), 0) / pool.length)
      : fallback;
  const number = reserveIndex + 1;
  const overall = Math.max(58, Math.min(82, average((player) => player.overall, 66) - 3));
  return {
    playerId: -((teamIndex + 1) * 1000 + number),
    shortName: `Réserve ${number}`,
    longName: `${definition.name.replace(" 2026", "")} — joueur de réserve ${number}`,
    nationalityName: definition.nation,
    primaryPosition: position,
    alternativePositions: [],
    overall,
    potential: overall,
    stats: {
      speed: average((player) => player.stats.speed, 66),
      shooting: average((player) => player.stats.shooting, position === "ST" ? 69 : 59),
      passing: average((player) => player.stats.passing, 64),
      physical: average((player) => player.stats.physical, 66),
      technique: average((player) => player.stats.technique, 64),
      intelligence: average((player) => player.stats.intelligence, 66),
    },
  };
}

function opponentScore(player: PlayerCard, position: Position): number {
  return positionCompatibility(player, position) * 1000 + player.overall * 10 + player.potential;
}
