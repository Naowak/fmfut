import type { PlayerCard, Position } from "@/lib/game/types";
import type { PositionBenchmarks, Quantiles } from "./api-types";

const POSITIONS: Position[] = [
  "GK", "LB", "CB", "RB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST",
];
const STAT_KEYS: Array<keyof PlayerCard["stats"]> = [
  "speed", "shooting", "passing", "physical", "technique", "intelligence",
];

export function computePositionBenchmarks(
  players: PlayerCard[],
): PositionBenchmarks[] {
  return POSITIONS.map((position) => {
    const eligible = players.filter((player) =>
      [player.primaryPosition, ...player.alternativePositions].includes(position),
    );
    return {
      position,
      sampleSize: eligible.length,
      overall: quantiles(eligible.map((player) => player.overall)),
      stats: Object.fromEntries(
        STAT_KEYS.map((stat) => [
          stat,
          quantiles(eligible.map((player) => player.stats[stat])),
        ]),
      ) as PositionBenchmarks["stats"],
    };
  });
}

export function estimatePercentile(value: number, values: Quantiles): number {
  const points: Array<[number, number]> = [
    [1, 0],
    [values.q10, 10],
    [values.q25, 25],
    [values.q50, 50],
    [values.q75, 75],
    [values.q90, 90],
    [100, 100],
  ];
  for (let index = 1; index < points.length; index += 1) {
    const [upperValue, upperPercentile] = points[index];
    const [lowerValue, lowerPercentile] = points[index - 1];
    if (value <= upperValue) {
      const span = Math.max(1, upperValue - lowerValue);
      const ratio = (value - lowerValue) / span;
      return Math.round(
        Math.max(lowerPercentile, lowerPercentile + ratio * (upperPercentile - lowerPercentile)),
      );
    }
  }
  return 100;
}

function quantiles(values: number[]): Quantiles {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    q10: percentile(sorted, 0.10),
    q25: percentile(sorted, 0.25),
    q50: percentile(sorted, 0.50),
    q75: percentile(sorted, 0.75),
    q90: percentile(sorted, 0.90),
  };
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  return values[Math.floor((values.length - 1) * ratio)];
}
