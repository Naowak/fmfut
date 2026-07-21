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
