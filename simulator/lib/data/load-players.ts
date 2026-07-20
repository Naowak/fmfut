import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import type { PlayerCard, Position } from "@/lib/game/types";

type CsvPlayer = {
  player_id: string;
  short_name: string;
  long_name: string;
  nationality_name: string;
  primary_position: string;
  alternative_positions_json: string;
  overall: string;
  potential: string;
  speed: string;
  shooting: string;
  passing: string;
  physical: string;
  technique: string;
  intelligence: string;
};

const VALID_POSITIONS = new Set<Position>([
  "GK",
  "LB",
  "CB",
  "RB",
  "CDM",
  "CM",
  "CAM",
  "LM",
  "RM",
  "LW",
  "RW",
  "ST",
]);

let cachedPlayers: PlayerCard[] | null = null;
let cachedPath: string | null = null;

function asPosition(value: string): Position {
  const normalized = value.trim().toUpperCase() as Position;
  if (!VALID_POSITIONS.has(normalized)) {
    throw new Error(`Poste non supporté dans le CSV: "${value}"`);
  }
  return normalized;
}

function parseAlternativePositions(raw: string): Position[] {
  if (!raw.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((value): value is string => typeof value === "string")
      .map(asPosition);
  } catch {
    return [];
  }
}

function toNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadPlayersFromCsv(csvPath?: string): PlayerCard[] {
  const configuredPath = csvPath ?? process.env.PLAYERS_CSV_PATH;
  const resolvedPath = configuredPath
    ? path.resolve(/* turbopackIgnore: true */ configuredPath)
    : path.join(process.cwd(), "data", "players.csv");

  if (cachedPlayers && cachedPath === resolvedPath) {
    return cachedPlayers;
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `CSV joueurs introuvable: ${resolvedPath}. ` +
        "Place ton export dans data/players.csv ou configure PLAYERS_CSV_PATH.",
    );
  }

  const content = fs.readFileSync(resolvedPath, "utf8");
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  }) as CsvPlayer[];

  const players = rows.map((row): PlayerCard => ({
    playerId: toNumber(row.player_id),
    shortName: row.short_name,
    longName: row.long_name,
    nationalityName: row.nationality_name,
    primaryPosition: asPosition(row.primary_position),
    alternativePositions: parseAlternativePositions(
      row.alternative_positions_json ?? "[]",
    ),
    overall: toNumber(row.overall),
    potential: toNumber(row.potential),
    stats: {
      speed: toNumber(row.speed),
      shooting: toNumber(row.shooting),
      passing: toNumber(row.passing),
      physical: toNumber(row.physical),
      technique: toNumber(row.technique),
      intelligence: toNumber(row.intelligence),
    },
  }));

  cachedPlayers = players;
  cachedPath = resolvedPath;
  return players;
}

export function playersById(players: PlayerCard[]): Map<number, PlayerCard> {
  return new Map(players.map((player) => [player.playerId, player]));
}
