import { MATCH_CONFIG, clamp } from "./config";
import type { LooseBall, TeamIndex } from "./runtime";
import type { Vec2 } from "./types";

export type Boundary =
  | "LEFT_GOAL_LINE"
  | "RIGHT_GOAL_LINE"
  | "TOP_TOUCHLINE"
  | "BOTTOM_TOUCHLINE";

export interface BoundaryCrossing {
  boundary: Boundary;
  point: Vec2;
  fraction: number;
}

export type BoundaryDecision =
  | { kind: "GOAL"; scoringTeamIndex: TeamIndex }
  | { kind: "THROW_IN"; teamIndex: TeamIndex; spot: Vec2 }
  | { kind: "CORNER"; teamIndex: TeamIndex; spot: Vec2 }
  | { kind: "GOAL_KICK"; teamIndex: TeamIndex; spot: Vec2 };

export function detectPitchBoundaryCrossing(
  from: Vec2,
  to: Vec2,
): BoundaryCrossing | null {
  const candidates: Array<{
    boundary: Boundary;
    point: Vec2;
    t: number;
  }> = [];

  const addX = (x: number, boundary: Boundary) => {
    const dx = to.x - from.x;
    if (Math.abs(dx) < 1e-9) return;
    const t = (x - from.x) / dx;
    if (t > 0 && t <= 1) {
      const y = from.y + (to.y - from.y) * t;
      if (y >= 0 && y <= 1) candidates.push({ boundary, point: { x, y }, t });
    }
  };
  const addY = (y: number, boundary: Boundary) => {
    const dy = to.y - from.y;
    if (Math.abs(dy) < 1e-9) return;
    const t = (y - from.y) / dy;
    if (t > 0 && t <= 1) {
      const x = from.x + (to.x - from.x) * t;
      if (x >= 0 && x <= 1) candidates.push({ boundary, point: { x, y }, t });
    }
  };

  if (to.x < 0) addX(0, "LEFT_GOAL_LINE");
  if (to.x > 1) addX(1, "RIGHT_GOAL_LINE");
  if (to.y < 0) addY(0, "TOP_TOUCHLINE");
  if (to.y > 1) addY(1, "BOTTOM_TOUCHLINE");
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.t - b.t);
  const { boundary, point, t } = candidates[0];
  return { boundary, point, fraction: t };
}

export function classifyBoundaryCrossing(
  crossing: BoundaryCrossing,
  ball: Pick<LooseBall, "lastTouchTeamIndex" | "sourceTeamIndex">,
  possessionTeamIndex: TeamIndex,
): BoundaryDecision {
  const lastTouchTeam =
    ball.lastTouchTeamIndex ?? ball.sourceTeamIndex ?? possessionTeamIndex;

  if (
    crossing.boundary === "TOP_TOUCHLINE" ||
    crossing.boundary === "BOTTOM_TOUCHLINE"
  ) {
    return {
      kind: "THROW_IN",
      teamIndex: otherTeamIndex(lastTouchTeam),
      spot: {
        x: clamp(crossing.point.x, 0.03, 0.97),
        y: crossing.boundary === "TOP_TOUCHLINE" ? 0 : 1,
      },
    };
  }

  const isLeft = crossing.boundary === "LEFT_GOAL_LINE";
  const defendingTeamIndex: TeamIndex = isLeft ? 0 : 1;
  const attackingTeamIndex = otherTeamIndex(defendingTeamIndex);
  const betweenPosts =
    crossing.point.y >= MATCH_CONFIG.ball.goalMouthMinY &&
    crossing.point.y <= MATCH_CONFIG.ball.goalMouthMaxY;
  if (betweenPosts) {
    return { kind: "GOAL", scoringTeamIndex: attackingTeamIndex };
  }
  if (lastTouchTeam === defendingTeamIndex) {
    return {
      kind: "CORNER",
      teamIndex: attackingTeamIndex,
      spot: { x: isLeft ? 0 : 1, y: crossing.point.y < 0.5 ? 0 : 1 },
    };
  }
  return {
    kind: "GOAL_KICK",
    teamIndex: defendingTeamIndex,
    spot: { x: isLeft ? 0.07 : 0.93, y: 0.5 },
  };
}

function otherTeamIndex(index: TeamIndex): TeamIndex {
  return index === 0 ? 1 : 0;
}
