import { describe, expect, it } from "vitest";
import { validateMatchStatIntegrity } from "../lib/analytics/calibration";
import { loadPlayersFromCsv } from "../lib/data/load-players";
import { simulateMatch } from "../lib/game";
import {
  DEFAULT_AWAY_SELECTION,
  DEFAULT_HOME_SELECTION,
} from "../lib/game/sample-teams";

const players = loadPlayersFromCsv();

function match(seed: string, logicalSeconds = 360) {
  return simulateMatch({
    home: DEFAULT_HOME_SELECTION,
    away: DEFAULT_AWAY_SELECTION,
    players,
    seed,
    logicalSeconds,
    recordReplay: false,
  });
}

describe("individual match statistics", () => {
  it("collects useful player data even when replay recording is disabled", () => {
    const output = match("individual-headless", 60);
    expect(output.replay.frames).toHaveLength(0);
    expect(output.playerStats.home).toHaveLength(16);
    expect(output.playerStats.away).toHaveLength(16);
    expect(
      output.playerStats.home.some(
        (player) => player.minutesPlayed > 0 && player.touches > 0,
      ),
    ).toBe(true);
  });

  it("keeps every individual counter coherent with team totals", () => {
    for (let index = 0; index < 24; index += 1) {
      expect(validateMatchStatIntegrity(match(`individual-integrity-${index}`, 90))).toEqual([]);
    }
  });

  it("tracks starters, substitutes, minutes, distance and energy", () => {
    const output = match("participation");
    for (const team of [output.playerStats.home, output.playerStats.away]) {
      expect(team.filter((player) => player.starter)).toHaveLength(11);
      expect(team.filter((player) => player.minutesPlayed > 0).length).toBeGreaterThanOrEqual(11);
      expect(team.every((player) => player.minutesPlayed >= 0)).toBe(true);
      expect(team.every((player) => player.distanceCovered >= 0)).toBe(true);
      expect(team.every((player) => player.energyEnd >= 0 && player.energyEnd <= 100)).toBe(true);
      expect(
        team
          .filter((player) => player.minutesPlayed === 0)
          .every((player) => player.touches === 0 && player.distanceCovered === 0),
      ).toBe(true);
    }
  });

  it("characterizes scorers and assists in the V0.9 reference match", () => {
    const output = match("audit-v09");
    const bellingham = output.playerStats.home.find(
      (player) => player.playerId === 252371,
    );
    const mbappe = output.playerStats.home.find(
      (player) => player.playerId === 231747,
    );
    const salah = output.playerStats.home.find(
      (player) => player.playerId === 209331,
    );
    const haaland = output.playerStats.away.find(
      (player) => player.playerId === 239085,
    );
    expect(bellingham).toMatchObject({ goals: 2, shots: 3, shotsOnTarget: 2 });
    expect(mbappe).toMatchObject({ goals: 1, shots: 8, shotsOnTarget: 7 });
    expect(salah).toMatchObject({ assists: 1 });
    expect(haaland).toMatchObject({ goals: 3, shots: 7, shotsOnTarget: 6 });
  });

  it("is deterministic down to every player's line", () => {
    expect(match("individual-determinism", 90).playerStats).toEqual(
      match("individual-determinism", 90).playerStats,
    );
  });

  it("restricts goalkeeper saves to players occupying the GK slot", () => {
    const output = match("goalkeeper-stat");
    for (const player of [...output.playerStats.home, ...output.playerStats.away]) {
      if (player.goalkeeperSaves > 0) expect(player.position).toBe("GK");
    }
  });
});
