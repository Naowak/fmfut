import { ANALYZED_STATS, type AnalyzedStat, type MicroBenchmarkResult } from "./types";
import { clamp, MATCH_CONFIG, round } from "@/lib/game/config";
import { SeededRng } from "@/lib/game/rng";
import { DEFAULT_HOME_SELECTION } from "@/lib/game/sample-teams";
import type { PlayerCard } from "@/lib/game/types";

type SixStats = PlayerCard["stats"];

export function runMicroBenchmarks(
  players: PlayerCard[],
  samples = 10000,
): MicroBenchmarkResult[] {
  const average = averageHomeStarterStats(players);

  return ANALYZED_STATS.map((stat) => {
    const boosted: SixStats = {
      ...average,
      [stat]: Math.min(100, average[stat] + 10),
    };

    const baselineRate = benchmarkStat(stat, average, samples, `micro-${stat}-base`);
    const boostedRate = benchmarkStat(stat, boosted, samples, `micro-${stat}-boost`);

    return {
      stat,
      label: benchmarkLabel(stat),
      baseline: round(baselineRate * 100, 2),
      boosted: round(boostedRate * 100, 2),
      delta: round((boostedRate - baselineRate) * 100, 2),
      unit: "%",
      samples,
    };
  });
}

function averageHomeStarterStats(players: PlayerCard[]): SixStats {
  const playerMap = new Map(players.map((player) => [player.playerId, player]));
  const starters = Object.values(DEFAULT_HOME_SELECTION.starters)
    .map((id) => playerMap.get(id))
    .filter((player): player is PlayerCard => Boolean(player));

  if (starters.length === 0) {
    throw new Error("Impossible de construire les micro-benchmarks : aucun titulaire trouvé.");
  }

  const keys = ANALYZED_STATS;
  return Object.fromEntries(
    keys.map((key) => [
      key,
      starters.reduce((sum, player) => sum + player.stats[key], 0) / starters.length,
    ]),
  ) as SixStats;
}

function benchmarkStat(
  stat: AnalyzedStat,
  stats: SixStats,
  samples: number,
  seed: string,
): number {
  switch (stat) {
    case "passing":
      return benchmarkPassing(stats, samples, seed);
    case "technique":
      return benchmarkFirstTouch(stats, samples, seed);
    case "shooting":
      return benchmarkShooting(stats, samples, seed);
    case "speed":
      return benchmarkSpeed(stats, samples, seed);
    case "physical":
      return benchmarkPhysical(stats, samples, seed);
    case "intelligence":
      return benchmarkIntelligence(stats, samples, seed);
  }
}

function benchmarkPassing(stats: SixStats, samples: number, seed: string): number {
  const rng = new SeededRng(seed);
  let successes = 0;

  for (let i = 0; i < samples; i += 1) {
    const distance = rng.between(0.10, 0.42);
    const pressure = rng.between(0, 0.8);
    const laneRisk = rng.between(0, 0.58);
    const passQuality = clamp(
      (0.78 * stats.passing + 0.16 * stats.technique + 0.06 * stats.intelligence) / 100,
    );
    const errorMagnitude =
      (1 - passQuality) *
      (0.018 + distance * 0.11) *
      (0.75 + pressure * 0.75 + laneRisk * 0.55);
    const powerError =
      rng.between(-0.22, 0.22) *
      (1 - passQuality) *
      (1 + pressure * 0.5);

    const arrivalQuality = clamp(
      1 - errorMagnitude / 0.055 - Math.abs(powerError) * 1.35,
      0,
      1,
    );
    const firstTouchQuality = clamp(
      (0.52 * stats.technique +
        0.26 * stats.passing +
        0.08 * stats.intelligence +
        0.14 * stats.physical) /
        100,
    );
    const controlProbability = clamp(
      0.28 + 0.50 * firstTouchQuality + 0.22 * arrivalQuality,
      0.05,
      0.99,
    );

    if (rng.chance(arrivalQuality * controlProbability)) successes += 1;
  }

  return successes / samples;
}

function benchmarkFirstTouch(stats: SixStats, samples: number, seed: string): number {
  const rng = new SeededRng(seed);
  let successes = 0;

  for (let i = 0; i < samples; i += 1) {
    const ballSpeed = rng.between(0.07, 0.34);
    const quality = clamp(
      (0.52 * stats.technique +
        0.26 * stats.passing +
        0.08 * stats.intelligence +
        0.14 * stats.physical) /
        100,
    );
    const speedDifficulty = clamp(
      ballSpeed / MATCH_CONFIG.ball.comfortableControlSpeed,
      0,
      1.8,
    );
    const probability = clamp(
      0.30 + 0.68 * quality - 0.30 * Math.max(0, speedDifficulty - 0.45),
      0.10,
      0.98,
    );
    if (rng.chance(probability)) successes += 1;
  }

  return successes / samples;
}

