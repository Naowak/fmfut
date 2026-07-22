"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PitchCanvas } from "./PitchCanvas";
import { FORMATION_433 } from "@/lib/game/formations";
import type {
  MatchSimulationOutput,
  PlayerCard,
  Position,
  Role,
} from "@/lib/game/types";
import type {
  PositionBenchmarks,
  SquadBootstrapResponse,
  SquadPreviewResponse,
} from "@/lib/squad/api-types";
import { estimatePercentile } from "@/lib/squad/benchmarks";
import {
  addPlayerToBench,
  allDraftPlayers,
  assignPlayerToSlot,
  createEmptyDraft,
  createSnapshot,
  diagnoseSquad,
  draftFromSelection,
  parseSnapshot,
  playerInDraft,
  removePlayer,
  roleFitScore,
  SQUAD_SLOT_IDS,
  toTeamSelection,
  type SquadDraft,
  type SquadSlotId,
} from "@/lib/squad/builder";

const STORAGE_KEY = "fmfut:squad-builder:v1";
const POSITIONS: Array<"" | Position> = [
  "", "GK", "LB", "CB", "RB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST",
];
const ROLES: Role[] = ["DEFENSIVE", "NORMAL", "OFFENSIVE", "CREATOR", "PRESSING"];
const STATS = ["speed", "shooting", "passing", "physical", "technique", "intelligence"] as const;
const STAT_LABELS: Record<(typeof STATS)[number], string> = {
  speed: "VIT", shooting: "TIR", passing: "PAS", physical: "PHY", technique: "TEC", intelligence: "INT",
};

type SearchPayload = {
  items: PlayerCard[];
  page: number;
  total: number;
  totalPages: number;
};

