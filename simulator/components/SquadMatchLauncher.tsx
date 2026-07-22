"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PitchCanvas } from "./PitchCanvas";
import { FORMATION_433 } from "@/lib/game/formations";
import type { MatchSimulationOutput, PlayerCard } from "@/lib/game/types";
import type { SquadOpponent } from "@/lib/squad/api-types";
import { diagnoseSquad, toTeamSelection, type SquadDraft } from "@/lib/squad/builder";
import { loadSquadDraft } from "@/lib/squad/client-storage";

export function SquadMatchLauncher() {
  const [draft, setDraft] = useState<SquadDraft | null>(null);
  const [opponents, setOpponents] = useState<SquadOpponent[]>([]);
  const [opponentId, setOpponentId] = useState("");
  const [match, setMatch] = useState<MatchSimulationOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [matchLoading, setMatchLoading] = useState(false);
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
          seed: `squad-v010-${Date.now()}`,
        }),
      });
      const payload = (await response.json()) as MatchSimulationOutput | { error: string };
      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "Match impossible.");
      }
      setMatch(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Match impossible.");
    } finally {
      setMatchLoading(false);
    }
  }

  if (loading) return <section className="card squad-screen-loading">Chargement des équipes…</section>;

  return (
    <div className="squad-match-screen">
      {error && <div className="error-box">{error}</div>}
      <div className="squad-match-setup">
        <section className="card squad-match-team-card">
          <span className="config-kicker">VOTRE ÉQUIPE</span>
          <h2>{draft?.name ?? "Équipe indisponible"}</h2>
          <div className="match-team-status">
            <strong>{diagnostics?.filledSlots ?? 0}/11</strong>
            <span>{diagnostics?.complete ? "Prête à jouer" : "Composition incomplète"}</span>
          </div>
          {draft && <CompactRoster players={Object.values(draft.starters).filter((player): player is PlayerCard => Boolean(player))} />}
          <Link className="control-button nav-link" href="/squad">Modifier l’équipe</Link>
        </section>

        <section className="card squad-opponent-card">
          <span className="config-kicker">ADVERSAIRE PRÉCOMPOSÉ</span>
          <h2>Choisir une sélection</h2>
          <label className="squad-select-field">
            Équipe
            <select value={opponentId} onChange={(event) => { setOpponentId(event.target.value); setMatch(null); }}>
              {opponents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          {opponent && (
            <>
              <div className="opponent-lineup">
                {FORMATION_433.map((slot) => {
                  const player = opponent.players.find(
                    (candidate) => candidate.playerId === opponent.selection.starters[slot.id],
                  );
                  return <div key={slot.id}><span>{slot.id}</span><strong>{player?.shortName ?? "—"}</strong><small>{player?.overall ?? ""}</small></div>;
                })}
              </div>
              <p className="muted opponent-note">XI de référence généré avec les meilleurs joueurs compatibles du dataset. Il ne prétend pas reproduire une feuille de match officielle.</p>
            </>
          )}
          <button className="primary-button match-launch-button" type="button" disabled={!diagnostics?.complete || !opponent || matchLoading} onClick={launchMatch}>
            {matchLoading ? "Simulation du match…" : `Jouer contre ${opponent?.name ?? "l’adversaire"}`}
          </button>
        </section>
      </div>

      {match && (
        <section className="card squad-replay-card">
          <div className="squad-section-title">
            <div><span className="config-kicker">MATCH PRÊT</span><h2>{match.result.homeName} contre {match.result.awayName}</h2></div>
          </div>
          <PitchCanvas replay={match.replay} homeColor="#22c55e" awayColor="#ef4444" pitchMaxWidth={680} />
        </section>
      )}
    </div>
  );
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
