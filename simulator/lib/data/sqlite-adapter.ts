import BetterSqlite3 from "better-sqlite3";
import { createRequire } from "node:module";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";

export type SqliteValue = string | number | bigint | Uint8Array | null;
export type SqliteDriver = "better-sqlite3" | "node:sqlite";

export interface SqliteStatement {
  all(...params: SqliteValue[]): Record<string, unknown>[];
  get(...params: SqliteValue[]): Record<string, unknown> | undefined;
}

export interface SqliteAdapter {
  readonly driverName: SqliteDriver;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

/**
 * Adaptateur isolant l'API `node:sqlite`. Un autre driver pourra implémenter
 * cette interface sans modifier le repository ni les routes HTTP.
 */
export class NodeSqliteAdapter implements SqliteAdapter {
  readonly driverName = "node:sqlite" as const;
  private readonly database: NodeDatabaseSync;

  constructor(databasePath: string) {
    const require = createRequire(import.meta.url);
    const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
    this.database = new DatabaseSync(databasePath, { readOnly: true });
  }

  prepare(sql: string): SqliteStatement {
    return this.database.prepare(sql) as SqliteStatement;
  }

  close(): void {
    this.database.close();
  }
}

/** Driver natif stable utilisé en production et livré avec ses binaires. */
export class BetterSqliteAdapter implements SqliteAdapter {
  readonly driverName = "better-sqlite3" as const;
  private readonly database: BetterSqlite3.Database;

  constructor(databasePath: string) {
    this.database = new BetterSqlite3(databasePath, {
      readonly: true,
      fileMustExist: true,
    });
  }

  prepare(sql: string): SqliteStatement {
    return this.database.prepare(sql) as unknown as SqliteStatement;
  }

  close(): void {
    this.database.close();
  }
}

export function createSqliteAdapter(
  databasePath: string,
  driver = resolveSqliteDriver(),
): SqliteAdapter {
  return driver === "node:sqlite"
    ? new NodeSqliteAdapter(databasePath)
    : new BetterSqliteAdapter(databasePath);
}

export function resolveSqliteDriver(
  configured = process.env.SQLITE_DRIVER,
): SqliteDriver {
  if (!configured || configured === "better-sqlite3") return "better-sqlite3";
  if (configured === "node:sqlite") return "node:sqlite";
  throw new Error(
    `SQLITE_DRIVER invalide: ${configured}. Valeurs acceptées: better-sqlite3, node:sqlite.`,
  );
}
