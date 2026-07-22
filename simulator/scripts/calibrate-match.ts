import { runCalibrationSuite } from "../lib/analytics/calibration";
import { loadPlayers } from "../lib/data/load-players";
import {
  DEFAULT_AWAY_SELECTION,
  DEFAULT_HOME_SELECTION,
} from "../lib/game/sample-teams";

const requestedRuns = Number(process.argv[2] ?? 500);
const runs = Number.isFinite(requestedRuns)
  ? Math.max(20, Math.min(5_000, Math.floor(requestedRuns)))
  : 500;

const startedAt = performance.now();
const report = runCalibrationSuite({
  players: loadPlayers(),
  home: DEFAULT_HOME_SELECTION,
  away: DEFAULT_AWAY_SELECTION,
  runs,
  seedPrefix: "calibration-v09",
});

const summary = {
      durationMs: Math.round(performance.now() - startedAt),
      runs: report.runs,
      invariantViolations: report.invariantViolations,
      outcomes: report.outcomes,
      distributions: report.distributions,
      checks: report.checks,
    };
const result = process.argv.includes("--summary")
  ? summary
  : process.argv.includes("--compact")
    ? { ...summary, positions: report.positions }
    : { durationMs: Math.round(performance.now() - startedAt), ...report };

console.log(JSON.stringify(result, null, 2));
