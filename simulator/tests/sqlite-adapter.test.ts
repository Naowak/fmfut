import { describe, expect, it } from "vitest";
import { resolvePlayersDatabasePath } from "../lib/data/player-repository";
import {
  BetterSqliteAdapter,
  NodeSqliteAdapter,
  resolveSqliteDriver,
} from "../lib/data/sqlite-adapter";
import { assertReleaseMetadata } from "../scripts/package-data";

describe("SQLite adapters", () => {
  it("uses the stable driver by default", () => {
    expect(resolveSqliteDriver(undefined)).toBe("better-sqlite3");
    expect(() => resolveSqliteDriver("unknown")).toThrow(/SQLITE_DRIVER invalide/);
  });

  it("returns identical canonical counts with both drivers", () => {
    const databasePath = resolvePlayersDatabasePath();
    const stable = new BetterSqliteAdapter(databasePath);
    const fallback = new NodeSqliteAdapter(databasePath);
    try {
      const sql = "SELECT COUNT(*) AS count FROM players";
      expect(stable.prepare(sql).get()).toEqual(fallback.prepare(sql).get());
    } finally {
      stable.close();
      fallback.close();
    }
  });

  it("blocks redistribution until legal metadata is complete", () => {
    const base = {
      schema_version: "2",
      source_filename: "players.csv",
      source_sha256: "a".repeat(64),
      player_count: "1",
      license_status: "unverified",
    };
    expect(() => assertReleaseMetadata(base, false)).toThrow(/non redistribuable/);
    expect(() =>
      assertReleaseMetadata(
        { ...base, license_status: "verified-redistributable" },
        false,
      ),
    ).toThrow(/source_url/);
    expect(() =>
      assertReleaseMetadata(
        {
          ...base,
          license_status: "verified-redistributable",
          source_url: "https://example.test/source",
          license_name: "Example",
          license_url: "https://example.test/license",
        },
        false,
      ),
    ).not.toThrow();
  });
});
