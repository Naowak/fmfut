"use client";

import { useState } from "react";
import { PitchCanvas } from "./PitchCanvas";
import type { MatchSimulationOutput } from "@/lib/game/types";

export function MatchSimulator() {
  const [seed, setSeed] = useState("demo-42");
  const [match, setMatch] = useState<MatchSimulationOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSimulation() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/matches/simulate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          seed,
        }),
      });

      const payload = (await response.json()) as
        | MatchSimulationOutput
        | { error: string };

      if (!response.ok || "error" in payload) {
        throw new Error(
          "error" in payload
            ? payload.error
            : "La simulation a échoué.",
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
    <section className="simulator-grid">
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
          <PitchCanvas replay={match.replay} />
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

      <aside className="sidebar">
        <div className="card side-card">
          <h2>Résultat final</h2>
          {match ? (
            <>
              <p style={{ fontSize: 24, fontWeight: 900 }}>
                {match.result.homeScore} — {match.result.awayScore}
              </p>
              <p className="muted">
                {match.result.homeName} vs {match.result.awayName}
              </p>
            </>
          ) : (
            <p className="muted">En attente du premier match.</p>
          )}
        </div>

        <div className="card side-card">
          <h2>Statistiques</h2>
          {match ? (
            <table className="stat-table">
              <tbody>
                <StatRow
                  label="Possession"
                  home={`${match.stats.home.possession}%`}
                  away={`${match.stats.away.possession}%`}
                />
                <StatRow
                  label="Tirs"
                  home={match.stats.home.shots}
                  away={match.stats.away.shots}
                />
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
                <StatRow
                  label="Dribbles"
                  home={match.stats.home.dribbles}
                  away={match.stats.away.dribbles}
                />
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
                <StatRow
                  label="Tacles"
                  home={match.stats.home.tackles}
                  away={match.stats.away.tackles}
                />
                <StatRow
                  label="Fautes"
                  home={match.stats.home.fouls}
                  away={match.stats.away.fouls}
                />
                <StatRow
                  label="Jaunes"
                  home={match.stats.home.yellowCards}
                  away={match.stats.away.yellowCards}
                />
                <StatRow
                  label="Rouges"
                  home={match.stats.home.redCards}
                  away={match.stats.away.redCards}
                />
              </tbody>
            </table>
          ) : (
            <p className="muted">—</p>
          )}
        </div>

        <div className="card side-card">
          <h2>Après-match</h2>
          {match &&
          (match.notifications.injuries.length > 0 ||
            match.notifications.suspensions.length > 0) ? (
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
                  Suspension : {suspension.playerName} —{" "}
                  {suspension.matches} match ({suspension.reason}).
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Aucune notification.</p>
          )}
        </div>
      </aside>
    </section>
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
      <td>{label}</td>
      <td>{home}</td>
      <td>{away}</td>
    </tr>
  );
}
