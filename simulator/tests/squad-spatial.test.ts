import { describe, expect, it } from "vitest";
import { loadPlayers } from "../lib/data/load-players";
import { DEFAULT_AWAY_SELECTION, DEFAULT_HOME_SELECTION } from "../lib/game/sample-teams";
import { runSquadMonteCarlo } from "../lib/squad/monte-carlo";

describe("Squad Simulator spatial analysis", () => {
  it("aggregates a team heatmap and a heatmap for every active player", () => {
    const result = runSquadMonteCarlo({
      players: loadPlayers(),
      team: DEFAULT_HOME_SELECTION,
      opponent: DEFAULT_AWAY_SELECTION,
      runs: 2,
      seedPrefix: "spatial-v013",
    });

    expect(result.spatial).not.toBeNull();
    expect(result.spatial!.team.allPlayersHeatmap).toHaveLength(
      result.spatial!.columns * result.spatial!.rows,
    );
    expect(Object.keys(result.spatial!.team.playerHeatmaps).length).toBeGreaterThanOrEqual(11);
    expect(result.spatial!.team.allPlayersHeatmap.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(0);
    expect(result.spatial!.team.heatmapSlices.FIRST_HALF.allPlayersHeatmap.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(0);
    expect(result.spatial!.team.heatmapSlices.SECOND_HALF.allPlayersHeatmap.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(0);
    expect(result.spatial!.team.heatmapSlices.IN_POSSESSION.allPlayersHeatmap.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(0);
    expect(result.spatial!.team.heatmapSlices.OUT_OF_POSSESSION.allPlayersHeatmap.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(0);
  });
});
