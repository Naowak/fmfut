import { performance } from "node:perf_hooks";
import {
  resolvePlayersDatabasePath,
  SqlitePlayerRepository,
} from "../lib/data/player-repository";

const repository = new SqlitePlayerRepository(resolvePlayersDatabasePath());

function percentile(values: number[], ratio: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function measure(iterations: number, callback: (index: number) => void) {
  const durations: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    callback(index);
    durations.push(performance.now() - started);
  }
  return {
    iterations,
    averageMs: durations.reduce((sum, value) => sum + value, 0) / iterations,
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
  };
}

repository.clearCache();
const queries = ["Mbappe", "Salah", "Bellingham", "Haaland", "Rodri"];
const uncached = measure(250, (index) => {
  repository.clearCache();
  repository.search({
    query: queries[index % queries.length],
    page: 1 + (index % 4),
    pageSize: 20,
  });
});

repository.clearCache();
repository.search({ query: "Mbappe", page: 1, pageSize: 20 });
const cached = measure(1_000, () => {
  repository.search({ query: "Mbappe", page: 1, pageSize: 20 });
});

console.log(JSON.stringify({ uncached, cached, cache: repository.cacheStats() }, null, 2));
repository.close();
