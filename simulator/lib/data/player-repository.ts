import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { PlayerCard, Position } from "@/lib/game/types";

export interface PlayerSearchParams {
  query?: string;
  position?: Position;
  nation?: string;
  minOverall?: number;
  maxOverall?: number;
  page: number;
  pageSize: number;
}

export interface PlayerSearchResult {
  items: PlayerCard[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PlayerRepository {
  all(): PlayerCard[];
  search(params: PlayerSearchParams): PlayerSearchResult;
  close(): void;
}

type PlayerRow = {
  player_id: number;
  short_name: string;
  long_name: string | null;
  nationality_name: string;
  primary_position: Position;
  alternative_positions_json: string;
  overall: number;
  potential: number;
  speed: number;
  shooting: number;
  passing: number;
  physical: number;
  technique: number;
  intelligence: number;
};

const PLAYER_COLUMNS = `
  player_id,
  short_name,
  long_name,
  nationality_name,
  primary_position,
  alternative_positions_json,
  overall,
  potential,
  speed,
  shooting,
  passing,
  physical,
  technique,
  intelligence
`;

export class SqlitePlayerRepository implements PlayerRepository {
  private readonly database: DatabaseSync;

  constructor(public readonly databasePath: string) {
    this.database = new DatabaseSync(databasePath, { readOnly: true });
  }

  all(): PlayerCard[] {
    const rows = this.database
      .prepare(
        `SELECT ${PLAYER_COLUMNS}
         FROM players
         ORDER BY overall DESC, short_name ASC`,
      )
      .all() as PlayerRow[];
    return rows.map(toPlayerCard);
  }

  search(params: PlayerSearchParams): PlayerSearchResult {
    const conditions: string[] = [];
    const values: Array<string | number> = [];

    if (params.query) {
      conditions.push("(short_name LIKE ? OR long_name LIKE ?)");
      const pattern = `%${params.query.trim()}%`;
      values.push(pattern, pattern);
    }
    if (params.position) {
      conditions.push(`EXISTS (
        SELECT 1 FROM player_positions pp
        WHERE pp.player_id = players.player_id AND pp.position = ?
      )`);
      values.push(params.position);
    }
    if (params.nation) {
      conditions.push("nationality_name LIKE ?");
      values.push(`%${params.nation.trim()}%`);
    }
    if (params.minOverall !== undefined) {
      conditions.push("overall >= ?");
      values.push(params.minOverall);
    }
    if (params.maxOverall !== undefined) {
      conditions.push("overall <= ?");
      values.push(params.maxOverall);
    }

    const where = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";
    const countRow = this.database
      .prepare(`SELECT COUNT(*) AS total FROM players ${where}`)
      .get(...values) as { total: number };
    const offset = (params.page - 1) * params.pageSize;
    const rows = this.database
      .prepare(
        `SELECT ${PLAYER_COLUMNS}
         FROM players
         ${where}
         ORDER BY overall DESC, short_name ASC
         LIMIT ? OFFSET ?`,
      )
      .all(...values, params.pageSize, offset) as PlayerRow[];

    return {
      items: rows.map(toPlayerCard),
      page: params.page,
      pageSize: params.pageSize,
      total: countRow.total,
      totalPages: Math.ceil(countRow.total / params.pageSize),
    };
  }

  close(): void {
    this.database.close();
  }
}

let cachedRepository: SqlitePlayerRepository | null = null;

export function getPlayerRepository(): SqlitePlayerRepository {
  const databasePath = resolvePlayersDatabasePath();
  if (
    cachedRepository === null ||
    cachedRepository.databasePath !== databasePath
  ) {
    cachedRepository?.close();
    cachedRepository = new SqlitePlayerRepository(databasePath);
  }
  return cachedRepository;
}

export function resolvePlayersDatabasePath(): string {
  const configuredPath = process.env.PLAYERS_DB_PATH;
  const candidates = configuredPath
    ? [path.resolve(configuredPath)]
    : [
        path.resolve(process.cwd(), "..", "dataset", "players.db"),
        path.resolve(process.cwd(), "dataset", "players.db"),
      ];
  const databasePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!databasePath) {
    throw new Error(
      `Base joueurs SQLite introuvable. Chemins testés: ${candidates.join(", ")}. ` +
        "Configure PLAYERS_DB_PATH ou reconstruis dataset/players.db.",
    );
  }
  return databasePath;
}

export function playersDatabaseExists(): boolean {
  try {
    resolvePlayersDatabasePath();
    return true;
  } catch {
    return false;
  }
}

function toPlayerCard(row: PlayerRow): PlayerCard {
  return {
    playerId: row.player_id,
    shortName: row.short_name,
    longName: row.long_name ?? row.short_name,
    nationalityName: row.nationality_name,
    primaryPosition: row.primary_position,
    alternativePositions: parsePositions(row.alternative_positions_json),
    overall: row.overall,
    potential: row.potential,
    stats: {
      speed: row.speed,
      shooting: row.shooting,
      passing: row.passing,
      physical: row.physical,
      technique: row.technique,
      intelligence: row.intelligence,
    },
  };
}

function parsePositions(raw: string): Position[] {
  const value = JSON.parse(raw) as unknown;
  if (!Array.isArray(value)) return [];
  return value.filter((position): position is Position =>
    typeof position === "string",
  );
}
