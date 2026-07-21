import { describe, expect, it } from "vitest";
import {
  distanceBetween,
  lineYAtX,
  moveTowards,
  normalizeVector,
  pointToSegmentDistance,
  rotateVector,
} from "../lib/game/geometry";

describe("geometry helpers", () => {
  it("computes distances and bounded movement", () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 0.3, y: 0.4 })).toBeCloseTo(
      0.5,
    );
    const moved = moveTowards(
      { x: 0.1, y: 0.1 },
      { x: 0.4, y: 0.5 },
      0.25,
    );
    expect(moved.x).toBeCloseTo(0.25);
    expect(moved.y).toBeCloseTo(0.3);
  });

  it("normalizes and rotates vectors", () => {
    expect(normalizeVector({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
    const rotated = rotateVector({ x: 1, y: 0 }, Math.PI / 2);
    expect(rotated.x).toBeCloseTo(0);
    expect(rotated.y).toBeCloseTo(1);
  });

  it("projects onto lines and segments", () => {
    expect(
      pointToSegmentDistance(
        { x: 0.5, y: 0.5 },
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ),
    ).toBeCloseTo(0.5);
    expect(lineYAtX({ x: 0, y: 0.2 }, { x: 1, y: 0.8 }, 0.5)).toBeCloseTo(
      0.5,
    );
  });
});
