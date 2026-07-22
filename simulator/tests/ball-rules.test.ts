import { describe, expect, it } from "vitest";
import {
  advanceBallPosition,
  decayBallVelocity,
  predictLooseBallStop,
} from "../lib/game/ball-physics";
import {
  classifyBoundaryCrossing,
  detectPitchBoundaryCrossing,
} from "../lib/game/pitch-rules";
import {
  isInsideOwnPenaltyArea,
  penaltySpotForAttack,
  restartDefaultMessage,
} from "../lib/game/restart-helpers";

describe("extracted ball physics and pitch rules", () => {
  it("advances, slows and predicts a loose ball", () => {
    expect(advanceBallPosition({ x: 0.2, y: 0.4 }, { x: 0.3, y: 0 }, 0.1))
      .toEqual({ x: 0.23, y: 0.4 });
    expect(decayBallVelocity({ x: 0.3, y: 0 }, 0.1, 0.2).x)
      .toBeCloseTo(0.28);
    expect(
      predictLooseBallStop({
        mode: "LOOSE",
        pos: { x: 0.2, y: 0.5 },
        age: 0,
        velocity: { x: 0.2, y: 0 },
        deceleration: 0.1,
      }).x,
    ).toBeCloseTo(0.4);
  });

  it("detects the earliest physical boundary crossing", () => {
    expect(
      detectPitchBoundaryCrossing(
        { x: 0.98, y: 0.5 },
        { x: 1.08, y: 0.6 },
      ),
    ).toMatchObject({
      boundary: "RIGHT_GOAL_LINE",
      point: { x: 1, y: 0.52 },
      fraction: 0.2,
    });
  });

  it("classifies goals, corners, goal kicks and throw-ins", () => {
    const goalLine = { boundary: "RIGHT_GOAL_LINE" as const, point: { x: 1, y: 0.5 }, fraction: 1 };
    expect(classifyBoundaryCrossing(goalLine, { lastTouchTeamIndex: 0 }, 0))
      .toEqual({ kind: "GOAL", scoringTeamIndex: 0 });
    expect(
      classifyBoundaryCrossing(
        { ...goalLine, point: { x: 1, y: 0.2 } },
        { lastTouchTeamIndex: 1 },
        0,
      ).kind,
    ).toBe("CORNER");
    expect(
      classifyBoundaryCrossing(
        { ...goalLine, point: { x: 1, y: 0.2 } },
        { lastTouchTeamIndex: 0 },
        0,
      ).kind,
    ).toBe("GOAL_KICK");
    expect(
      classifyBoundaryCrossing(
        { boundary: "TOP_TOUCHLINE", point: { x: 0.4, y: 0 }, fraction: 1 },
        { lastTouchTeamIndex: 0 },
        0,
      ),
    ).toMatchObject({ kind: "THROW_IN", teamIndex: 1 });
  });

  it("keeps restart helpers independent from engine state", () => {
    expect(restartDefaultMessage("CORNER", "Paris AI")).toBe(
      "Corner pour Paris AI.",
    );
    expect(isInsideOwnPenaltyArea({ x: 0.08, y: 0.5 }, "HOME")).toBe(true);
    expect(penaltySpotForAttack("AWAY")).toEqual({ x: 0.11, y: 0.5 });
  });
});
