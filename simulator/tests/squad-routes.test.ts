import { describe, expect, it } from "vitest";
import { GET as getBenchmarks } from "../app/api/players/benchmarks/route";
import { GET as getBootstrap } from "../app/api/squad/bootstrap/route";
import { GET as getOpponents } from "../app/api/squad/opponents/route";
import { GET as getRandomSquad } from "../app/api/squad/random/route";
import { POST as postPreview } from "../app/api/squad/preview/route";
import { positionCompatibility } from "../lib/game/compatibility";
import { FORMATION_433 } from "../lib/game/formations";
import { DEFAULT_HOME_SELECTION } from "../lib/game/sample-teams";
import { nationalityFlag } from "../lib/squad/opponents";

describe("Squad Builder APIs", () => {
  it("bootstraps a complete editable demo squad", async () => {
    const response = await getBootstrap();
    const payload = (await response.json()) as {
      selection: typeof DEFAULT_HOME_SELECTION;
      players: Array<{ playerId: number }>;
    };

    expect(response.status).toBe(200);
    expect(payload.selection).toEqual(DEFAULT_HOME_SELECTION);
    expect(payload.players).toHaveLength(16);
    expect(new Set(payload.players.map((player) => player.playerId)).size).toBe(16);
  });

  it("computes per-position benchmarks from the complete dataset", async () => {
    const response = await getBenchmarks();
    const payload = (await response.json()) as Array<{
      position: string;
      sampleSize: number;
      stats: { passing: { q10: number; q50: number; q90: number } };
    }>;
    const strikers = payload.find((benchmark) => benchmark.position === "ST")!;

    expect(response.status).toBe(200);
    expect(payload).toHaveLength(12);
    expect(strikers.sampleSize).toBeGreaterThan(100);
    expect(strikers.stats.passing.q10).toBeLessThanOrEqual(strikers.stats.passing.q50);
    expect(strikers.stats.passing.q50).toBeLessThanOrEqual(strikers.stats.passing.q90);
  });

  it("provides valid precomposed international opponents", async () => {
    const response = await getOpponents();
    const payload = (await response.json()) as Array<{
      id: string;
      nation: string;
      flag: string;
      syntheticPlayers: number;
      selection: typeof DEFAULT_HOME_SELECTION;
      players: Array<{ playerId: number; nationalityName: string; shortName: string }>;
    }>;

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("X-Team-Catalog-Size")).toBe(String(payload.length));
    expect(payload).toHaveLength(35);
    expect(payload.map((team) => team.id)).toEqual(
      expect.arrayContaining(["canada-2026", "france-2026", "turkiye-2026"]),
    );
    for (const opponent of payload) {
      const ids = [
        ...Object.values(opponent.selection.starters),
        ...opponent.selection.bench,
      ];
      expect(Object.keys(opponent.selection.starters)).toHaveLength(11);
      expect(opponent.selection.bench).toHaveLength(7);
      expect(new Set(ids).size).toBe(18);
      expect(opponent.players).toHaveLength(18);
      expect(opponent.flag.length).toBeGreaterThan(0);
      expect(opponent.syntheticPlayers).toBe(0);
      expect(opponent.players.some((player) => player.shortName.startsWith("Réserve"))).toBe(false);
      expect(
        opponent.players.every(
          (player) => player.nationalityName === opponent.nation,
        ),
      ).toBe(true);
    }
  });

  it("uses World Cup flags and a neutral flag outside the selected nations", () => {
    expect(nationalityFlag("France")).toBe("🇫🇷");
    expect(nationalityFlag("Italy")).toBe("🏳️");
  });

  it("generates a deterministic random squad with valid positions", async () => {
    const request = () => new Request("http://localhost/api/squad/random?seed=ui-v012");
    const first = await getRandomSquad(request());
    const second = await getRandomSquad(request());
    const payload = (await first.json()) as {
      selection: typeof DEFAULT_HOME_SELECTION;
      players: Array<ReturnType<typeof import("../lib/data/load-players").loadPlayers>[number]>;
    };
    const repeated = (await second.json()) as typeof payload;
    const byId = new Map(payload.players.map((player) => [player.playerId, player]));

    expect(first.status).toBe(200);
    expect(payload.selection).toEqual(repeated.selection);
    expect(Object.keys(payload.selection.starters)).toHaveLength(11);
    expect(payload.selection.bench).toHaveLength(7);
    expect(payload.players).toHaveLength(18);
    expect(new Set(payload.players.map((player) => player.playerId)).size).toBe(18);
    for (const slot of FORMATION_433) {
      const player = byId.get(payload.selection.starters[slot.id])!;
      expect(positionCompatibility(player, slot.position)).toBeGreaterThanOrEqual(0.75);
    }
  });

  it("previews a valid squad and reuses the deterministic cache", async () => {
    const body = JSON.stringify({
      team: DEFAULT_HOME_SELECTION,
      runs: 10,
      seedPrefix: "seed-choisie-par-joueur",
    });
    const request = () => new Request("http://localhost/api/squad/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const first = await postPreview(request());
    const payload = (await first.json()) as {
      runs: number;
      outcomes: { homeWinRate: number; drawRate: number; awayWinRate: number };
      home: { goals: number; possession: number; passCompletion: number };
      distributions: { homeGoals: { mean: number; p05: number; median: number; p95: number } };
      players: { home: Array<Record<string, unknown>>; away: Array<Record<string, unknown>> };
    };
    const second = await postPreview(request());

    expect(first.status).toBe(200);
    expect(first.headers.get("X-Squad-Cache")).toBe("MISS");
    expect(second.headers.get("X-Squad-Cache")).toBe("HIT");
    expect(payload.runs).toBe(10);
    expect(
      payload.outcomes.homeWinRate +
      payload.outcomes.drawRate +
      payload.outcomes.awayWinRate,
    ).toBeCloseTo(100, 5);
    expect(payload.home.goals).toBeGreaterThanOrEqual(0);
    expect(payload.home.possession).toBeGreaterThan(0);
    expect(payload.home.passCompletion).toBeGreaterThan(0);
    expect(payload.distributions.homeGoals.p05).toBeLessThanOrEqual(
      payload.distributions.homeGoals.p95,
    );
    expect(payload.players.home).toHaveLength(16);
    expect(payload.players.away).toHaveLength(18);
    expect(payload.players.home[0]).toEqual(expect.objectContaining({
      playerName: expect.any(String),
      minutesPlayed: expect.any(Number),
      goals: expect.any(Number),
      assists: expect.any(Number),
      touches: expect.any(Number),
      passesAttempted: expect.any(Number),
      tackles: expect.any(Number),
      interceptions: expect.any(Number),
      energyEnd: expect.any(Number),
    }));
  });

  it("rejects invalid or incomplete preview contracts", async () => {
    const response = await postPreview(new Request("http://localhost/api/squad/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ team: { name: "Incomplet" }, runs: 5 }),
    }));

    expect(response.status).toBe(400);
  });
});
