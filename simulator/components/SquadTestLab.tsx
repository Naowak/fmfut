"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { positionShortLabel, roleLabel } from "@/lib/game/localization";
import type { SpatialSliceKey } from "@/lib/game/types";
import type {
  SquadOpponent,
  SquadPlayerAverage,
  SquadPreviewResponse,
  SquadTeamAverage,
} from "@/lib/squad/api-types";
import { diagnoseSquad, toTeamSelection, type SquadDraft } from "@/lib/squad/builder";
import { emptyWorkspace, loadSquadWorkspace, type SquadWorkspace } from "@/lib/squad/client-storage";

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
  const [workspace, setWorkspace] = useState<SquadWorkspace>(() => emptyWorkspace());
  const [teamId, setTeamId] = useState("");
  const [strategyId, setStrategyId] = useState("");
  const [compareStrategyId, setCompareStrategyId] = useState("");
  const [opponents, setOpponents] = useState<SquadOpponent[]>([]);
  const [opponentId, setOpponentId] = useState("");
  const [runs, setRuns] = useState(30);
  const [seedPrefix, setSeedPrefix] = useState("equipe-2026");
  const [result, setResult] = useState<SquadPreviewResponse | null>(null);
  const [comparison, setComparison] = useState<SquadPreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        const [loadedWorkspace, response] = await Promise.all([
          loadSquadWorkspace(),
          fetch("/api/squad/opponents", { cache: "no-store" }),
        ]);
        const payload = (await response.json()) as SquadOpponent[] | { error: string };
        if (!response.ok || !Array.isArray(payload)) {
          throw new Error(!Array.isArray(payload) && "error" in payload ? payload.error : "Adversaires indisponibles.");
        }
        if (!cancelled) {
          setWorkspace(loadedWorkspace);
          const team = loadedWorkspace.teams.find((item) => item.id === loadedWorkspace.activeTeamId) ?? loadedWorkspace.teams[0];
          const strategy = team?.strategies.find((item) => item.id === loadedWorkspace.activeStrategyId) ?? team?.strategies[0];
          setTeamId(team?.id ?? "");
          setStrategyId(strategy?.id ?? "");
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
  const selectedTeam = workspace.teams.find((item) => item.id === teamId) ?? null;
  const selectedStrategy = selectedTeam?.strategies.find((item) => item.id === strategyId) ?? null;
  const draft: SquadDraft | null = selectedStrategy?.draft ?? null;
  const complete = useMemo(() => draft ? diagnoseSquad(draft).complete : false, [draft]);

  async function runTests() {
    if (!draft || !opponent) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setComparison(null);
    try {
      const requestPreview = async (strategyDraft: SquadDraft, suffix = "") => {
        const response = await fetch("/api/squad/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team: toTeamSelection(strategyDraft),
          opponent: opponent.selection,
          runs,
          seedPrefix: `${seedPrefix}${suffix}`,
        }),
      });
        const payload = (await response.json()) as SquadPreviewResponse | { error: string };
        if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "Tests impossibles.");
        }
        return payload;
      };
      const compareDraft = selectedTeam?.strategies.find((item) => item.id === compareStrategyId)?.draft;
      const [payload, comparisonPayload] = await Promise.all([
        requestPreview(draft),
        compareDraft ? requestPreview(compareDraft) : Promise.resolve(null),
      ]);
      setResult(payload);
      setComparison(comparisonPayload);
      window.setTimeout(() => scrollToPanel(reportRef.current), 80);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Tests impossibles.");
    } finally {
      setRunning(false);
    }
  }

  if (loading) return <section className="card squad-screen-loading">Chargement du laboratoire…</section>;
  if (workspace.teams.length === 0) return (
    <section className="empty-workspace"><h2>Aucune équipe disponible</h2><p>Crée une équipe avant de lancer le simulateur.</p><Link className="primary-button nav-link" href="/squad">Créer une équipe</Link></section>
  );

  return (
    <div className="squad-test-screen">
      <section className="card squad-test-controls">
        <label>Équipe<select value={teamId} onChange={(event) => { const team = workspace.teams.find((item) => item.id === event.target.value); setTeamId(event.target.value); setStrategyId(team?.strategies[0]?.id ?? ""); setResult(null); }}>{workspace.teams.map((team) => <option key={team.id} value={team.id}>{team.emblem} {team.name}</option>)}</select></label>
        <label>Stratégie<select value={strategyId} onChange={(event) => { setStrategyId(event.target.value); if (event.target.value === compareStrategyId) setCompareStrategyId(""); setResult(null); }}>{selectedTeam?.strategies.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.emblem} {strategy.name}</option>)}</select></label>
        <label>Comparer à<select value={compareStrategyId} onChange={(event) => { setCompareStrategyId(event.target.value); setResult(null); }}><option value="">Aucune</option>{selectedTeam?.strategies.filter((strategy) => strategy.id !== strategyId).map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.emblem} {strategy.name}</option>)}</select></label>
        <label>Adversaire<select value={opponentId} onChange={(event) => { setOpponentId(event.target.value); setResult(null); }}>{opponents.map((item) => <option key={item.id} value={item.id}>{item.flag} {item.name}</option>)}</select></label>
        <label>Nombre de matchs<select value={runs} onChange={(event) => { setRuns(Number(event.target.value)); setResult(null); }}><option value={10}>10</option><option value={30}>30</option><option value={50}>50</option><option value={100}>100</option></select></label>
        <label>Seed<input className="text-input" value={seedPrefix} maxLength={80} onChange={(event) => { setSeedPrefix(event.target.value); setResult(null); }} /></label>
        <button className="primary-button" type="button" disabled={!complete || !opponent || running} onClick={runTests}>{running ? `${runs} matchs en cours…` : "Lancer les tests"}</button>
        {!complete && <span className="squad-test-blocking">XI incomplet</span>}
      </section>

      {error && <div className="error-box">{error}</div>}
      {result && (
        <div className="squad-test-report-anchor" ref={reportRef}><SquadTestReport result={result} comparison={comparison} comparisonName={selectedTeam?.strategies.find((item) => item.id === compareStrategyId)?.name} /></div>
      )}
    </div>
  );
}

