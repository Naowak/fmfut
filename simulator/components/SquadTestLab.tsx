"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  SquadOpponent,
  SquadPlayerAverage,
  SquadPreviewResponse,
  SquadTeamAverage,
} from "@/lib/squad/api-types";
import { diagnoseSquad, toTeamSelection, type SquadDraft } from "@/lib/squad/builder";
import { loadSquadDraft } from "@/lib/squad/client-storage";

const TEAM_METRICS: Array<{ key: keyof SquadTeamAverage; label: string; suffix?: string }> = [
  { key: "goals", label: "Buts" },
  { key: "shots", label: "Tirs" },
  { key: "shotsOnTarget", label: "Tirs cadrés" },
  { key: "shotConversion", label: "Conversion des tirs", suffix: "%" },
  { key: "passesAttempted", label: "Passes tentées" },
  { key: "passesCompleted", label: "Passes réussies" },
  { key: "passCompletion", label: "Réussite des passes", suffix: "%" },
  { key: "backwardPasses", label: "Passes arrière" },
  { key: "goalkeeperBackPasses", label: "Remises au gardien" },
  { key: "ownGoals", label: "Buts contre son camp" },
  { key: "possession", label: "Possession", suffix: "%" },
  { key: "dribbles", label: "Dribbles" },
  { key: "progressiveRuns", label: "Courses progressives" },
  { key: "duelsWon", label: "Duels gagnés" },
  { key: "transitionShots", label: "Tirs en transition" },
  { key: "possessionRegains", label: "Récupérations" },
  { key: "tackles", label: "Tacles" },
  { key: "fouls", label: "Fautes" },
  { key: "yellowCards", label: "Cartons jaunes" },
  { key: "redCards", label: "Cartons rouges" },
  { key: "offsides", label: "Hors-jeu" },
  { key: "throwIns", label: "Touches" },
  { key: "corners", label: "Corners" },
  { key: "goalKicks", label: "Six mètres" },
  { key: "freeKicks", label: "Coups francs" },
  { key: "penalties", label: "Penalties" },
  { key: "goalkeeperSaves", label: "Arrêts du gardien" },
  { key: "goalsFromSetPieces", label: "Buts sur phase arrêtée" },
  { key: "substitutions", label: "Remplacements" },
  { key: "averageStarterEnergy", label: "Énergie finale des titulaires", suffix: "%" },
];

export function SquadTestLab() {
  const [draft, setDraft] = useState<SquadDraft | null>(null);
  const [opponents, setOpponents] = useState<SquadOpponent[]>([]);
  const [opponentId, setOpponentId] = useState("");
  const [runs, setRuns] = useState(30);
  const [result, setResult] = useState<SquadPreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        const [loadedDraft, response] = await Promise.all([
          loadSquadDraft(),
          fetch("/api/squad/opponents"),
        ]);
        const payload = (await response.json()) as SquadOpponent[] | { error: string };
        if (!response.ok || !Array.isArray(payload)) {
          throw new Error(!Array.isArray(payload) && "error" in payload ? payload.error : "Adversaires indisponibles.");
        }
        if (!cancelled) {
          setDraft(loadedDraft);
          setOpponents(payload);
          setOpponentId(payload[0]?.id ?? "");
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Chargement impossible.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void hydrate();
    return () => { cancelled = true; };
  }, []);

  const opponent = opponents.find((item) => item.id === opponentId) ?? null;
  const complete = useMemo(() => draft ? diagnoseSquad(draft).complete : false, [draft]);

  async function runTests() {
    if (!draft || !opponent) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/squad/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team: toTeamSelection(draft),
          opponent: opponent.selection,
          runs,
        }),
      });
      const payload = (await response.json()) as SquadPreviewResponse | { error: string };
      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "Tests impossibles.");
      }
      setResult(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Tests impossibles.");
    } finally {
      setRunning(false);
    }
  }

  if (loading) return <section className="card squad-screen-loading">Chargement du laboratoire…</section>;

  return (
    <div className="squad-test-screen">
      <section className="card squad-test-controls">
        <div>
          <span className="config-kicker">COMPOSITION ANALYSÉE</span>
          <h2>{draft?.name ?? "Équipe indisponible"}</h2>
          {!complete && <p className="squad-test-blocking">Le XI doit être complet avant de lancer les tests.</p>}
        </div>
        <label>Adversaire<select value={opponentId} onChange={(event) => { setOpponentId(event.target.value); setResult(null); }}>{opponents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Nombre de matchs<select value={runs} onChange={(event) => { setRuns(Number(event.target.value)); setResult(null); }}><option value={10}>10</option><option value={30}>30</option><option value={50}>50</option><option value={100}>100</option></select></label>
        <button className="primary-button" type="button" disabled={!complete || !opponent || running} onClick={runTests}>{running ? `${runs} matchs en cours…` : "Lancer les tests"}</button>
        <Link className="control-button nav-link" href="/squad">Modifier l’équipe</Link>
      </section>

      {error && <div className="error-box">{error}</div>}
      {!result ? (
        <section className="card squad-test-empty"><h2>Rapport prêt à être généré</h2><p>Le rapport affichera les moyennes collectives et toutes les statistiques individuelles récupérées par le moteur.</p></section>
      ) : (
        <SquadTestReport result={result} />
      )}
    </div>
  );
}

