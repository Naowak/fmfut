"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  MonteCarloResponse,
  PlayerDecisionProfile,
  SensitivityResult,
  SpatialTeamAggregate,
} from "@/lib/analytics/types";
import type { Position, SpatialSliceKey } from "@/lib/game/types";
import { positionShortLabel } from "@/lib/game/localization";
import type { SquadOpponent } from "@/lib/squad/api-types";

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
  const [data, setData] = useState<MonteCarloResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heatmapTeam, setHeatmapTeam] = useState<"HOME" | "AWAY">("HOME");
  const [heatmapPosition, setHeatmapPosition] = useState<"ALL" | Position>("ALL");
  const [heatmapPlayerId, setHeatmapPlayerId] = useState("");
  const [heatmapSlice, setHeatmapSlice] = useState<SpatialSliceKey>("ALL");
  const [teams, setTeams] = useState<SquadOpponent[]>([]);
  const [homeId, setHomeId] = useState("france-2026");
  const [awayId, setAwayId] = useState("argentina-2026");
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const homeTeam = teams.find((team) => team.id === homeId) ?? null;
  const awayTeam = teams.find((team) => team.id === awayId) ?? null;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/squad/opponents", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as SquadOpponent[] | { error: string };
        if (!response.ok || !Array.isArray(payload)) throw new Error(!Array.isArray(payload) && "error" in payload ? payload.error : "Sélections indisponibles.");
        if (!cancelled) setTeams(payload);
      })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Sélections indisponibles."); });
    return () => { cancelled = true; };
  }, []);

  async function runAnalysis() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/analytics/monte-carlo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runs,
          seedPrefix,
          home: homeTeam?.selection,
          away: awayTeam?.selection,
        }),
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
      window.setTimeout(() => scrollToPanel(resultsRef.current), 80);
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
    const slice = selectedSpatialTeam.heatmapSlices[heatmapSlice];
    if (heatmapPlayerId) return slice.playerHeatmaps[Number(heatmapPlayerId)] ?? [];
    if (heatmapSlice !== "ALL") return slice.allPlayersHeatmap;
    return heatmapPosition === "ALL"
      ? selectedSpatialTeam.allPlayersHeatmap
      : selectedSpatialTeam.positionHeatmaps[heatmapPosition] ?? [];
  }, [heatmapPlayerId, heatmapPosition, heatmapSlice, selectedSpatialTeam]);

  const spatialPlayers = useMemo(
    () => data?.individual.filter((player) => player.team === heatmapTeam) ?? [],
    [data, heatmapTeam],
  );

  return (
    <div className="analytics-shell">
      <section className="card analytics-controls">
        <TeamSelect id="lab-home" label={homeTeam?.name ?? "Équipe"} value={homeId} onChange={(value) => { setHomeId(value); setData(null); }} teams={teams} />
        <TeamSelect id="lab-away" label={awayTeam?.name ?? "Équipe"} value={awayId} onChange={(value) => { setAwayId(value); setData(null); }} teams={teams} />
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

        <button
          type="button"
          className="primary-button"
          onClick={runAnalysis}
          disabled={loading || !homeTeam || !awayTeam}
        >
          {loading ? "Simulation en cours…" : "Lancer Monte-Carlo"}
        </button>
      </section>

      {error && <div className="error-box">{error}</div>}

      {data && (
        <div ref={resultsRef} className="analytics-results">
          <section className="analytics-kpis">
            <Kpi label="Buts / match" value={data.baseline.averageTotalGoals} />
            <Kpi label={`Victoire ${homeTeam?.name ?? "équipe"}`} value={`${data.baseline.homeWinRate}%`} />
            <Kpi label="Nuls" value={`${data.baseline.drawRate}%`} />
            <Kpi label="Durée analyse" value={`${data.durationMs} ms`} />
          </section>

          <section className="card analytics-section">
            <h2>Style de jeu moyen</h2>
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Métrique</th>
                  <th>{homeTeam ? `${homeTeam.flag} ${homeTeam.name}` : "Équipe"}</th>
                  <th>{awayTeam ? `${awayTeam.flag} ${awayTeam.name}` : "Adversaire"}</th>
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
                <h2>Analyse spatiale</h2>
                <div className="heatmap-controls">
                  <select
                    value={heatmapTeam}
                    onChange={(event) => { setHeatmapTeam(event.target.value as "HOME" | "AWAY"); setHeatmapPlayerId(""); }}
                  >
                    <option value="HOME">{homeTeam ? `${homeTeam.flag} ${homeTeam.name}` : "Équipe"}</option>
                    <option value="AWAY">{awayTeam ? `${awayTeam.flag} ${awayTeam.name}` : "Adversaire"}</option>
                  </select>
                  <select
                    value={heatmapPosition}
                    disabled={Boolean(heatmapPlayerId) || heatmapSlice !== "ALL"}
                    onChange={(event) => setHeatmapPosition(event.target.value as "ALL" | Position)}
                  >
                    {HEATMAP_POSITIONS.map((position) => (
                      <option key={position} value={position}>
                        {position === "ALL" ? "Tous les joueurs" : positionShortLabel(position)}
                      </option>
                    ))}
                  </select>
                  <select value={heatmapPlayerId} onChange={(event) => { setHeatmapPlayerId(event.target.value); if (event.target.value) setHeatmapPosition("ALL"); }} aria-label="Joueur observé">
                    <option value="">Équipe / poste</option>
                    {spatialPlayers.map((player) => <option key={player.key} value={player.playerId}>{player.playerName}</option>)}
                  </select>
                  <select value={heatmapSlice} onChange={(event) => setHeatmapSlice(event.target.value as SpatialSliceKey)} aria-label="Période ou phase"><option value="ALL">Match complet</option><option value="FIRST_HALF">Première période</option><option value="SECOND_HALF">Seconde période</option><option value="IN_POSSESSION">Avec ballon</option><option value="OUT_OF_POSSESSION">Sans ballon</option></select>
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

          <section className="card analytics-section">
            <h2>Statistiques individuelles</h2>
            <p className="muted">Moyenne normalisée sur un match complet pour tous les joueurs observés.</p>
            <div className="table-scroll analytics-player-scroll">
              <table className="analytics-table analytics-player-table">
                <thead><tr><th>Joueur</th><th>Équipe</th><th>Poste</th><th>Présences</th><th>Minutes</th><th>Buts</th><th>Passes déc.</th><th>Tirs</th><th>Cadrés</th><th>Touches</th><th>Passes</th><th>Dribbles</th><th>Courses</th><th>Tacles</th><th>Interceptions</th><th>Duels</th><th>Récupérations</th><th>Distance</th><th>Énergie fin</th><th>Fiabilité</th></tr></thead>
                <tbody>{data.individual.map((player) => <PlayerAnalyticsRow key={player.key} player={player} homeName={homeTeam?.name ?? "Équipe"} awayName={awayTeam?.name ?? "Adversaire"} />)}</tbody>
              </table>
            </div>
          </section>

          {data.sensitivity.length > 0 && (
            <section className="card analytics-section">
              <h2>Sensibilité des six statistiques</h2>
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
                <h2>Micro-benchmarks isolés</h2>
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

        </div>
      )}
    </div>
  );
}

function scrollToPanel(element: HTMLElement | null) {
  if (!element) return;
  window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 58);
}

function TeamSelect({ id, label, value, onChange, teams }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  teams: SquadOpponent[];
}) {
  return (
    <div className="field-group national-team-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {teams.map((team) => <option key={team.id} value={team.id}>{team.flag} {team.name}</option>)}
      </select>
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

function PlayerAnalyticsRow({ player, homeName, awayName }: { player: PlayerDecisionProfile; homeName: string; awayName: string }) {
  const average = player.per90;
  return (
    <tr>
      <td>{player.playerName}</td><td>{player.team === "HOME" ? homeName : awayName}</td><td>{positionShortLabel(player.position)}</td>
      <td>{player.appearances}</td><td>{player.averageMinutes}</td><td>{average.goals}</td><td>{average.assists}</td>
      <td>{average.shots}</td><td>{average.shotsOnTarget}</td><td>{average.touches}</td><td>{average.passesCompleted}/{average.passesAttempted}</td>
      <td>{average.dribbles}</td><td>{average.progressiveRuns}</td><td>{average.tackles}</td><td>{average.interceptions}</td>
      <td>{average.duelsWon}</td><td>{average.possessionRegains}</td><td>{average.distanceCovered}</td><td>{player.averageEnergyEnd}%</td><td>{player.reliability}</td>
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