function scrollToPanel(element: HTMLElement | null) {
  if (!element) return;
  window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 58);
}

function SquadTestReport({ result, comparison, comparisonName }: { result: SquadPreviewResponse; comparison: SquadPreviewResponse | null; comparisonName?: string }) {
  return (
    <div className="squad-test-report">
      <section className="squad-test-outcomes">
        <Outcome label="Victoire" value={result.outcomes.homeWinRate} />
        <Outcome label="Nul" value={result.outcomes.drawRate} />
        <Outcome label="Défaite" value={result.outcomes.awayWinRate} />
        <Outcome label="Fiabilité" value={result.reliability} />
      </section>

      {comparison && (
        <section className="card strategy-comparison-card">
          <h2>Comparaison avec {comparisonName}</h2>
          <div className="strategy-comparison-grid">
            <Outcome label="Écart de victoires" value={`${signed(result.outcomes.homeWinRate - comparison.outcomes.homeWinRate)} pts`} />
            <Outcome label="Écart de buts" value={signed(result.home.goals - comparison.home.goals)} />
            <Outcome label="Écart de tirs" value={signed(result.home.shots - comparison.home.shots)} />
            <Outcome label="Écart de possession" value={`${signed(result.home.possession - comparison.home.possession)} pts`} />
          </div>
        </section>
      )}

      {result.spatial && <SquadSpatialExplorer result={result} />}

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
        <div className="squad-report-heading"><div><span className="config-kicker">ÉQUIPE ANALYSÉE</span><h2>{result.teamName}</h2><p>Statistiques individuelles — moyenne de chaque valeur par match sur {result.runs} simulations.</p></div></div>
        <PlayerReportTable players={result.players.home} />
      </section>

      <section className="card squad-test-section player-report-section">
        <div className="squad-report-heading"><div><span className="config-kicker">ADVERSAIRE</span><h2>{result.opponentName}</h2><p>Statistiques individuelles — moyenne de chaque valeur par match sur {result.runs} simulations.</p></div></div>
        <PlayerReportTable players={result.players.away} />
      </section>
    </div>
  );
}

