import { describe, expect, it } from "vitest";
import { GET as getBenchmarks } from "../app/api/players/benchmarks/route";
import { GET as getBootstrap } from "../app/api/squad/bootstrap/route";
import { POST as postPreview } from "../app/api/squad/preview/route";
import { DEFAULT_HOME_SELECTION } from "../lib/game/sample-teams";

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

  it("previews a valid squad and reuses the deterministic cache", async () => {
    const body = JSON.stringify({ team: DEFAULT_HOME_SELECTION, runs: 10 });
    const request = () => new Request("http://localhost/api/squad/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const first = await postPreview(request());
    const payload = (await first.json()) as {
      runs: number;
      outcomes: { homeWinRate: number; drawRate: number; awayWinRate: number };
      expected: { homeGoals: number; homePossession: number };
      contributors: { attacking: unknown[]; defensive: unknown[] };
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
    expect(payload.expected.homeGoals).toBeGreaterThanOrEqual(0);
    expect(payload.expected.homePossession).toBeGreaterThan(0);
    expect(payload.contributors.attacking).toHaveLength(3);
    expect(payload.contributors.defensive).toHaveLength(3);
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
