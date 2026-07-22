import { beforeAll, describe, expect, it } from "vitest";
import {
  createAdjustedSelection,
  runCalibrationSuite,
  runPairedExperiment,
} from "../lib/analytics/calibration";
import { runMicroBenchmarks } from "../lib/analytics/micro-benchmarks";
import type { CalibrationReport, PairedExperimentResult } from "../lib/analytics/types";
import { loadPlayersFromCsv } from "../lib/data/load-players";
import {
  DEFAULT_AWAY_SELECTION,
  DEFAULT_HOME_SELECTION,
} from "../lib/game/sample-teams";

const players = loadPlayersFromCsv();
let report: CalibrationReport;
let qualityExperiment: PairedExperimentResult;
let symmetryReport: CalibrationReport;
let secondSeedCohort: CalibrationReport;

beforeAll(() => {
  report = runCalibrationSuite({
    players,
    home: DEFAULT_HOME_SELECTION,
    away: DEFAULT_AWAY_SELECTION,
    runs: 120,
    seedPrefix: "test-calibration",
  });
  const adjusted = createAdjustedSelection({
    players,
    selection: DEFAULT_HOME_SELECTION,
    adjustments: {
      speed: 12,
      shooting: 12,
      passing: 12,
      physical: 12,
      technique: 12,
      intelligence: 12,
    },
  });
  qualityExperiment = runPairedExperiment({
    players: adjusted.players,
    baselineHome: DEFAULT_HOME_SELECTION,
    variantHome: adjusted.selection,
    away: DEFAULT_AWAY_SELECTION,
    runs: 80,
    seedPrefix: "test-squad-quality",
  });
  symmetryReport = runCalibrationSuite({
    players,
    home: { ...DEFAULT_HOME_SELECTION, name: "Mirror Home" },
    away: { ...DEFAULT_HOME_SELECTION, name: "Mirror Away" },
    runs: 100,
    seedPrefix: "test-side-symmetry",
  });
  secondSeedCohort = runCalibrationSuite({
    players,
    home: DEFAULT_HOME_SELECTION,
    away: DEFAULT_AWAY_SELECTION,
    runs: 60,
    seedPrefix: "test-calibration-independent",
  });
}, 20_000);

describe("exhaustive Monte-Carlo calibration", () => {
  it("passes every accounting invariant across the complete cohort", () => {
    expect(report.invariantViolations).toEqual([]);
    expect(report.runs).toBe(120);
  });

  it("keeps outcomes exhaustive and home advantage bounded", () => {
    expect(
      report.outcomes.homeWinRate +
        report.outcomes.drawRate +
        report.outcomes.awayWinRate,
    ).toBeCloseTo(100, 5);
    expect(Math.abs(report.outcomes.averageGoalDifference)).toBeLessThan(0.75);
    expect(
      Math.abs(report.outcomes.homeWinRate - report.outcomes.awayWinRate),
    ).toBeLessThan(20);
  });

  it("does not create a material side bias for two identical XIs", () => {
    expect(symmetryReport.invariantViolations).toEqual([]);
    expect(Math.abs(symmetryReport.outcomes.averageGoalDifference)).toBeLessThan(0.5);
    expect(
      Math.abs(
        symmetryReport.outcomes.homeWinRate -
          symmetryReport.outcomes.awayWinRate,
      ),
    ).toBeLessThan(15);
  });

  it("remains stable on an independent family of seeds", () => {
    expect(
      Math.abs(
        report.distributions.totalGoals.mean -
          secondSeedCohort.distributions.totalGoals.mean,
      ),
    ).toBeLessThan(0.8);
    expect(
      Math.abs(
        report.distributions.totalShots.mean -
          secondSeedCohort.distributions.totalShots.mean,
      ),
    ).toBeLessThan(3);
    expect(
      Math.abs(
        report.distributions.totalPasses.mean -
          secondSeedCohort.distributions.totalPasses.mean,
      ),
    ).toBeLessThan(6);
  });

  it("stays inside the broad V1 design calibration bands", () => {
    expect(report.checks.every((check) => check.passed)).toBe(true);
    expect(report.distributions.totalGoals.mean).toBeGreaterThanOrEqual(2);
    expect(report.distributions.totalGoals.mean).toBeLessThanOrEqual(4);
    expect(report.distributions.totalShots.mean).toBeGreaterThanOrEqual(14);
    expect(report.distributions.totalShots.mean).toBeLessThanOrEqual(24);
  });

  it("produces non-degenerate distributions rather than fixed scripts", () => {
    for (const distribution of Object.values(report.distributions)) {
      expect(distribution.standardDeviation).toBeGreaterThan(0);
      expect(distribution.min).toBeLessThan(distribution.max);
      expect(distribution.p05).toBeLessThanOrEqual(distribution.median);
      expect(distribution.median).toBeLessThanOrEqual(distribution.p95);
    }
  });

  it("exposes position signatures useful for future squad advice", () => {
    const byPosition = new Map(
      report.positions.map((position) => [position.position, position]),
    );
    const goalkeeper = byPosition.get("GK")!;
    const striker = byPosition.get("ST")!;
    const centralMidfielder = byPosition.get("CM")!;
    const leftWing = byPosition.get("LW")!;
    expect(goalkeeper.per90.goalkeeperSaves).toBeGreaterThan(2);
    expect(goalkeeper.per90.shots).toBe(0);
    expect(striker.per90.shots).toBeGreaterThan(3);
    expect(striker.per90.goals).toBeGreaterThan(0.5);
    expect(leftWing.per90.progressionActions).toBeGreaterThan(
      centralMidfielder.per90.progressionActions,
    );
    expect(centralMidfielder.per90.defensiveActions).toBeGreaterThan(
      leftWing.per90.defensiveActions,
    );
  });

  it("keeps separate, reliable profiles when a card appears for both teams", () => {
    const hakimi = report.individual.filter((profile) => profile.playerId === 235212);
    expect(hakimi).toHaveLength(2);
    expect(new Set(hakimi.map((profile) => profile.team))).toEqual(
      new Set(["HOME", "AWAY"]),
    );
    expect(hakimi.every((profile) => profile.reliability === "HIGH")).toBe(true);
    expect(
      report.individual.every(
        (profile) =>
          Number.isFinite(profile.per90.attackingContributions) &&
          Number.isFinite(profile.per90.defensiveActions),
      ),
    ).toBe(true);
  });

  it("responds strongly and significantly to a genuinely better XI", () => {
    expect(qualityExperiment.averageGoalDifferenceDelta).toBeGreaterThan(0.5);
    expect(qualityExperiment.averageGoalDifferenceDelta).toBeGreaterThan(
      qualityExperiment.deltaStandardError * 1.96,
    );
    expect(qualityExperiment.winRateDelta).toBeGreaterThan(10);
  });

  it("makes every public player attribute monotonic in its isolated benchmark", () => {
    const benchmarks = runMicroBenchmarks(players, 20_000);
    expect(benchmarks).toHaveLength(6);
    for (const benchmark of benchmarks) {
      expect(benchmark.boosted).toBeGreaterThan(benchmark.baseline);
      expect(benchmark.delta).toBeGreaterThan(1);
    }
  });
});
