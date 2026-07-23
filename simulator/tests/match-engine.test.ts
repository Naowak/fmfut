import { describe, expect, it } from "vitest";
import { loadPlayersFromCsv } from "../lib/data/load-players";
import {
  MATCH_CONTRACT_VERSION,
  simulateMatch,
} from "../lib/game";
import {
  DEFAULT_AWAY_SELECTION,
  DEFAULT_HOME_SELECTION,
} from "../lib/game/sample-teams";

const players = loadPlayersFromCsv();

function simulate(seed: string, recordReplay = false) {
  return simulateMatch({
    home: DEFAULT_HOME_SELECTION,
    away: DEFAULT_AWAY_SELECTION,
    players,
    seed,
    logicalSeconds: 60,
    recordReplay,
  });
}

function expectFiniteTree(value: unknown): void {
  if (typeof value === "number") {
    expect(Number.isFinite(value)).toBe(true);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(expectFiniteTree);
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach(expectFiniteTree);
  }
}

describe("match engine public contract", () => {
  it("allows a team to play against itself", () => {
    const output = simulateMatch({
      home: DEFAULT_HOME_SELECTION,
      away: DEFAULT_HOME_SELECTION,
      players,
      seed: "mirror-match",
      logicalSeconds: 60,
      recordReplay: true,
    });

    expect(output.result.homeName).toBe(DEFAULT_HOME_SELECTION.name);
    expect(output.result.awayName).toBe(DEFAULT_HOME_SELECTION.name);
    expect(output.playerStats.home).toHaveLength(16);
    expect(output.playerStats.away).toHaveLength(16);
    expectFiniteTree(output);
  });

  it("applies block height and width to the simulated spatial structure", () => {
    const averageShape = (blockHeight: "LOW" | "HIGH", width: "NARROW" | "WIDE") => {
      const samples = Array.from({ length: 6 }, (_, index) => simulateMatch({
        home: {
          ...DEFAULT_HOME_SELECTION,
          tactics: {
            blockHeight,
            width,
            buildUp: DEFAULT_HOME_SELECTION.tactics?.buildUp ?? "BALANCED",
            pressing: DEFAULT_HOME_SELECTION.tactics?.pressing ?? "BALANCED",
          },
        },
        away: DEFAULT_AWAY_SELECTION,
        players,
        seed: `block-shape-${index}`,
        logicalSeconds: 90,
        recordSpatialAnalytics: true,
      }).analytics!.home);
      return {
        center: samples.reduce((sum, item) => sum + item.averageBlockCenterProgress, 0) / samples.length,
        width: samples.reduce((sum, item) => sum + item.averageBlockWidth, 0) / samples.length,
      };
    };
    const lowNarrow = averageShape("LOW", "NARROW");
    const highNarrow = averageShape("HIGH", "NARROW");
    const lowWide = averageShape("LOW", "WIDE");

    expect(highNarrow.center).toBeGreaterThan(lowNarrow.center);
    expect(lowWide.width).toBeGreaterThan(lowNarrow.width);
  });

  it("supports alternative formations and tactical instructions", () => {
    const output = simulateMatch({
      home: { ...DEFAULT_HOME_SELECTION, formationId: "4-2-3-1", tactics: { blockHeight: "HIGH", buildUp: "SHORT", pressing: "AGGRESSIVE", width: "NARROW" } },
      away: { ...DEFAULT_AWAY_SELECTION, formationId: "4-1-4-1", tactics: { blockHeight: "LOW", buildUp: "DIRECT", pressing: "CAUTIOUS", width: "WIDE" } },
      players,
      seed: "formations-v014",
      logicalSeconds: 90,
      recordReplay: false,
    });
    expect(output.result.homeScore).toBeGreaterThanOrEqual(0);
    expect(output.playerStats.home.find((player) => player.runtimeId.endsWith(":RCM"))?.position).toBe("CAM");
    expect(output.playerStats.away.find((player) => player.runtimeId.endsWith(":LW"))?.position).toBe("LM");
  });
  it("preserves the V0.9 characterization match", () => {
    const output = simulateMatch({
      home: DEFAULT_HOME_SELECTION,
      away: DEFAULT_AWAY_SELECTION,
      players,
      seed: "audit-v09",
      logicalSeconds: 360,
      recordReplay: true,
    });

    expect(output.result).toEqual({
      homeScore: 3,
      awayScore: 3,
      homeName: "Paris AI",
      awayName: "World XI",
    });
    expect(output.replay.frames).toHaveLength(1863);
    expect(output.replay.events).toHaveLength(318);
    expect(output.stats.home).toMatchObject({
      shots: 12,
      shotsOnTarget: 10,
      passesAttempted: 60,
      passesCompleted: 43,
      substitutions: 3,
      possession: 53.7,
    });
    expect(output.stats.away).toMatchObject({
      shots: 10,
      shotsOnTarget: 8,
      passesAttempted: 54,
      passesCompleted: 36,
      substitutions: 3,
      possession: 46.3,
    });
  });

  it("reproduces exactly the same output with the same seed", () => {
    expect(simulate("determinism-1")).toEqual(simulate("determinism-1"));
  });

  it("produces a different event stream with another seed", () => {
    expect(simulate("seed-a", true).replay.events).not.toEqual(
      simulate("seed-b", true).replay.events,
    );
  });

  it("publishes a versioned output without NaN or Infinity", () => {
    const output = simulate("finite-tree");
    expect(output.contractVersion).toBe(MATCH_CONTRACT_VERSION);
    expect(output.replay.engineVersion).toBe("0.9.0");
    expectFiniteTree(output);
  });

  it("keeps active replay players inside the pitch", () => {
    const output = simulate("pitch-bounds", true);
    expect(output.replay.frames.length).toBeGreaterThan(0);
    for (const frame of output.replay.frames) {
      for (const player of frame.players.filter((candidate) => candidate.active)) {
        expect(player.x).toBeGreaterThanOrEqual(0);
        expect(player.x).toBeLessThanOrEqual(1);
        expect(player.y).toBeGreaterThanOrEqual(0);
        expect(player.y).toBeLessThanOrEqual(1);
      }
    }
  });

  it("records deterministic spatial analytics through the extracted module", () => {
    const input = {
      home: DEFAULT_HOME_SELECTION,
      away: DEFAULT_AWAY_SELECTION,
      players,
      seed: "spatial-extraction",
      logicalSeconds: 60,
      recordReplay: false,
      recordSpatialAnalytics: true,
    } as const;
    const first = simulateMatch(input).analytics;
    const second = simulateMatch(input).analytics;
    expect(first).toEqual(second);
    expect(first?.home.samples).toBeGreaterThan(0);
    expect(first?.home.allPlayersHeatmap).toHaveLength(96);
    expect(first?.away.allPlayersHeatmap).toHaveLength(96);
  });

  it("keeps score, goal events and substitution limits coherent", () => {
    const output = simulate("score-coherence");
    const goals = output.replay.events.filter((event) => event.type === "GOAL");
    expect(goals).toHaveLength(
      output.result.homeScore + output.result.awayScore,
    );
    expect(output.stats.home.substitutions).toBeLessThanOrEqual(5);
    expect(output.stats.away.substitutions).toBeLessThanOrEqual(5);
  });
});
