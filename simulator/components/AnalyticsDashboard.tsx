"use client";

import { useState } from "react";
import type {
  MonteCarloResponse,
  SensitivityResult,
} from "@/lib/analytics/types";

export function AnalyticsDashboard() {
  const [runs, setRuns] = useState(50);
  const [seedPrefix, setSeedPrefix] = useState("balance-v03");
  const [sensitivity, setSensitivity] = useState(true);
  const [data, setData] = useState<MonteCarloResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runAnalysis() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/analytics/monte-carlo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          runs,
          seedPrefix,
          sensitivity,
        }),
      });

      const payload = (await response.json()) as
        | MonteCarloResponse
        | { error: string };

      if (!response.ok || "error" in payload) {
        throw new Error(
          "error" in payload
            ? payload.error
            : "Analyse impossible.",
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
            onChange={(event) =>
              setRuns(Number(event.target.value))
            }
          />
        </div>

        <div className="field-group">
          <label htmlFor="seed-prefix">Préfixe des seeds</label>
          <input
            id="seed-prefix"
            className="text-input"
            value={seedPrefix}
            onChange={(event) =>
              setSeedPrefix(event.target.value)
            }
          />
        </div>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={sensitivity}
            onChange={(event) =>
              setSensitivity(event.target.checked)
            }
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
              Aucun replay n&apos;est créé ici. Le serveur enchaîne les matchs
              et agrège directement leurs résultats.
            </p>
          </div>
        </section>
      ) : (
        <>
          <section className="analytics-kpis">
            <Kpi
              label="Buts / match"
              value={data.baseline.averageTotalGoals}
            />
            <Kpi
              label="Victoire domicile"
              value={`${data.baseline.homeWinRate}%`}
            />
            <Kpi
              label="Nuls"
              value={`${data.baseline.drawRate}%`}
            />
            <Kpi
              label="Durée analyse"
              value={`${data.durationMs} ms`}
            />
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
                <MetricRow
                  label="Buts"
                  home={data.baseline.averageHomeGoals}
                  away={data.baseline.averageAwayGoals}
                />
                <MetricRow
                  label="Tirs"
                  home={data.baseline.averageHomeShots}
                  away={data.baseline.averageAwayShots}
                />
                <MetricRow
                  label="Passes tentées"
                  home={data.baseline.averageHomePasses}
                  away={data.baseline.averageAwayPasses}
                />
                <MetricRow
                  label="Dribbles / progressions balle au pied"
                  home={data.baseline.averageHomeDribbles}
                  away={data.baseline.averageAwayDribbles}
                />
                <MetricRow
                  label="Appels progressifs"
                  home={data.baseline.averageHomeProgressiveRuns}
                  away={data.baseline.averageAwayProgressiveRuns}
                />
                <MetricRow
                  label="Duels gagnés"
                  home={data.baseline.averageHomeDuelsWon}
                  away={data.baseline.averageAwayDuelsWon}
                />
                <MetricRow
                  label="Possession"
                  home={`${data.baseline.averageHomePossession}%`}
                  away={`${data.baseline.averageAwayPossession}%`}
                />
                <MetricRow
                  label="Énergie moyenne finale des titulaires"
                  home={`${data.baseline.averageHomeStarterEnergy}%`}
                  away={`${data.baseline.averageAwayStarterEnergy}%`}
                />
              </tbody>
            </table>
          </section>

          {data.sensitivity.length > 0 && (
            <section className="card analytics-section">
              <h2>Sensibilité des six statistiques</h2>
              <p className="muted">
                Même série de seeds, avec +10 sur une seule stat du onze
                domicile. Une valeur positive signifie que le boost améliore
                le différentiel de buts moyen.
              </p>
              <div className="sensitivity-list">
                {[...data.sensitivity]
                  .sort(
                    (a, b) =>
                      b.averageGoalDifferenceDelta -
                      a.averageGoalDifferenceDelta,
                  )
                  .map((item) => (
                    <SensitivityBar
                      key={item.stat}
                      item={item}
                      max={Math.max(
                        0.01,
                        ...data.sensitivity.map((candidate) =>
                          Math.abs(
                            candidate.averageGoalDifferenceDelta,
                          ),
                        ),
                      )}
                    />
                  ))}
              </div>
            </section>
          )}

          {data.roleExperiment && (
            <section className="card analytics-section">
              <h2>Impact des rôles configurés</h2>
              <p>
                Différentiel de buts moyen avec rôles actuels :{" "}
                <strong>
                  {data.roleExperiment.configuredAverageGoalDifference}
                </strong>
              </p>
              <p>
                Même équipe avec tous les rôles sur Normal :{" "}
                <strong>
                  {data.roleExperiment.neutralRolesAverageGoalDifference}
                </strong>
              </p>
              <p>
                Delta actuel :{" "}
                <strong>{data.roleExperiment.delta}</strong>
              </p>
            </section>
          )}

          <section className="card analytics-section">
            <h2>Notes</h2>
            {data.notes.map((note) => (
              <p key={note} className="muted">
                {note}
              </p>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="card kpi-card">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MetricRow({
  label,
  home,
  away,
}: {
  label: string;
  home: string | number;
  away: string | number;
}) {
  return (
    <tr>
      <td>{label}</td>
      <td>{home}</td>
      <td>{away}</td>
    </tr>
  );
}

function SensitivityBar({
  item,
  max,
}: {
  item: SensitivityResult;
  max: number;
}) {
  const width =
    (Math.abs(item.averageGoalDifferenceDelta) / max) * 100;

  return (
    <div className="sensitivity-row">
      <div className="sensitivity-label">
        <strong>{item.stat}</strong>
        <span>
          Δ buts {formatSigned(item.averageGoalDifferenceDelta)} · Δ win rate{" "}
          {formatSigned(item.homeWinRateDelta)} pts
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

function formatSigned(value: number): string {
  return `${value >= 0 ? "+" : ""}${value}`;
}
