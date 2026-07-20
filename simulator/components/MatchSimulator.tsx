"use client";

import { useState } from "react";
import { PitchCanvas } from "./PitchCanvas";
import type { MatchSimulationOutput } from "@/lib/game/types";

const TEAM_COLORS = [
  { label: "Bleu", value: "#2563eb" },
  { label: "Rouge", value: "#dc2626" },
  { label: "Orange", value: "#ea580c" },
  { label: "Jaune", value: "#eab308" },
  { label: "Vert", value: "#16a34a" },
  { label: "Violet", value: "#9333ea" },
  { label: "Cyan", value: "#0891b2" },
  { label: "Blanc", value: "#f8fafc" },
];

export function MatchSimulator() {
  const [seed, setSeed] = useState("demo-42");
  const [homeColor, setHomeColor] = useState("#2563eb");
  const [awayColor, setAwayColor] = useState("#dc2626");
  const [match, setMatch] = useState<MatchSimulationOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSimulation() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/matches/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed }),
      });

      const payload = (await response.json()) as
        | MatchSimulationOutput
        | { error: string };

      if (!response.ok || "error" in payload) {
        throw new Error(
          "error" in payload ? payload.error : "La simulation a échoué.",
        );
      }

      setMatch(payload);
    } catch (simulationError) {
      setError(
        simulationError instanceof Error
          ? simulationError.message
          : "Erreur inconnue.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="simulator-shell">
      <div className="card main-card">
        <div className="toolbar">
          <div className="field-group">
            <label htmlFor="seed">Seed déterministe</label>
            <input
              id="seed"
              className="text-input"
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
            />
          </div>

          <ColorSelect
            id="home-color"
            label="Votre équipe"
            value={homeColor}
            onChange={setHomeColor}
            disabledValue={awayColor}
          />

          <ColorSelect
            id="away-color"
            label="Adversaire"
            value={awayColor}
            onChange={setAwayColor}
            disabledValue={homeColor}
          />

          <button
            type="button"
            className="primary-button"
            onClick={runSimulation}
            disabled={loading}
          >
            {loading ? "Simulation…" : "Simuler le match"}
          </button>

          <button
            type="button"
            className="control-button"
            onClick={() =>
              setSeed(
                `match-${new Date().toISOString()}-${Math.random()
                  .toString(36)
                  .slice(2, 8)}`,
              )
            }
          >
            Nouvelle seed
          </button>
        </div>

        {error && <div className="error-box">{error}</div>}

        {match ? (
          <PitchCanvas
            replay={match.replay}
            homeColor={homeColor}
            awayColor={awayColor}
          />
        ) : (
          <div className="empty-state">
            <div>
              <h2>Aucun match simulé</h2>
              <p>
                Lance une simulation. Le serveur calcule le match entier,
                puis le viewer lit le replay reçu.
              </p>
            </div>
          </div>
        )}
      </div>

      {match && (
        <div className="match-bottom-grid">
          <section className="card side-card match-stats-card">
            <div className="bottom-card-header">
              <div>
                <span className="muted">Résultat final</span>
                <h2>
                  {match.result.homeName} {match.result.homeScore} — {match.result.awayScore}{" "}
                  {match.result.awayName}
                </h2>
              </div>
            </div>

            <table className="stat-table stat-table-wide">
              <thead>
                <tr>
                  <th>{match.result.homeName}</th>
                  <th>Statistique</th>
                  <th>{match.result.awayName}</th>
                </tr>
              </thead>
              <tbody>
                <StatRow
                  label="Possession"
                  home={`${match.stats.home.possession}%`}
                  away={`${match.stats.away.possession}%`}
                />
                <StatRow label="Tirs" home={match.stats.home.shots} away={match.stats.away.shots} />
                <StatRow
                  label="Cadrés"
                  home={match.stats.home.shotsOnTarget}
                  away={match.stats.away.shotsOnTarget}
                />
                <StatRow
                  label="Passes"
                  home={`${match.stats.home.passesCompleted}/${match.stats.home.passesAttempted}`}
                  away={`${match.stats.away.passesCompleted}/${match.stats.away.passesAttempted}`}
                />
                <StatRow label="Dribbles" home={match.stats.home.dribbles} away={match.stats.away.dribbles} />
                <StatRow
                  label="Appels"
                  home={match.stats.home.progressiveRuns}
                  away={match.stats.away.progressiveRuns}
                />
                <StatRow
                  label="Duels gagnés"
                  home={match.stats.home.duelsWon}
                  away={match.stats.away.duelsWon}
                />
                <StatRow label="Tacles" home={match.stats.home.tackles} away={match.stats.away.tackles} />
                <StatRow label="Fautes" home={match.stats.home.fouls} away={match.stats.away.fouls} />
                <StatRow label="Jaunes" home={match.stats.home.yellowCards} away={match.stats.away.yellowCards} />
                <StatRow label="Rouges" home={match.stats.home.redCards} away={match.stats.away.redCards} />
                <StatRow
                  label="Énergie moyenne des titulaires"
                  home={`${match.stats.home.averageStarterEnergy}%`}
                  away={`${match.stats.away.averageStarterEnergy}%`}
                />
              </tbody>
            </table>
          </section>

          <section className="card side-card post-match-card">
            <h2>Après-match</h2>
            {match.notifications.injuries.length > 0 ||
            match.notifications.suspensions.length > 0 ? (
              <div className="event-list">
                {match.notifications.injuries.map((injury) => (
                  <div
                    className="event-item"
                    key={`injury-${injury.team}-${injury.playerId}`}
                  >
                    Blessure : {injury.playerName} — indisponible{" "}
                    {injury.unavailableMatches} match.
                  </div>
                ))}
                {match.notifications.suspensions.map((suspension) => (
                  <div
                    className="event-item"
                    key={`susp-${suspension.team}-${suspension.playerId}`}
                  >
                    Suspension : {suspension.playerName} — {suspension.matches} match ({suspension.reason}).
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Aucune notification.</p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function ColorSelect({
  id,
  label,
  value,
  onChange,
  disabledValue,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabledValue: string;
}) {
  return (
    <div className="field-group color-field">
      <label htmlFor={id}>{label}</label>
      <div className="color-select-wrap">
        <span className="color-dot" style={{ background: value }} />
        <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
          {TEAM_COLORS.map((color) => (
            <option
              key={color.value}
              value={color.value}
              disabled={color.value === disabledValue}
            >
              {color.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function StatRow({
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
      <td>{home}</td>
      <td>{label}</td>
      <td>{away}</td>
    </tr>
  );
}
