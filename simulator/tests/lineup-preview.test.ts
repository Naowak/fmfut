import { describe, expect, it } from "vitest";
import { formationPreviewPlayers, type LineupPreviewTeam } from "../components/MatchLineupPreview";
import { loadPlayersFromCsv } from "../lib/data/load-players";
import { DEFAULT_HOME_SELECTION } from "../lib/game/sample-teams";

const players = loadPlayersFromCsv();
const team: LineupPreviewTeam = {
  name: DEFAULT_HOME_SELECTION.name,
  color: "#1d4ed8",
  selection: DEFAULT_HOME_SELECTION,
  players,
};

describe("match lineup preview", () => {
  it("places all eleven starters inside the pitch", () => {
    for (const side of ["FIRST", "SECOND"] as const) {
      const preview = formationPreviewPlayers(team, side);
      expect(preview).toHaveLength(11);
      for (const player of preview) {
        expect(player.left).toBeGreaterThan(0);
        expect(player.left).toBeLessThan(100);
        expect(player.top).toBeGreaterThan(0);
        expect(player.top).toBeLessThan(100);
        expect(player.name).not.toBe("—");
      }
    }
  });

  it("mirrors the two formations around the halfway line", () => {
    const first = formationPreviewPlayers(team, "FIRST");
    const second = formationPreviewPlayers(team, "SECOND");
    for (let index = 0; index < first.length; index += 1) {
      expect(first[index].left).toBe(second[index].left);
      expect(first[index].top + second[index].top).toBeCloseTo(100, 8);
    }
  });
});