export function SquadBuilder() {
  const [draft, setDraft] = useState<SquadDraft>(() => createEmptyDraft());
  const [selectedSlot, setSelectedSlot] = useState<SquadSlotId>("ST");
  const [candidate, setCandidate] = useState<PlayerCard | null>(null);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<"" | Position>("");
  const [nation, setNation] = useState("");
  const [minOverall, setMinOverall] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState<SearchPayload>({ items: [], page: 1, total: 0, totalPages: 0 });
  const [searchLoading, setSearchLoading] = useState(true);
  const [benchmarks, setBenchmarks] = useState<PositionBenchmarks[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<SquadPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [match, setMatch] = useState<MatchSimulationOutput | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [mobileTab, setMobileTab] = useState<"SEARCH" | "TEAM" | "ANALYSIS">("TEAM");
  const importRef = useRef<HTMLInputElement>(null);

  const diagnostics = useMemo(() => diagnoseSquad(draft), [draft]);
  const selectedPlayer = draft.starters[selectedSlot] ?? null;
  const selectedFormationSlot = FORMATION_433.find((slot) => slot.id === selectedSlot)!;
  const selectedBenchmark = benchmarks.find(
    (benchmark) => benchmark.position === selectedFormationSlot.position,
  );

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const snapshot = parseSnapshot(stored);
          if (!cancelled) setDraft(snapshot.draft);
        } else {
          const response = await fetch("/api/squad/bootstrap");
          const payload = (await response.json()) as SquadBootstrapResponse | { error: string };
          if (!response.ok || "error" in payload) throw new Error("error" in payload ? payload.error : "Chargement impossible.");
          if (!cancelled) setDraft(draftFromSelection(payload.selection, payload.players));
        }
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Chargement impossible.");
      }
    }
    void hydrate();
    fetch("/api/players/benchmarks")
      .then((response) => response.json())
      .then((payload: PositionBenchmarks[]) => {
        if (!cancelled) setBenchmarks(payload);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: "20" });
        if (query.trim()) params.set("query", query.trim());
        if (position) params.set("position", position);
        if (nation.trim()) params.set("nation", nation.trim());
        if (minOverall) params.set("minOverall", minOverall);
        const response = await fetch(`/api/players?${params}`, { signal: controller.signal });
        const payload = (await response.json()) as SearchPayload | { error: string };
        if (!response.ok || "error" in payload) throw new Error("error" in payload ? payload.error : "Recherche impossible.");
        setSearch(payload);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setMessage(error instanceof Error ? error.message : "Recherche impossible.");
      } finally {
        setSearchLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, position, nation, minOverall, page]);

  function updateDraft(updater: (current: SquadDraft) => SquadDraft) {
    setDraft((current) => updater(current));
    setPreview(null);
    setMatch(null);
  }

  function placeInSlot(player: PlayerCard, slotId = selectedSlot) {
    updateDraft((current) => assignPlayerToSlot(current, slotId, player));
    setCandidate(player);
    setSelectedSlot(slotId);
    setMobileTab("TEAM");
  }

  function placeOnBench(player: PlayerCard) {
    const alreadyOnBench = draft.bench.some(
      (candidate) => candidate.playerId === player.playerId,
    );
    if (draft.bench.length >= 7 && !alreadyOnBench) {
      setMessage("Le banc V1 est limité à 7 joueurs.");
      return;
    }
    updateDraft((current) => addPlayerToBench(current, player));
  }

  function handleDrop(slotId: SquadSlotId | "BENCH", playerId: number) {
    const player = allDraftPlayers(draft).find((item) => item.playerId === playerId)
      ?? search.items.find((item) => item.playerId === playerId);
    if (!player) return;
    if (slotId === "BENCH") placeOnBench(player);
    else placeInSlot(player, slotId);
  }

  async function loadDemo() {
    try {
      const response = await fetch("/api/squad/bootstrap");
      const payload = (await response.json()) as SquadBootstrapResponse | { error: string };
      if (!response.ok || "error" in payload) throw new Error("error" in payload ? payload.error : "Chargement impossible.");
      setDraft(draftFromSelection(payload.selection, payload.players));
      setMessage("Équipe de démonstration chargée.");
      setPreview(null);
      setMatch(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Chargement impossible.");
    }
  }

  function saveLocal() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(createSnapshot(draft)));
    setMessage("Composition sauvegardée sur cet appareil.");
  }

  function exportSquad() {
    const blob = new Blob([JSON.stringify(createSnapshot(draft), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${draft.name.trim().replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "mon-xi"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importSquad(file: File) {
    try {
      const snapshot = parseSnapshot(await file.text());
      setDraft(snapshot.draft);
      setMessage("Composition importée.");
      setPreview(null);
      setMatch(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import impossible.");
    }
  }

  async function runPreview() {
    setPreviewLoading(true);
    setMessage(null);
    try {
      const team = toTeamSelection(draft);
      const response = await fetch("/api/squad/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team, runs: 30 }),
      });
      const payload = (await response.json()) as SquadPreviewResponse | { error: string };
      if (!response.ok || "error" in payload) throw new Error("error" in payload ? payload.error : "Aperçu impossible.");
      setPreview(payload);
      setMobileTab("ANALYSIS");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Aperçu impossible.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function launchMatch() {
    setMatchLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/matches/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          home: toTeamSelection(draft),
          seed: `squad-v1-${Date.now()}`,
        }),
      });
      const payload = (await response.json()) as MatchSimulationOutput | { error: string };
      if (!response.ok || "error" in payload) throw new Error("error" in payload ? payload.error : "Match impossible.");
      setMatch(payload);
      window.setTimeout(() => document.getElementById("squad-match")?.scrollIntoView({ behavior: "smooth" }), 0);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Match impossible.");
    } finally {
      setMatchLoading(false);
    }
  }

  return (
    <div className="squad-builder-shell">
      <nav className="squad-mobile-tabs" aria-label="Sections du Squad Builder">
        {(["SEARCH", "TEAM", "ANALYSIS"] as const).map((tab) => (
          <button key={tab} type="button" data-active={mobileTab === tab} onClick={() => setMobileTab(tab)}>
            {tab === "SEARCH" ? "Joueurs" : tab === "TEAM" ? "Équipe" : "Analyse"}
          </button>
        ))}
      </nav>

      <aside className="card squad-search-panel" data-mobile-active={mobileTab === "SEARCH"}>
        <div className="squad-panel-heading">
          <div><span className="config-kicker">18 405 JOUEURS</span><h2>Explorer</h2></div>
          <span className="squad-count">{search.total.toLocaleString("fr-FR")}</span>
        </div>
        <div className="squad-search-filters">
          <input className="text-input" aria-label="Rechercher un joueur" placeholder="Nom du joueur…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
          <div className="squad-filter-row">
            <select aria-label="Filtrer par poste" value={position} onChange={(event) => { setPosition(event.target.value as "" | Position); setPage(1); }}>
              {POSITIONS.map((item) => <option key={item || "ALL"} value={item}>{item || "Tous postes"}</option>)}
            </select>
            <input aria-label="Overall minimum" type="number" min={1} max={100} placeholder="OVR min" value={minOverall} onChange={(event) => { setMinOverall(event.target.value); setPage(1); }} />
          </div>
          <input className="text-input" aria-label="Filtrer par nationalité" placeholder="Nationalité…" value={nation} onChange={(event) => { setNation(event.target.value); setPage(1); }} />
        </div>
        <div className="player-search-results" aria-busy={searchLoading}>
          {searchLoading ? <p className="muted squad-loading">Recherche…</p> : search.items.map((player) => (
            <PlayerSearchCard
              key={player.playerId}
              player={player}
              selected={candidate?.playerId === player.playerId}
              inSquad={playerInDraft(draft, player.playerId)}
              targetSlot={selectedSlot}
              onSelect={() => setCandidate(player)}
              onPlace={() => placeInSlot(player)}
              onBench={() => placeOnBench(player)}
            />
          ))}
        </div>
        <div className="squad-pagination">
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Précédent</button>
          <span>{page} / {Math.max(1, search.totalPages)}</span>
          <button type="button" disabled={page >= search.totalPages} onClick={() => setPage((value) => value + 1)}>Suivant</button>
        </div>
      </aside>

      <main className="squad-team-column" data-mobile-active={mobileTab === "TEAM"}>
        <section className="card squad-team-toolbar">
          <div className="squad-name-field">
            <label htmlFor="squad-name">Nom de l’équipe</label>
            <input id="squad-name" value={draft.name} onChange={(event) => updateDraft((current) => ({ ...current, name: event.target.value }))} />
          </div>
          <div className="squad-toolbar-actions">
            <button type="button" onClick={loadDemo}>Équipe démo</button>
            <button type="button" onClick={() => updateDraft(() => createEmptyDraft())}>Vider</button>
            <button type="button" onClick={saveLocal}>Sauvegarder</button>
            <button type="button" onClick={exportSquad}>Exporter</button>
            <button type="button" onClick={() => importRef.current?.click()}>Importer</button>
            <input ref={importRef} type="file" accept="application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importSquad(file); event.target.value = ""; }} />
          </div>
        </section>

        {message && <div className="squad-message" role="status">{message}</div>}

        <section className="squad-pitch" aria-label="Terrain 4-3-3">
          <div className="squad-pitch-markings" />
          {FORMATION_433.map((slot) => {
            const slotId = slot.id as SquadSlotId;
            const player = draft.starters[slotId];
            const slotDiagnostic = diagnostics.slots.find((item) => item.slotId === slotId);
            return (
              <div
                key={slot.id}
                className="squad-slot-wrap"
                style={{ left: `${slot.anchor.y * 100}%`, top: `${(1 - slot.anchor.x) * 100}%` }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); handleDrop(slotId, Number(event.dataTransfer.getData("text/player-id"))); }}
              >
                <button
                  type="button"
                  className="squad-slot"
                  data-selected={selectedSlot === slotId}
                  data-compatibility={slotDiagnostic?.compatibilityLabel ?? "EMPTY"}
                  draggable={Boolean(player)}
                  onDragStart={(event) => player && event.dataTransfer.setData("text/player-id", String(player.playerId))}
                  onClick={() => {
                    setSelectedSlot(slotId);
                    if (candidate) placeInSlot(candidate, slotId);
                  }}
                  aria-label={player ? `${slotId}, ${player.shortName}` : `${slotId}, vide`}
                >
                  <span className="squad-slot-position">{slotId}</span>
                  {player ? (
                    <><strong>{player.shortName}</strong><span>{player.overall} · {player.primaryPosition}</span></>
                  ) : <span className="squad-slot-empty">Ajouter</span>}
                </button>
                {player && (
                  <div className="slot-actions">
                    <select aria-label={`Rôle de ${player.shortName}`} value={draft.roles[slotId] ?? "NORMAL"} onChange={(event) => updateDraft((current) => ({ ...current, roles: { ...current.roles, [slotId]: event.target.value as Role } }))}>
                      {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                    </select>
                    <button type="button" aria-label={`Retirer ${player.shortName}`} onClick={() => updateDraft((current) => removePlayer(current, player.playerId))}>×</button>
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <section
          className="card squad-bench"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); handleDrop("BENCH", Number(event.dataTransfer.getData("text/player-id"))); }}
        >
          <div className="squad-section-title"><div><span className="config-kicker">REMPLAÇANTS</span><h2>Banc</h2></div><span>{draft.bench.length}/7</span></div>
          <div className="bench-list">
            {draft.bench.length === 0 && <p className="muted">Dépose un joueur ici ou utilise « Banc ».</p>}
            {draft.bench.map((player) => (
              <div className="bench-player" key={player.playerId} draggable onDragStart={(event) => event.dataTransfer.setData("text/player-id", String(player.playerId))}>
                <span className="player-overall">{player.overall}</span><div><strong>{player.shortName}</strong><span>{player.primaryPosition} · {player.nationalityName}</span></div>
                <button type="button" onClick={() => updateDraft((current) => removePlayer(current, player.playerId))}>×</button>
              </div>
            ))}
          </div>
        </section>
      </main>

      <aside className="squad-analysis-column" data-mobile-active={mobileTab === "ANALYSIS"}>
        <section className="card squad-diagnostic-card">
          <div className="squad-section-title"><div><span className="config-kicker">DIAGNOSTIC</span><h2>Équilibre du XI</h2></div><strong>{diagnostics.filledSlots}/11</strong></div>
          <div className="diagnostic-summary">
            <Metric label="Compatibilité" value={`${diagnostics.averageCompatibility}%`} />
            <Metric label="Liens synergie" value={diagnostics.synergyLinks} />
            <Metric label="Bonus INT total" value={`+${diagnostics.totalSynergyBonus}`} />
          </div>
          <div className="squad-axis-list">
            {diagnostics.axes.map((axis) => (
              <div className="squad-axis" key={axis.id} title={axis.explanation}>
                <div><span>{axis.label}</span><strong>{axis.score}</strong></div>
                <div className="squad-axis-track"><span style={{ width: `${axis.score}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="squad-warnings">
            {diagnostics.warnings.length === 0 ? <p className="squad-ok">Composition équilibrée, aucun avertissement majeur.</p> : diagnostics.warnings.map((warning) => (
              <p key={warning.message} data-level={warning.level}>{warning.message}</p>
            ))}
          </div>
        </section>

        <section className="card squad-tactics-card">
          <h2>Tactiques collectives</h2>
          <label>Hauteur du bloc<select value={draft.tactics.blockHeight} onChange={(event) => updateDraft((current) => ({ ...current, tactics: { ...current.tactics, blockHeight: event.target.value as SquadDraft["tactics"]["blockHeight"] } }))}><option value="LOW">Bas</option><option value="NORMAL">Normal</option><option value="HIGH">Haut</option></select></label>
          <label>Construction<select value={draft.tactics.buildUp} onChange={(event) => updateDraft((current) => ({ ...current, tactics: { ...current.tactics, buildUp: event.target.value as SquadDraft["tactics"]["buildUp"] } }))}><option value="SHORT">Courte</option><option value="BALANCED">Équilibrée</option><option value="DIRECT">Directe</option></select></label>
        </section>

        <ComparisonPanel current={selectedPlayer} candidate={candidate} position={selectedFormationSlot.position} benchmark={selectedBenchmark} role={draft.roles[selectedSlot] ?? "NORMAL"} />

        <section className="card squad-actions-card">
          <button className="control-button" type="button" disabled={!diagnostics.complete || previewLoading} onClick={runPreview}>{previewLoading ? "30 simulations…" : "Aperçu Monte-Carlo"}</button>
          <button className="primary-button" type="button" disabled={!diagnostics.complete || matchLoading} onClick={launchMatch}>{matchLoading ? "Calcul du match…" : "Lancer le match"}</button>
          <p>Les projections utilisent les mêmes seeds pour comparer les compositions. Elles restent indicatives.</p>
        </section>

        {preview && <PreviewPanel preview={preview} />}
      </aside>

      {match && (
        <section className="card squad-match-result" id="squad-match">
          <div className="squad-section-title"><div><span className="config-kicker">MATCH TERMINÉ</span><h2>{match.result.homeName} {match.result.homeScore} — {match.result.awayScore} {match.result.awayName}</h2></div></div>
          <PitchCanvas replay={match.replay} homeColor="#22c55e" awayColor="#ef4444" pitchMaxWidth={620} />
        </section>
      )}
    </div>
  );
}

function PlayerSearchCard({ player, selected, inSquad, targetSlot, onSelect, onPlace, onBench }: {
  player: PlayerCard; selected: boolean; inSquad: boolean; targetSlot: SquadSlotId;
  onSelect: () => void; onPlace: () => void; onBench: () => void;
}) {
  return (
    <article className="player-search-card" data-selected={selected} draggable onDragStart={(event) => event.dataTransfer.setData("text/player-id", String(player.playerId))} onClick={onSelect}>
      <div className="player-card-heading"><span className="player-overall">{player.overall}</span><div><strong>{player.shortName}</strong><span>{player.primaryPosition} · {player.nationalityName}</span></div>{inSquad && <span className="in-squad-badge">RETENU</span>}</div>
      <div className="player-mini-stats">{STATS.map((stat) => <span key={stat}><b>{player.stats[stat]}</b>{STAT_LABELS[stat]}</span>)}</div>
      <div className="player-card-actions"><button type="button" onClick={(event) => { event.stopPropagation(); onPlace(); }}>Placer en {targetSlot}</button><button type="button" onClick={(event) => { event.stopPropagation(); onBench(); }}>Banc</button></div>
    </article>
  );
}

function ComparisonPanel({ current, candidate, position, benchmark, role }: {
  current: PlayerCard | null; candidate: PlayerCard | null; position: Position; benchmark?: PositionBenchmarks; role: Role;
}) {
  return (
    <section className="card comparison-card">
      <div className="squad-section-title"><div><span className="config-kicker">COMPARAISON · {position}</span><h2>{candidate ? candidate.shortName : "Sélectionne un joueur"}</h2></div>{candidate && <span className="role-fit">Rôle {roleFitScore(candidate, role)}</span>}</div>
      {!candidate ? <p className="muted">Choisis une carte dans l’explorateur pour la comparer au titulaire du slot actif.</p> : (
        <div className="comparison-list">
          {STATS.map((stat) => {
            const delta = candidate.stats[stat] - (current?.stats[stat] ?? candidate.stats[stat]);
            const percentile = benchmark ? estimatePercentile(candidate.stats[stat], benchmark.stats[stat]) : null;
            return <div key={stat}><span>{STAT_LABELS[stat]}</span><strong>{candidate.stats[stat]}</strong><small data-positive={delta > 0} data-negative={delta < 0}>{current ? `${delta >= 0 ? "+" : ""}${delta}` : "—"}</small><em>{percentile === null ? "" : `P${percentile}`}</em></div>;
          })}
        </div>
      )}
      {current && <p className="comparison-current">Titulaire actuel : <strong>{current.shortName}</strong> ({current.overall})</p>}
    </section>
  );
}

function PreviewPanel({ preview }: { preview: SquadPreviewResponse }) {
  return (
    <section className="card squad-preview-card">
      <div className="squad-section-title"><div><span className="config-kicker">{preview.runs} MATCHS · {preview.reliability}</span><h2>Projection</h2></div></div>
      <div className="preview-outcomes"><Metric label="Victoire" value={`${preview.outcomes.homeWinRate}%`} /><Metric label="Nul" value={`${preview.outcomes.drawRate}%`} /><Metric label="Défaite" value={`${preview.outcomes.awayWinRate}%`} /></div>
      <div className="preview-expected"><span>{preview.expected.homeGoals} buts</span><span>{preview.expected.homeShots} tirs</span><span>{preview.expected.homePossession}% possession</span></div>
      <h3>Contributeurs offensifs</h3>
      {preview.contributors.attacking.map((profile) => <p key={profile.key}>{profile.playerName}<strong>{profile.per90.attackingContributions}/90</strong></p>)}
      <h3>Actions défensives</h3>
      {preview.contributors.defensive.map((profile) => <p key={profile.key}>{profile.playerName}<strong>{profile.per90.defensiveActions}/90</strong></p>)}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}
