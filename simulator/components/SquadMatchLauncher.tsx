"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { PitchCanvas } from "./PitchCanvas";
import { getFormation } from "@/lib/game/formations";
import { slotLabel } from "@/lib/game/localization";
import type { MatchSimulationOutput, PlayerCard } from "@/lib/game/types";
import type { SquadOpponent } from "@/lib/squad/api-types";
import { diagnoseSquad, toTeamSelection, type SquadDraft } from "@/lib/squad/builder";
import { emptyWorkspace, loadSquadWorkspace, type SquadWorkspace } from "@/lib/squad/client-storage";

export function SquadMatchLauncher() {
  const [workspace, setWorkspace] = useState<SquadWorkspace>(() => emptyWorkspace());
  const [teamId, setTeamId] = useState("");
  const [strategyId, setStrategyId] = useState("");
  const [opponents, setOpponents] = useState<SquadOpponent[]>([]);
  const [opponentId, setOpponentId] = useState("");
  const [match, setMatch] = useState<MatchSimulationOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [matchLoading, setMatchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const replayRef = useRef<HTMLElement | null>(null);

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
  const diagnostics = useMemo(() => draft ? diagnoseSquad(draft) : null, [draft]);

  async function launchMatch() {
    if (!draft || !opponent) return;
    setMatchLoading(true);
    setError(null);
    setMatch(null);
    try {
      const response = await fetch("/api/matches/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          home: toTeamSelection(draft),
          away: opponent.selection,
          seed: `squad-v012-${Date.now()}`,
        }),
      });
      const payload = (await response.json()) as MatchSimulationOutput | { error: string };
      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "Match impossible.");
      }
      setMatch(payload);
      window.setTimeout(() => scrollToPanel(replayRef.current), 80);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Match impossible.");
    } finally {
      setMatchLoading(false);
    }
  }

  if (loading) return <section className="card squad-screen-loading">Chargement des équipes…</section>;
  if (workspace.teams.length === 0) return (
    <section className="empty-workspace">
      <h2>Aucune équipe disponible</h2>
      <p>Crée une équipe avant de lancer un match.</p>
      <Link className="primary-button nav-link" href="/squad">Créer une équipe</Link>
    </section>
  );

  return (
    <div className="squad-match-screen">
      {error && <div className="error-box">{error}</div>}
      <div className="squad-match-setup">
        <section className="card squad-match-team-card">
          <label className="squad-select-field">Équipe<select value={teamId} onChange={(event) => {
            const team = workspace.teams.find((item) => item.id === event.target.value);
            setTeamId(event.target.value); setStrategyId(team?.strategies[0]?.id ?? ""); setMatch(null);
          }}>{workspace.teams.map((team) => <option key={team.id} value={team.id}>{team.emblem} {team.name}</option>)}</select></label>
          <label className="squad-select-field">Stratégie<select value={strategyId} onChange={(event) => { setStrategyId(event.target.value); setMatch(null); }}>{selectedTeam?.strategies.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.emblem} {strategy.name}</option>)}</select></label>
          <div className="match-team-status">
            <strong>{diagnostics?.filledSlots ?? 0}/11</strong>
            <span>{diagnostics?.complete ? "Prête à jouer" : "Composition incomplète"}</span>
          </div>
          {draft && <CompactRoster players={Object.values(draft.starters).filter((player): player is PlayerCard => Boolean(player))} />}
        </section>

        <section className="card squad-opponent-card">
          <h2>{opponent ? `${opponent.flag} ${opponent.name}` : "Choisir une sélection"}</h2>
          <label className="squad-select-field">
            Équipe
            <select value={opponentId} onChange={(event) => { setOpponentId(event.target.value); setMatch(null); }}>
              {opponents.map((item) => <option key={item.id} value={item.id}>{item.flag} {item.name}</option>)}
            </select>
          </label>
          {opponent && (
            <>
              <div className="opponent-lineup">
                {getFormation(opponent.selection.formationId).map((slot) => {
                  const player = opponent.players.find(
                    (candidate) => candidate.playerId === opponent.selection.starters[slot.id],
                  );
                  return <div key={slot.id}><span>{slotLabel(slot.id)}</span><strong>{player?.shortName ?? "—"}</strong><small>{player?.overall ?? ""}</small></div>;
                })}
              </div>
              <div className="opponent-bench">
                <strong>Remplaçants</strong>
                <span>{opponent.selection.bench.map((id) => opponent.players.find((player) => player.playerId === id)?.shortName ?? "—").join(" · ")}</span>
              </div>
              {opponent.syntheticPlayers > 0 && (
                <p className="muted opponent-note">
                  {opponent.syntheticPlayers} réserviste(s) généré(s) pour compléter le dataset.
                </p>
              )}
            </>
          )}
          <button className="primary-button match-launch-button" type="button" disabled={!diagnostics?.complete || !opponent || matchLoading} onClick={launchMatch}>
            {matchLoading ? "Simulation du match…" : `Jouer contre ${opponent?.name ?? "l’adversaire"}`}
          </button>
        </section>
      </div>

      {match && (
        <section className="card squad-replay-card" ref={replayRef}>
          <PitchCanvas replay={match.replay} homeColor="#f59e0b" awayColor="#ef4444" homeBadge={selectedTeam?.emblem} awayBadge={opponent?.flag} pitchMaxWidth={760} fitViewport />
        </section>
      )}
    </div>
  );
}

function scrollToPanel(element: HTMLElement | null) {
  if (!element) return;
  window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 58);
}

function CompactRoster({ players }: { players: PlayerCard[] }) {
  return (
    <div className="compact-roster">
      {players.map((player) => (
        <span key={player.playerId}><b>{player.overall}</b>{player.shortName}</span>
      ))}
    </div>
  );
}