function benchmarkShooting(stats: SixStats, samples: number, seed: string): number {
  const rng = new SeededRng(seed);
  let onTarget = 0;

  for (let i = 0; i < samples; i += 1) {
    const distance = rng.between(0.08, 0.36);
    const execution = clamp(
      (0.84 * stats.shooting + 0.14 * stats.technique + 0.02 * stats.intelligence) / 100,
    );
    const aimedY = 0.5 + rng.between(-0.095, 0.095);
    const aimError = 0.032 + (1 - execution) * (0.22 + distance * 0.30);
    const targetY = aimedY + rng.between(-aimError, aimError);
    if (
      targetY >= MATCH_CONFIG.ball.goalMouthMinY &&
      targetY <= MATCH_CONFIG.ball.goalMouthMaxY
    ) {
      onTarget += 1;
    }
  }

  return onTarget / samples;
}

function benchmarkSpeed(stats: SixStats, samples: number, seed: string): number {
  const rng = new SeededRng(seed);
  let wins = 0;
  const opponentSpeed = 75;

  for (let i = 0; i < samples; i += 1) {
    const distance = rng.between(0.05, 0.24);
    const actorVelocity = movementVelocity(stats.speed);
    const opponentVelocity = movementVelocity(opponentSpeed);
    const actorReaction = rng.between(0.04, 0.14);
    const opponentReaction = rng.between(0.04, 0.14);
    const actorTime = actorReaction + distance / actorVelocity;
    const opponentTime = opponentReaction + distance / opponentVelocity;
    if (actorTime < opponentTime) wins += 1;
  }

  return wins / samples;
}

function movementVelocity(speed: number): number {
  return (
    MATCH_CONFIG.movement.minSpeedPerLogicalSecond +
    (speed / 100) *
      (MATCH_CONFIG.movement.maxSpeedPerLogicalSecond -
        MATCH_CONFIG.movement.minSpeedPerLogicalSecond)
  );
}

function benchmarkPhysical(stats: SixStats, samples: number, seed: string): number {
  const rng = new SeededRng(seed);
  let wins = 0;

  for (let i = 0; i < samples; i += 1) {
    const opponentTechnique = rng.between(68, 88);
    const opponentPhysical = rng.between(68, 88);
    const opponentSpeed = rng.between(68, 90);
    const probability = clamp(
      0.24 +
        0.28 * (stats.physical / 100) +
        0.16 * (stats.intelligence / 100) +
        0.03 * (stats.speed / 100) -
        0.22 * (opponentTechnique / 100) -
        0.16 * (opponentPhysical / 100) -
        0.05 * (opponentSpeed / 100),
      0.08,
      0.62,
    );
    if (rng.chance(probability)) wins += 1;
  }

  return wins / samples;
}

function benchmarkIntelligence(stats: SixStats, samples: number, seed: string): number {
  const rng = new SeededRng(seed);
  let optimalChoices = 0;

  for (let i = 0; i < samples; i += 1) {
    const best = rng.between(0.72, 0.92);
    const utilities = [
      best,
      best - rng.between(0.05, 0.18),
      best - rng.between(0.16, 0.34),
      best - rng.between(0.28, 0.50),
    ];
    const temperature =
      MATCH_CONFIG.decision.temperatureMin +
      (1 - clamp(stats.intelligence / 100)) ** MATCH_CONFIG.decision.temperatureGamma *
        (MATCH_CONFIG.decision.temperatureMax - MATCH_CONFIG.decision.temperatureMin);
    const selected = softmaxIndex(utilities, temperature, rng);
    if (selected === 0) optimalChoices += 1;
  }

  return optimalChoices / samples;
}

function softmaxIndex(utilities: number[], temperature: number, rng: SeededRng): number {
  const max = Math.max(...utilities);
  const weights = utilities.map((utility) =>
    Math.exp((utility - max) / Math.max(temperature, 0.001)),
  );
  const sum = weights.reduce((total, value) => total + value, 0);
  let cursor = rng.next() * sum;
  for (let i = 0; i < weights.length; i += 1) {
    cursor -= weights[i];
    if (cursor <= 0) return i;
  }
  return weights.length - 1;
}

function benchmarkLabel(stat: AnalyzedStat): string {
  switch (stat) {
    case "passing": return "Passes contrôlables";
    case "technique": return "Premiers contrôles réussis";
    case "shooting": return "Tirs cadrés";
    case "speed": return "Courses gagnées vs vitesse 75";
    case "physical": return "Duels défensifs gagnés";
    case "intelligence": return "Meilleure décision sélectionnée";
  }
}
