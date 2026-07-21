"use client";

import { useMemo, useState } from "react";
import type {
  MonteCarloResponse,
  SensitivityResult,
  SpatialTeamAggregate,
} from "@/lib/analytics/types";
import type { Position } from "@/lib/game/types";

const HEATMAP_POSITIONS: Array<"ALL" | Position> = [
  "ALL",
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

export function AnalyticsDashboard() {
  const [runs, setRuns] = useState(50);
  const [seedPrefix, setSeedPrefix] = useState("balance-v07");
  const [sensitivity, setSensitivity] = useState(true);
  const [data, setData] = useState<MonteCarloResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heatmapTeam, setHeatmapTeam] = useState<"HOME" | "AWAY">("HOME");
  const [heatmapPosition, setHeatmapPosition] = useState<"ALL" | Position>("ALL");

  async function runAnalysis() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/analytics/monte-carlo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runs, seedPrefix, sensitivity }),
      });

      const payload = (await response.json()) as
        | MonteCarloResponse
        | { error: string };

      if (!response.ok || "error" in payload) {
        throw new Error(
          "error" in payload ? payload.error : "Analyse impossible.",
        );
      }

      setData(payload);
    } catch (analysisError) {
      setError(
        analysisError instanceof Error
          ? analysisError.message
          : "Erreur inconnue.",
      );
    } finally {
      setLoading(false);
    }
  }

  const selectedSpatialTeam = useMemo(() => {
    if (!data?.spatial) return null;
    return heatmapTeam === "HOME" ? data.spatial.home : data.spatial.away;
  }, [data, heatmapTeam]);

  const selectedHeatmap = useMemo(() => {
    if (!selectedSpatialTeam) return [];
    return heatmapPosition === "ALL"
      ? selectedSpatialTeam.allPlayersHeatmap
      : selectedSpatialTeam.positionHeatmaps[heatmapPosition] ?? [];
  }, [heatmapPosition, selectedSpatialTeam]);

  return (
    <div className="analytics-shell">
      <section className="card analytics-controls">
        <div className="field-group">
          <label htmlFor="runs">Nombre de matchs</label>
          <input
            id="runs"
            className="text-input"
            type="number"
            min={10}
            max={300}
            value={runs}
            onChange={(event) => setRuns(Number(event.target.value))}
          />
        </div>

        <div className="field-group">
          <label htmlFor="seed-prefix">Préfixe des seeds</label>
          <input
            id="seed-prefix"
            className="text-input"
            value={seedPrefix}
            onChange={(event) => setSeedPrefix(event.target.value)}
          />
        </div>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={sensitivity}
            onChange={(event) => setSensitivity(event.target.checked)}
          />
          Mesurer la sensibilité des 6 stats et des rôles
        </label>

        <button
          type="button"
          className="primary-button"
          onClick={runAnalysis}
          disabled={loading}
        >
          {loading ? "Simulation en cours…" : "Lancer Monte-Carlo"}
        </button>
      </section>

      {error && <div className="error-box">{error}</div>}

      {!data ? (
        <section className="card empty-state analytics-empty">
          <div>
            <h2>Runner headless prêt</h2>
            <p>
              La baseline collecte aussi les positions moyennes pour analyser
              les blocs et produire des heatmaps.
            </p>
          </div>
        </section>
      ) : (
        <>
          <section className="analytics-kpis">
            <Kpi label="Buts / match" value={data.baseline.averageTotalGoals} />
            <Kpi label="Victoire domicile" value={`${data.baseline.homeWinRate}%`} />
            <Kpi label="Nuls" value={`${data.baseline.drawRate}%`} />
            <Kpi label="Durée analyse" value={`${data.durationMs} ms`} />
          </section>

          <section className="card analytics-section">
            <h2>Style de jeu moyen</h2>
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Métrique</th>
                  <th>Domicile</th>
                  <th>Extérieur</th>
                </tr>
              </thead>
              <tbody>
                <MetricRow label="Buts" home={data.baseline.averageHomeGoals} away={data.baseline.averageAwayGoals} />
                <MetricRow label="Tirs" home={data.baseline.averageHomeShots} away={data.baseline.averageAwayShots} />
                <MetricRow label="Passes tentées" home={data.baseline.averageHomePasses} away={data.baseline.averageAwayPasses} />
                <MetricRow label="Passes arrière" home={data.baseline.averageHomeBackwardPasses} away={data.baseline.averageAwayBackwardPasses} />
                <MetricRow label="Remises au gardien" home={data.baseline.averageHomeGoalkeeperBackPasses} away={data.baseline.averageAwayGoalkeeperBackPasses} />
                <MetricRow label="Buts contre son camp" home={data.baseline.averageHomeOwnGoals} away={data.baseline.averageAwayOwnGoals} />
                <MetricRow label="Dribbles / progressions balle au pied" home={data.baseline.averageHomeDribbles} away={data.baseline.averageAwayDribbles} />
                <MetricRow label="Appels progressifs" home={data.baseline.averageHomeProgressiveRuns} away={data.baseline.averageAwayProgressiveRuns} />
                <MetricRow label="Duels gagnés" home={data.baseline.averageHomeDuelsWon} away={data.baseline.averageAwayDuelsWon} />
                <MetricRow label="Tirs en transition rapide" home={data.baseline.averageHomeTransitionShots} away={data.baseline.averageAwayTransitionShots} />
                <MetricRow label="Récupérations / changements de possession" home={data.baseline.averageHomePossessionRegains} away={data.baseline.averageAwayPossessionRegains} />
                <MetricRow label="Réussite des passes" home={`${data.baseline.averageHomePassCompletion}%`} away={`${data.baseline.averageAwayPassCompletion}%`} />
                <MetricRow label="Conversion des tirs" home={`${data.baseline.averageHomeShotConversion}%`} away={`${data.baseline.averageAwayShotConversion}%`} />
                <MetricRow label="Hors-jeu" home={data.baseline.averageHomeOffsides} away={data.baseline.averageAwayOffsides} />
                <MetricRow label="Touches" home={data.baseline.averageHomeThrowIns} away={data.baseline.averageAwayThrowIns} />
                <MetricRow label="Corners" home={data.baseline.averageHomeCorners} away={data.baseline.averageAwayCorners} />
                <MetricRow label="Six mètres" home={data.baseline.averageHomeGoalKicks} away={data.baseline.averageAwayGoalKicks} />
                <MetricRow label="Coups francs" home={data.baseline.averageHomeFreeKicks} away={data.baseline.averageAwayFreeKicks} />
                <MetricRow label="Penalties" home={data.baseline.averageHomePenalties} away={data.baseline.averageAwayPenalties} />
                <MetricRow label="Arrêts gardien" home={data.baseline.averageHomeGoalkeeperSaves} away={data.baseline.averageAwayGoalkeeperSaves} />
                <MetricRow label="Changements" home={data.baseline.averageHomeSubstitutions} away={data.baseline.averageAwaySubstitutions} />
                <MetricRow label="Possession" home={`${data.baseline.averageHomePossession}%`} away={`${data.baseline.averageAwayPossession}%`} />
                <MetricRow label="Énergie moyenne finale des titulaires" home={`${data.baseline.averageHomeStarterEnergy}%`} away={`${data.baseline.averageAwayStarterEnergy}%`} />
                <MetricRow label="Temps additionnel moyen 1re mi-temps" home={`${data.baseline.averageFirstHalfAddedTime} min`} away="—" />
                <MetricRow label="Temps additionnel moyen 2e mi-temps" home={`${data.baseline.averageSecondHalfAddedTime} min`} away="—" />
              </tbody>
            </table>
          </section>

          {data.spatial && selectedSpatialTeam && (
            <section className="card analytics-section">
              <div className="analytics-section-header">
                <div>
                  <h2>Analyse spatiale</h2>
                  <p className="muted">
                    Repère équipe : notre but en bas, attaque vers le haut.
                  </p>
                </div>
                <div className="heatmap-controls">
                  <select
                    value={heatmapTeam}
                    onChange={(event) => setHeatmapTeam(event.target.value as "HOME" | "AWAY")}
                  >
                    <option value="HOME">Domicile</option>
                    <option value="AWAY">Extérieur</option>
                  </select>
                  <select
                    value={heatmapPosition}
                    onChange={(event) => setHeatmapPosition(event.target.value as "ALL" | Position)}
                  >
                    {HEATMAP_POSITIONS.map((position) => (
                      <option key={position} value={position}>
                        {position === "ALL" ? "Tous les joueurs" : position}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="spatial-layout">
                <Heatmap
                  values={selectedHeatmap}
                  columns={data.spatial.columns}
                  rows={data.spatial.rows}
                  team={heatmapTeam}
                />

                <div className="spatial-metrics">
                  <SpatialMetric label="Centre moyen du bloc" value={formatPitchPercent(selectedSpatialTeam.averageBlockCenterProgress)} />
                  <SpatialMetric label="Centre avec possession" value={formatPitchPercent(selectedSpatialTeam.averageBlockCenterInPossession)} />
                  <SpatialMetric label="Centre sans possession" value={formatPitchPercent(selectedSpatialTeam.averageBlockCenterOutOfPossession)} />
                  <SpatialMetric label="Écart attaque/défense" value={formatSignedPercent(selectedSpatialTeam.averageBlockCenterInPossession - selectedSpatialTeam.averageBlockCenterOutOfPossession)} />
                  <SpatialMetric label="Profondeur moyenne du bloc" value={formatPitchPercent(selectedSpatialTeam.averageBlockDepth)} />
                  <SpatialMetric label="Largeur moyenne" value={formatPitchPercent(selectedSpatialTeam.averageBlockWidth)} />
                  <SpatialMetric label="Largeur avec possession" value={formatPitchPercent(selectedSpatialTeam.averageWidthInPossession)} />
                  <SpatialMetric label="Largeur sans possession" value={formatPitchPercent(selectedSpatialTeam.averageWidthOutOfPossession)} />
                  <SpatialMetric label="Joueurs moyens dans moitié adverse" value={selectedSpatialTeam.averagePlayersInAttackingHalf} />
                  <SpatialMetric label="Hauteur moyenne ligne défensive" value={formatPitchPercent(selectedSpatialTeam.averageDefensiveLineProgress)} />
                  <SpatialMetric label="Amplitude du centre de bloc" value={formatPitchPercent(selectedSpatialTeam.blockCenterRange)} />
                  <SpatialMetric label="Volatilité du centre de bloc" value={formatPitchPercent(selectedSpatialTeam.blockCenterStdDev)} />
                </div>
              </div>
            </section>
          )}

          {data.sensitivity.length > 0 && (
            <section className="card analytics-section">
              <h2>Sensibilité des six statistiques</h2>
              <p className="muted">
                Même série de seeds, avec +10 sur une seule stat du onze domicile. Le ± correspond à l'erreur standard du delta apparié. Un badge « bruité » signifie que l'intervalle approximatif à 95 % contient encore zéro : on ne retouche pas une stat sur ce seul signal global.
              </p>
              <div className="sensitivity-list">
                {[...data.sensitivity]
                  .sort((a, b) => b.averageGoalDifferenceDelta - a.averageGoalDifferenceDelta)
                  .map((item) => (
                    <SensitivityBar
                      key={item.stat}
                      item={item}
                      max={Math.max(
                        0.01,
                        ...data.sensitivity.map((candidate) => Math.abs(candidate.averageGoalDifferenceDelta)),
                      )}
                    />
                  ))}
              </div>
            </section>
          )}

          {data.microBenchmarks.length > 0 && (
            <section className="card analytics-section">
              <div className="analytics-section-header">
                <div>
                  <h2>Micro-benchmarks isolés</h2>
                  <p className="muted">
                    10 000 situations contrôlées par stat. Ici, un +10 doit améliorer directement la capacité testée, sans divergence chaotique d'un match complet.
                  </p>
                </div>
              </div>
              <div className="micro-benchmark-grid">
                {data.microBenchmarks.map((benchmark) => (
                  <div className="micro-benchmark-card" key={benchmark.stat}>
                    <div className="micro-benchmark-heading">
                      <span>{benchmark.stat}</span>
                      <strong>{benchmark.label}</strong>
                    </div>
                    <div className="micro-benchmark-values">
                      <span>{benchmark.baseline}{benchmark.unit}</span>
                      <span className="micro-arrow">→</span>
                      <span>{benchmark.boosted}{benchmark.unit}</span>
                    </div>
                    <div className="micro-benchmark-delta" data-negative={benchmark.delta < 0}>
                      {formatSigned(benchmark.delta)} pts avec +10
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {data.roleExperiment && (
            <section className="card analytics-section">
              <h2>Impact des rôles configurés</h2>
              <p>Différentiel de buts moyen avec rôles actuels : <strong>{data.roleExperiment.configuredAverageGoalDifference}</strong></p>
              <p>Même équipe avec tous les rôles sur Normal : <strong>{data.roleExperiment.neutralRolesAverageGoalDifference}</strong></p>
              <p>Delta actuel : <strong>{data.roleExperiment.delta}</strong></p>
            </section>
          )}

          <section className="card analytics-section">
            <h2>Notes</h2>
            {data.notes.map((note) => (
              <p key={note} className="muted">{note}</p>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function Heatmap({
  values,
  columns,
  rows,
  team,
}: {
  values: number[];
  columns: number;
  rows: number;
  team: "HOME" | "AWAY";
}) {
  const max = Math.max(1, ...values);
  const rendered: number[] = [];

  // Les données sont stockées de notre but (row 0) vers le but adverse.
  // À l'écran on inverse les lignes pour afficher l'attaque vers le haut.
  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let column = 0; column < columns; column += 1) {
      rendered.push(values[row * columns + column] ?? 0);
    }
  }

  return (
    <div className="heatmap-pitch">
      <div
        className="heatmap-grid"
        style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
      >
        {rendered.map((value, index) => {
          const intensity = value / max;
          const background = team === "HOME"
            ? `rgba(37, 99, 235, ${0.06 + intensity * 0.88})`
            : `rgba(220, 38, 38, ${0.06 + intensity * 0.88})`;
          return <div key={index} className="heatmap-cell" style={{ background }} />;
        })}
      </div>
      <span className="heatmap-goal heatmap-goal-top">BUT ADVERSE</span>
      <span className="heatmap-goal heatmap-goal-bottom">NOTRE BUT</span>
    </div>
  );
}

function SpatialMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="spatial-metric">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card kpi-card">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MetricRow({ label, home, away }: { label: string; home: string | number; away: string | number }) {
  return (
    <tr>
      <td>{label}</td>
      <td>{home}</td>
      <td>{away}</td>
    </tr>
  );
}

function SensitivityBar({ item, max }: { item: SensitivityResult; max: number }) {
  const width = (Math.abs(item.averageGoalDifferenceDelta) / max) * 100;
  const signalToNoise =
    item.goalDifferenceStdError > 0
      ? Math.abs(item.averageGoalDifferenceDelta) / item.goalDifferenceStdError
      : Number.POSITIVE_INFINITY;
  const globallyConclusive = signalToNoise >= 1.96;

  return (
    <div className="sensitivity-row">
      <div className="sensitivity-label">
        <div className="sensitivity-title-row">
          <strong>{item.stat}</strong>
          <span
            className="sensitivity-confidence"
            data-conclusive={globallyConclusive}
          >
            {globallyConclusive ? "signal global net" : "signal global bruité"}
          </span>
        </div>
        <span>
          Δ buts {formatSigned(item.averageGoalDifferenceDelta)} ± {item.goalDifferenceStdError} · Δ win rate{" "}
          {formatSigned(item.homeWinRateDelta)} pts · {item.secondaryMetricLabel}{" "}
          {formatSigned(item.secondaryMetricDelta)}
        </span>
      </div>
      <div className="sensitivity-track">
        <div
          className="sensitivity-fill"
          data-negative={item.averageGoalDifferenceDelta < 0}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function formatPitchPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatSignedPercent(value: number): string {
  const percent = Math.round(value * 100);
  return `${percent >= 0 ? "+" : ""}${percent} pts terrain`;
}

function formatSigned(value: number): string {
  return `${value >= 0 ? "+" : ""}${value}`;
}
