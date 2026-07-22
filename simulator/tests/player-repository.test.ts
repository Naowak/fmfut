import { afterAll, describe, expect, it } from "vitest";
import {
  resolvePlayersDatabasePath,
  SqlitePlayerRepository,
} from "../lib/data/player-repository";

const repository = new SqlitePlayerRepository(resolvePlayersDatabasePath());

afterAll(() => repository.close());

describe("SQLite player repository", () => {
  it("loads the complete canonical database", () => {
    const players = repository.all();
    expect(players).toHaveLength(18_405);
    expect(players.every((player) => player.playerId > 0)).toBe(true);
  });

  it("searches by name and preserves the six stats", () => {
    const result = repository.search({
      query: "Mbappe",
      page: 1,
      pageSize: 20,
    });
    expect(result.total).toBeGreaterThan(0);
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerId: 231747,
          shortName: "K. Mbappé",
          stats: expect.objectContaining({ speed: 97, shooting: 90 }),
        }),
      ]),
    );
  });

  it("filters natural positions, nationality and overall", () => {
    const result = repository.search({
      position: "ST",
      nation: "France",
      minOverall: 80,
      page: 1,
      pageSize: 100,
    });
    expect(result.items.length).toBeGreaterThan(0);
    expect(
      result.items.every(
        (player) =>
          player.nationalityName === "France" &&
          player.overall >= 80 &&
          [player.primaryPosition, ...player.alternativePositions].includes("ST"),
      ),
    ).toBe(true);
  });

  it("returns stable non-overlapping pages", () => {
    const first = repository.search({ page: 1, pageSize: 5 });
    const second = repository.search({ page: 2, pageSize: 5 });
    expect(first.total).toBe(18_405);
    expect(first.totalPages).toBe(3_681);
    expect(first.items.map((player) => player.playerId)).not.toEqual(
      second.items.map((player) => player.playerId),
    );
  });

  it("caches repeated searches and exposes provenance metadata", () => {
    repository.clearCache();
    const search = { query: "Salah", page: 1, pageSize: 10 };
    repository.search(search);
    repository.search(search);
    expect(repository.cacheStats()).toMatchObject({ hits: 1, misses: 1 });
    expect(repository.metadata()).toMatchObject({
      schema_version: "2",
      player_count: "18405",
      license_status: "unverified",
    });
  });
});
