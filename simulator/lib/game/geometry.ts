import { clamp } from "./config";
import type { Vec2 } from "./types";

export function distanceBetween(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function moveTowards(
  current: Vec2,
  target: Vec2,
  maxDistance: number,
): Vec2 {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const distance = Math.hypot(dx, dy);

  if (distance === 0 || distance <= maxDistance) {
    return { ...target };
  }

  const ratio = maxDistance / distance;
  return {
    x: clamp(current.x + dx * ratio, 0.005, 0.995),
    y: clamp(current.y + dy * ratio, 0.005, 0.995),
  };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function vectorLength(vector: Vec2): number {
  return Math.hypot(vector.x, vector.y);
}

export function normalizeVector(vector: Vec2): Vec2 {
  const length = vectorLength(vector);
  if (length <= 1e-9) {
    return { x: 0, y: 0 };
  }
  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

export function rotateVector(vector: Vec2, angle: number): Vec2 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
}

export function lineYAtX(from: Vec2, to: Vec2, x: number): number {
  const dx = to.x - from.x;
  if (Math.abs(dx) < 1e-9) return to.y;
  const t = (x - from.x) / dx;
  return from.y + (to.y - from.y) * t;
}

export function pointToSegmentDistance(
  point: Vec2,
  start: Vec2,
  end: Vec2,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return distanceBetween(point, start);
  }

  const t = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) /
      lengthSquared,
  );
  const projection = {
    x: start.x + t * dx,
    y: start.y + t * dy,
  };
  return distanceBetween(point, projection);
}