function SquadSpatialExplorer({ result }: { result: SquadPreviewResponse }) {
  const [side, setSide] = useState<"team" | "opponent">("team");
  const [playerId, setPlayerId] = useState("team");
  const [comparePlayerId, setComparePlayerId] = useState("");
  const [slice, setSlice] = useState<SpatialSliceKey>("ALL");
  const players = side === "team" ? result.players.home : result.players.away;
  const spatial = result.spatial![side];
  const selectedPlayer = playerId === "team" ? null : players.find((player) => player.playerId === Number(playerId)) ?? null;
  const sliceData = spatial.heatmapSlices[slice];
  const values = selectedPlayer ? sliceData.playerHeatmaps[selectedPlayer.playerId] ?? [] : sliceData.allPlayersHeatmap;
  const comparedPlayer = playerId !== "team" && comparePlayerId ? players.find((player) => player.playerId === Number(comparePlayerId)) ?? null : null;
  const comparedValues = comparedPlayer ? sliceData.playerHeatmaps[comparedPlayer.playerId] ?? [] : [];
  const max = Math.max(...values, 1);
  const comparedMax = Math.max(...comparedValues, 1);
  const team = side === "team" ? result.home : result.away;
  const name = side === "team" ? result.teamName : result.opponentName;
  const metrics = selectedPlayer
    ? [
        ["Minutes", selectedPlayer.minutesPlayed], ["Distance", `${selectedPlayer.distanceCovered} km`],
        ["Touches", selectedPlayer.touches], ["Buts", selectedPlayer.goals], ["Passes déc.", selectedPlayer.assists],
        ["Tirs", selectedPlayer.shots], ["Passes réussies", selectedPlayer.passesCompleted],
        ["Récupérations", selectedPlayer.possessionRegains], ["Interceptions", selectedPlayer.interceptions],
        ["Duels gagnés", selectedPlayer.duelsWon], ["Énergie finale", `${selectedPlayer.energyEnd}%`],
      ]
    : [
        ["Possession", `${team.possession}%`], ["Buts", team.goals], ["Tirs", team.shots],
        ["Passes réussies", team.passesCompleted], ["Récupérations", team.possessionRegains],
        ["Duels gagnés", team.duelsWon], ["Largeur du bloc", `${Math.round(spatial.averageBlockWidth * 100)}%`],
        ["Hauteur du bloc", `${Math.round(spatial.averageBlockCenterProgress * 100)}%`],
        ["Joueurs dans le camp adverse", spatial.averagePlayersInAttackingHalf],
      ];

  return (
    <section className="card squad-test-section squad-spatial-section">
      <div className="squad-spatial-controls">
        <div className="segmented-control" aria-label="Équipe observée">
          <button type="button" aria-pressed={side === "team"} onClick={() => { setSide("team"); setPlayerId("team"); setComparePlayerId(""); }}>{result.teamName}</button>
          <button type="button" aria-pressed={side === "opponent"} onClick={() => { setSide("opponent"); setPlayerId("team"); setComparePlayerId(""); }}>{result.opponentName}</button>
        </div>
        <label>Observation<select value={playerId} onChange={(event) => { setPlayerId(event.target.value); setComparePlayerId(""); }}>
          <option value="team">Équipe complète</option>
          {players.map((player) => <option key={player.playerId} value={player.playerId}>{player.playerName}</option>)}
        </select></label>
        <label>Période / phase<select value={slice} onChange={(event) => setSlice(event.target.value as SpatialSliceKey)}><option value="ALL">Match complet</option><option value="FIRST_HALF">Première période</option><option value="SECOND_HALF">Seconde période</option><option value="IN_POSSESSION">Avec ballon</option><option value="OUT_OF_POSSESSION">Sans ballon</option></select></label>
        {playerId !== "team" && <label>Comparer un joueur<select value={comparePlayerId} onChange={(event) => setComparePlayerId(event.target.value)}><option value="">Aucun</option>{players.filter((player) => String(player.playerId) !== playerId).map((player) => <option key={player.playerId} value={player.playerId}>{player.playerName}</option>)}</select></label>}
      </div>
      <div className="squad-spatial-layout">
        <div className="squad-heatmap-pitch" style={{ gridTemplateColumns: `repeat(${result.spatial!.columns}, 1fr)`, gridTemplateRows: `repeat(${result.spatial!.rows}, 1fr)` }} aria-label={`Occupation moyenne — ${selectedPlayer?.playerName ?? name}`}>
          {Array.from({ length: result.spatial!.columns * result.spatial!.rows }, (_, index) => {
            const intensity = (values[index] ?? 0) / max;
            const comparedIntensity = (comparedValues[index] ?? 0) / comparedMax;
            const background = comparedPlayer
              ? `linear-gradient(135deg, rgba(234,112,20,${0.05 + intensity * .9}) 0 50%, rgba(37,99,235,${0.05 + comparedIntensity * .9}) 50% 100%)`
              : `rgba(234, 112, 20, ${0.06 + intensity * 0.88})`;
            return <span key={index} style={{ background }} />;
          })}
          <i className="heatmap-halfway" /><i className="heatmap-circle" /><i className="heatmap-box heatmap-box-top" /><i className="heatmap-box heatmap-box-bottom" />
        </div>
        <div className="squad-spatial-stats">
          <div><span>Occupation moyenne</span><strong>{selectedPlayer?.playerName ?? name}</strong></div>
          {comparedPlayer && <div className="spatial-comparison-legend"><span>Comparaison</span><strong>Orange : {selectedPlayer?.playerName} · Bleu : {comparedPlayer.playerName}</strong></div>}
          {metrics.map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}
        </div>
      </div>
    </section>
  );
}

