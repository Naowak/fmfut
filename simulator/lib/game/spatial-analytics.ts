import { clamp, MATCH_CONFIG, round } from "./config";
import type {
  RuntimeTeam,
  SpatialAccumulator,
  SpatialTeamAccumulator,
  TeamIndex,
} from "./runtime";
import type {
  MatchSpatialAnalytics,
  Position,
  TeamSide,
  TeamSpatialAnalytics,
} from "./types";

const POSITIONS: Position[] = [
  "GK",
  "LB",
  "CB",
  "RB",
  "CDM",
  "CM",
  "CAM",
  "LM",
  "RM",
  "LW",
  "RW",
  "ST",
];

export function createSpatialAccumulator(): SpatialAccumulator {
  return {
    columns: MATCH_CONFIG.analytics.heatmapColumns,
    rows: MATCH_CONFIG.analytics.heatmapRows,
    teams: [createSpatialTeamAccumulator(), createSpatialTeamAccumulator()],
  };
}

function createSpatialTeamAccumulator(): SpatialTeamAccumulator {
  const cells =
    MATCH_CONFIG.analytics.heatmapColumns *
    MATCH_CONFIG.analytics.heatmapRows;

  return {
    samples: 0,
    allPlayersHeatmap: Array(cells).fill(0),
    positionHeatmaps: Object.fromEntries(
      POSITIONS.map((position) => [position, Array(cells).fill(0)]),
    ) as Partial<Record<Position, number[]>>,
    blockCenterProgressSum: 0,
    blockCenterProgressSquaredSum: 0,
    blockCenterMin: 1,
    blockCenterMax: 0,
    blockDepthSum: 0,
    blockWidthSum: 0,
    playersInAttackingHalfSum: 0,
    defensiveLineProgressSum: 0,
    possessionSamples: 0,
    outOfPossessionSamples: 0,
    possessionBlockCenterSum: 0,
    outOfPossessionBlockCenterSum: 0,
    possessionWidthSum: 0,
    outOfPossessionWidthSum: 0,
  };
}

export function captureSpatialSample(
  spatial: SpatialAccumulator,
  teams: [RuntimeTeam, RuntimeTeam],
  possessionTeamIndex: TeamIndex,
): void {
  const { columns, rows } = spatial;

  for (const team of teams) {
    const accumulator = spatial.teams[team.index];
    const active = team.players.filter(
      (player) => player.active && player.assignedPosition,
    );
    const outfield = active.filter(
      (player) => player.assignedPosition !== "GK",
    );

    accumulator.samples += 1;

    for (const player of active) {
      const progress = clamp(teamProgress(player.pos.x, team.side));
      const lateral = clamp(player.pos.y);
      const column = Math.min(columns - 1, Math.floor(lateral * columns));
      const row = Math.min(rows - 1, Math.floor(progress * rows));
      const index = row * columns + column;
      accumulator.allPlayersHeatmap[index] += 1;
      accumulator.positionHeatmaps[player.assignedPosition!]?.splice(
        index,
        1,
        (accumulator.positionHeatmaps[player.assignedPosition!]![index] ?? 0) +
          1,
      );
    }

    if (outfield.length === 0) continue;

    const progresses = outfield.map((player) =>
      teamProgress(player.pos.x, team.side),
    );
    const laterals = outfield.map((player) => player.pos.y);
    const blockCenter =
      progresses.reduce((sum, value) => sum + value, 0) / progresses.length;
    const blockWidth = Math.max(...laterals) - Math.min(...laterals);
    accumulator.blockCenterProgressSum += blockCenter;
    accumulator.blockCenterProgressSquaredSum += blockCenter * blockCenter;
    accumulator.blockCenterMin = Math.min(
      accumulator.blockCenterMin,
      blockCenter,
    );
    accumulator.blockCenterMax = Math.max(
      accumulator.blockCenterMax,
      blockCenter,
    );
    accumulator.blockDepthSum +=
      Math.max(...progresses) - Math.min(...progresses);
    accumulator.blockWidthSum += blockWidth;

    if (possessionTeamIndex === team.index) {
      accumulator.possessionSamples += 1;
      accumulator.possessionBlockCenterSum += blockCenter;
      accumulator.possessionWidthSum += blockWidth;
    } else {
      accumulator.outOfPossessionSamples += 1;
      accumulator.outOfPossessionBlockCenterSum += blockCenter;
      accumulator.outOfPossessionWidthSum += blockWidth;
    }
    accumulator.playersInAttackingHalfSum += progresses.filter(
      (value) => value > 0.5,
    ).length;

    const defensiveLine = outfield.filter((player) =>
      ["LB", "CB", "RB"].includes(player.assignedPosition!),
    );
    if (defensiveLine.length > 0) {
      accumulator.defensiveLineProgressSum +=
        defensiveLine.reduce(
          (sum, player) => sum + teamProgress(player.pos.x, team.side),
          0,
        ) / defensiveLine.length;
    }
  }
}

export function finalizeSpatialAnalytics(
  spatial: SpatialAccumulator,
): MatchSpatialAnalytics {
  return {
    columns: spatial.columns,
    rows: spatial.rows,
    home: finalizeSpatialTeam(spatial.teams[0]),
    away: finalizeSpatialTeam(spatial.teams[1]),
  };
}

function finalizeSpatialTeam(
  accumulator: SpatialTeamAccumulator,
): TeamSpatialAnalytics {
  const divisor = Math.max(accumulator.samples, 1);
  return {
    samples: accumulator.samples,
    allPlayersHeatmap: accumulator.allPlayersHeatmap,
    positionHeatmaps: accumulator.positionHeatmaps,
    averageBlockCenterProgress: round(
      accumulator.blockCenterProgressSum / divisor,
      3,
    ),
    averageBlockDepth: round(accumulator.blockDepthSum / divisor, 3),
    averageBlockWidth: round(accumulator.blockWidthSum / divisor, 3),
    averagePlayersInAttackingHalf: round(
      accumulator.playersInAttackingHalfSum / divisor,
      2,
    ),
    averageDefensiveLineProgress: round(
      accumulator.defensiveLineProgressSum / divisor,
      3,
    ),
    averageBlockCenterInPossession: round(
      accumulator.possessionBlockCenterSum /
        Math.max(accumulator.possessionSamples, 1),
      3,
    ),
    averageBlockCenterOutOfPossession: round(
      accumulator.outOfPossessionBlockCenterSum /
        Math.max(accumulator.outOfPossessionSamples, 1),
      3,
    ),
    averageWidthInPossession: round(
      accumulator.possessionWidthSum /
        Math.max(accumulator.possessionSamples, 1),
      3,
    ),
    averageWidthOutOfPossession: round(
      accumulator.outOfPossessionWidthSum /
        Math.max(accumulator.outOfPossessionSamples, 1),
      3,
    ),
    blockCenterRange: round(
      Math.max(0, accumulator.blockCenterMax - accumulator.blockCenterMin),
      3,
    ),
    blockCenterStdDev: round(
      Math.sqrt(
        Math.max(
          0,
          accumulator.blockCenterProgressSquaredSum / divisor -
            (accumulator.blockCenterProgressSum / divisor) ** 2,
        ),
      ),
      3,
    ),
  };
}

function teamProgress(worldX: number, side: TeamSide): number {
  return side === "HOME" ? worldX : 1 - worldX;
}
