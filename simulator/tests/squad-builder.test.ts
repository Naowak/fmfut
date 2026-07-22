import { describe, expect, it } from "vitest";
import { loadPlayers } from "../lib/data/load-players";
import { DEFAULT_HOME_SELECTION } from "../lib/game/sample-teams";
import {
  addPlayerToBench,
  allDraftPlayers,
  assignPlayerToSlot,
  createEmptyDraft,
  createSnapshot,
  diagnoseSquad,
  draftFromSelection,
  parseSnapshot,
  playerInDraft,
  roleFitScore,
  toTeamSelection,
} from "../lib/squad/builder";

const players = loadPlayers();
const demoPlayers = players.filter((player) =>
  [
    ...Object.values(DEFAULT_HOME_SELECTION.starters),
    ...DEFAULT_HOME_SELECTION.bench,
  ].includes(player.playerId),
);

describe("Squad Builder domain", () => {
  it("hydrates the demo XI and converts it back to an engine selection", () => {
    const draft = draftFromSelection(DEFAULT_HOME_SELECTION, demoPlayers);
    const selection = toTeamSelection(draft);

    expect(Object.keys(draft.starters)).toHaveLength(11);
    expect(draft.bench).toHaveLength(5);
    expect(selection).toEqual(DEFAULT_HOME_SELECTION);
  });

  it("moves a player between starter and bench without duplicating it", () => {
    const player = demoPlayers.find(
      (candidate) => candidate.playerId === DEFAULT_HOME_SELECTION.starters.ST,
    )!;
    let draft = assignPlayerToSlot(createEmptyDraft(), "ST", player);
    draft = addPlayerToBench(draft, player);

    expect(draft.starters.ST).toBeUndefined();
    expect(draft.bench).toEqual([player]);
    expect(allDraftPlayers(draft)).toHaveLength(1);
    expect(playerInDraft(draft, player.playerId)).toBe(true);
  });

  it("does not exceed the configured bench limit", () => {
    let draft = createEmptyDraft();
    for (const player of players.slice(0, 8)) {
      draft = addPlayerToBench(draft, player, 7);
    }

    expect(draft.bench).toHaveLength(7);
  });

  it("keeps a starter in place when the bench is already full", () => {
    const starter = players[20];
    let draft = assignPlayerToSlot(createEmptyDraft(), "ST", starter);
    for (const player of players.slice(0, 7)) {
      draft = addPlayerToBench(draft, player, 7);
    }

    const unchanged = addPlayerToBench(draft, starter, 7);
    expect(unchanged.starters.ST).toEqual(starter);
    expect(unchanged.bench).toHaveLength(7);
  });

  it("blocks incomplete lineups and diagnoses a complete lineup", () => {
    expect(() => toTeamSelection(createEmptyDraft())).toThrow("Onze incomplet");

    const draft = draftFromSelection(DEFAULT_HOME_SELECTION, demoPlayers);
    const diagnostics = diagnoseSquad(draft);
    expect(diagnostics.complete).toBe(true);
    expect(diagnostics.filledSlots).toBe(11);
    expect(diagnostics.averageCompatibility).toBeGreaterThan(70);
    expect(diagnostics.axes).toHaveLength(6);
    expect(diagnostics.slots).toHaveLength(11);
  });

  it("round-trips an exported snapshot and rejects duplicate players", () => {
    const draft = draftFromSelection(DEFAULT_HOME_SELECTION, demoPlayers);
    const snapshot = createSnapshot(draft);
    expect(parseSnapshot(JSON.stringify(snapshot)).draft).toEqual(draft);

    snapshot.draft.bench.push(snapshot.draft.starters.ST!);
    expect(() => parseSnapshot(JSON.stringify(snapshot))).toThrow("en double");
  });

  it("rejects unsupported roles and tactics in imported files", () => {
    const snapshot = createSnapshot(
      draftFromSelection(DEFAULT_HOME_SELECTION, demoPlayers),
    );
    const invalid = JSON.parse(JSON.stringify(snapshot)) as typeof snapshot;
    invalid.draft.roles.ST = "GOAL_POACHER" as never;

    expect(() => parseSnapshot(JSON.stringify(invalid))).toThrow(
      "Format de composition non reconnu",
    );
  });

  it("scores role fit from the role-specific player attributes", () => {
    const mbappe = demoPlayers.find((player) => player.playerId === 231747)!;
    const expected = Math.round(
      (mbappe.stats.shooting + mbappe.stats.speed + mbappe.stats.technique) / 3,
    );
    expect(roleFitScore(mbappe, "OFFENSIVE")).toBe(expected);
  });
});