function PlayerReportTable({ players }: { players: SquadPlayerAverage[] }) {
  return (
    <div className="table-scroll player-table-scroll">
      <table className="squad-report-table player-report-table">
        <thead><tr><th>Joueur</th><th>N°</th><th>Poste</th><th>Rôle</th><th>Statut</th><th>Présence %</th><th>Minutes</th><th>Distance</th><th>Touches</th><th>Buts</th><th>Passes déc.</th><th>CSC</th><th>Tirs</th><th>Cadrés</th><th>Précision %</th><th>Passes</th><th>Réussies</th><th>Réussite %</th><th>Dribbles</th><th>Courses prog.</th><th>Tacles</th><th>Interceptions</th><th>Duels gagnés</th><th>Récupérations</th><th>Fautes</th><th>Jaunes</th><th>Rouges</th><th>Hors-jeu</th><th>Arrêts</th><th>Énergie début</th><th>Énergie fin</th></tr></thead>
        <tbody>{players.map((player) => (
          <tr key={player.playerId}>
            <td>{player.playerName}</td><td>{player.shirtNumber}</td><td>{positionShortLabel(player.position)}</td><td>{roleLabel(player.role)}</td><td>{player.starter ? "Titulaire" : "Banc"}</td><td>{player.appearanceRate}</td><td>{player.minutesPlayed}</td><td>{player.distanceCovered}</td><td>{player.touches}</td><td>{player.goals}</td><td>{player.assists}</td><td>{player.ownGoals}</td><td>{player.shots}</td><td>{player.shotsOnTarget}</td><td>{player.shotAccuracy}</td><td>{player.passesAttempted}</td><td>{player.passesCompleted}</td><td>{player.passCompletion}</td><td>{player.dribbles}</td><td>{player.progressiveRuns}</td><td>{player.tackles}</td><td>{player.interceptions}</td><td>{player.duelsWon}</td><td>{player.possessionRegains}</td><td>{player.fouls}</td><td>{player.yellowCards}</td><td>{player.redCards}</td><td>{player.offsides}</td><td>{player.goalkeeperSaves}</td><td>{player.energyStart}</td><td>{player.energyEnd}</td>
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

function signed(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded >= 0 ? "+" : ""}${rounded}`;
}

function distributionLabel(key: string) {
  return ({ homeGoals: "Buts équipe", awayGoals: "Buts adversaire", goalDifference: "Différentiel", homeShots: "Tirs équipe", homePossession: "Possession équipe" } as Record<string, string>)[key] ?? key;
}
