import { describe, expect, it } from "vitest";
import {
  MATCH_CONTRACT_VERSION,
  parseMatchSimulationRequest,
  teamSelectionSchema,
} from "../lib/game";
import { DEFAULT_HOME_SELECTION } from "../lib/game/sample-teams";

describe("match runtime validation", () => {
  it("accepts the current version and a valid team selection", () => {
    const request = parseMatchSimulationRequest({
      contractVersion: MATCH_CONTRACT_VERSION,
      seed: "valid-seed",
      logicalSeconds: 360,
      home: DEFAULT_HOME_SELECTION,
    });
    expect(request.seed).toBe("valid-seed");
  });

  it("rejects unknown request fields", () => {
    expect(() =>
      parseMatchSimulationRequest({ seed: "valid", unexpected: true }),
    ).toThrow();
  });

  it("rejects a duplicate player within one squad", () => {
    const invalid = {
      ...DEFAULT_HOME_SELECTION,
      starters: {
        ...DEFAULT_HOME_SELECTION.starters,
        ST: DEFAULT_HOME_SELECTION.starters.LW,
      },
    };
    expect(() => teamSelectionSchema.parse(invalid)).toThrow(
      /qu'une fois/,
    );
  });

  it("rejects missing or unknown formation slots", () => {
    const { RW: _removed, ...missingRw } = DEFAULT_HOME_SELECTION.starters;
    expect(() =>
      teamSelectionSchema.parse({
        ...DEFAULT_HOME_SELECTION,
        starters: missingRw,
      }),
    ).toThrow();

    expect(() =>
      teamSelectionSchema.parse({
        ...DEFAULT_HOME_SELECTION,
        starters: {
          ...DEFAULT_HOME_SELECTION.starters,
          EXTRA: 123,
        },
      }),
    ).toThrow();
  });
});