function SquadTestReport({ result }: { result: SquadPreviewResponse }) {
  return (
    <div className="squad-test-report">
      <section className="squad-test-outcomes">
        <Outcome label="Victoire" value={result.outcomes.homeWinRate} />
        <Outcome label="Nul" value={result.outcomes.drawRate} />
        <Outcome label="Défaite" value={result.outcomes.awayWinRate} />
        <Outcome label="Fiabilité" value={result.reliability} />
      </section>

      <section className="card squad-test-section">
        <div className="squad-report-heading"><div><span className="config-kicker">{result.runs} SIMULATIONS</span><h2>Statistiques collectives</h2><p>Moyenne par match contre {result.opponentName}.</p></div></div>
        <div className="table-scroll">
          <table className="squad-report-table team-report-table">
            <thead><tr><th>Métrique</th><th>{result.teamName}</th><th>{result.opponentName}</th></tr></thead>
            <tbody>{TEAM_METRICS.map((metric) => <tr key={metric.key}><td>{metric.label}</td><td>{formatValue(result.home[metric.key], metric.suffix)}</td><td>{formatValue(result.away[metric.key], metric.suffix)}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="card squad-test-section">
        <div className="squad-report-heading"><div><span className="config-kicker">INCERTITUDE</span><h2>Distribution des résultats</h2><p>Moyenne, médiane et intervalle P05–P95 sur la série.</p></div></div>
        <div className="distribution-grid">
          {Object.entries(result.distributions).map(([key, values]) => (
            <div key={key}><span>{distributionLabel(key)}</span><strong>{values.mean}</strong><small>P05 {values.p05} · médiane {values.median} · P95 {values.p95}</small></div>
          ))}
        </div>
      </section>

      <section className="card squad-test-section player-report-section">
        <div className="squad-report-heading"><div><span className="config-kicker">TOUS LES JOUEURS</span><h2>Statistiques individuelles exhaustives</h2><p>Moyenne de chaque statistique par match sur {result.runs} simulations.</p></div></div>
        <PlayerReportTable players={result.players} />
      </section>
    </div>
  );
}

function PlayerReportTable({ players }: { players: SquadPlayerAverage[] }) {
  return (
    <div className="table-scroll player-table-scroll">
      <table className="squad-report-table player-report-table">
        <thead><tr><th>Joueur</th><th>N°</th><th>Poste</th><th>Rôle</th><th>Statut</th><th>Présence %</th><th>Minutes</th><th>Distance</th><th>Touches</th><th>Buts</th><th>Passes déc.</th><th>CSC</th><th>Tirs</th><th>Cadrés</th><th>Précision %</th><th>Passes</th><th>Réussies</th><th>Réussite %</th><th>Dribbles</th><th>Courses prog.</th><th>Tacles</th><th>Interceptions</th><th>Duels gagnés</th><th>Récupérations</th><th>Fautes</th><th>Jaunes</th><th>Rouges</th><th>Hors-jeu</th><th>Arrêts</th><th>Énergie début</th><th>Énergie fin</th></tr></thead>
        <tbody>{players.map((player) => (
          <tr key={player.playerId}>
            <td>{player.playerName}</td><td>{player.shirtNumber}</td><td>{player.position ?? "—"}</td><td>{player.role}</td><td>{player.starter ? "Titulaire" : "Banc"}</td><td>{player.appearanceRate}</td><td>{player.minutesPlayed}</td><td>{player.distanceCovered}</td><td>{player.touches}</td><td>{player.goals}</td><td>{player.assists}</td><td>{player.ownGoals}</td><td>{player.shots}</td><td>{player.shotsOnTarget}</td><td>{player.shotAccuracy}</td><td>{player.passesAttempted}</td><td>{player.passesCompleted}</td><td>{player.passCompletion}</td><td>{player.dribbles}</td><td>{player.progressiveRuns}</td><td>{player.tackles}</td><td>{player.interceptions}</td><td>{player.duelsWon}</td><td>{player.possessionRegains}</td><td>{player.fouls}</td><td>{player.yellowCards}</td><td>{player.redCards}</td><td>{player.offsides}</td><td>{player.goalkeeperSaves}</td><td>{player.energyStart}</td><td>{player.energyEnd}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function Outcome({ label, value }: { label: string; value: string | number }) {
  return <div className="card"><span>{label}</span><strong>{typeof value === "number" ? `${value}%` : value}</strong></div>;
}

function formatValue(value: number, suffix = "") {
  return `${value}${suffix}`;
}

function distributionLabel(key: string) {
  return ({ homeGoals: "Buts équipe", awayGoals: "Buts adversaire", goalDifference: "Différentiel", homeShots: "Tirs équipe", homePossession: "Possession équipe" } as Record<string, string>)[key] ?? key;
}
