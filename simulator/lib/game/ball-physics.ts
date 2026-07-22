import { MATCH_CONFIG } from "./config";
import { normalizeVector, vectorLength } from "./geometry";
import type { LooseBall } from "./runtime";
import type { Vec2 } from "./types";

export function advanceBallPosition(
  position: Vec2,
  velocity: Vec2,
  step: number,
): Vec2 {
  return {
    x: position.x + velocity.x * step,
    y: position.y + velocity.y * step,
  };
}

export function decayBallVelocity(
  velocity: Vec2,
  deceleration: number,
  step: number,
): Vec2 {
  const speed = vectorLength(velocity);
  if (speed <= 0) return { x: 0, y: 0 };

  const nextSpeed = Math.max(0, speed - deceleration * step);
  if (nextSpeed <= MATCH_CONFIG.ball.looseBallStopSpeed) {
    return { x: 0, y: 0 };
  }
  const direction = normalizeVector(velocity);
  return {
    x: direction.x * nextSpeed,
    y: direction.y * nextSpeed,
  };
}

export function predictLooseBallStop(ball: LooseBall): Vec2 {
  const speed = vectorLength(ball.velocity);
  if (speed <= MATCH_CONFIG.ball.looseBallStopSpeed) {
    return { ...ball.pos };
  }

  const deceleration = ball.deceleration || MATCH_CONFIG.ball.passDeceleration;
  const stopDistance = (speed * speed) / (2 * Math.max(deceleration, 0.001));
  const direction = normalizeVector(ball.velocity);
  return {
    x: Math.max(0.005, Math.min(0.995, ball.pos.x + direction.x * stopDistance)),
    y: Math.max(0.005, Math.min(0.995, ball.pos.y + direction.y * stopDistance)),
  };
}
