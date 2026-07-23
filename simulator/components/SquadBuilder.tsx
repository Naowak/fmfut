"use client";

import { useEffect, useMemo, useState } from "react";
import { FORMATION_LABELS, getFormation } from "@/lib/game/formations";
import {
  nationalityLabel,
  positionLabel,
  positionShortLabel,
  roleLabel,
  slotLabel,
} from "@/lib/game/localization";
import type {
  PlayerCard,
  FormationId,
  Position,
  Role,
} from "@/lib/game/types";
import type {
  PositionBenchmarks,
  SquadBootstrapResponse,
} from "@/lib/squad/api-types";
import { estimatePercentile } from "@/lib/squad/benchmarks";
import {
  activeWorkspaceDraft,
  createSavedStrategy,
  createSavedTeam,
  emptyWorkspace,
  loadSquadWorkspace,
  persistSquadWorkspace,
  type SquadWorkspace,
} from "@/lib/squad/client-storage";
import { STRATEGY_EMBLEMS, TEAM_EMBLEMS } from "@/lib/squad/emblems";
import {
  addPlayerToBench,
  allDraftPlayers,
  assignPlayerToSlot,
  createEmptyDraft,
  diagnoseSquad,
  draftFromSelection,
  playerInDraft,
  removePlayer,
  roleFitScore,
  type SquadDraft,
  type SquadSlotId,
} from "@/lib/squad/builder";

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
  const [workspace, setWorkspace] = useState<SquadWorkspace>(() => emptyWorkspace());
  const [hydrated, setHydrated] = useState(false);
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
  const [mobileTab, setMobileTab] = useState<"SEARCH" | "TEAM" | "ANALYSIS">("TEAM");
  const activeTeam = workspace.teams.find((team) => team.id === workspace.activeTeamId) ?? null;
  const activeStrategy = activeTeam?.strategies.find((strategy) => strategy.id === workspace.activeStrategyId) ?? null;

  const diagnostics = useMemo(() => diagnoseSquad(draft), [draft]);
  const selectedPlayer = draft.starters[selectedSlot] ?? null;
  const formation = getFormation(draft.formationId);
  const selectedFormationSlot = formation.find((slot) => slot.id === selectedSlot)!;
  const selectedBenchmark = benchmarks.find(
    (benchmark) => benchmark.position === selectedFormationSlot.position,
  );

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        const loaded = await loadSquadWorkspace();
        if (!cancelled) {
          setWorkspace(loaded);
          setDraft(activeWorkspaceDraft(loaded) ?? createEmptyDraft());
          setHydrated(true);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Chargement impossible.");
          setHydrated(true);
        }
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
    setDraft((current) => {
      const next = updater(current);
      setWorkspace((currentWorkspace) => {
        const nextWorkspace = {
          ...currentWorkspace,
          teams: currentWorkspace.teams.map((team) => team.id !== currentWorkspace.activeTeamId ? team : {
            ...team,
            name: next.name,
            strategies: team.strategies.map((strategy) => strategy.id !== currentWorkspace.activeStrategyId
              ? { ...strategy, draft: { ...strategy.draft, name: next.name } }
              : { ...strategy, draft: next, updatedAt: new Date().toISOString() }),
          }),
        };
        persistSquadWorkspace(nextWorkspace);
        return nextWorkspace;
      });
      return next;
    });
  }

  function activate(teamId: string, strategyId?: string) {
    const team = workspace.teams.find((item) => item.id === teamId);
    const strategy = team?.strategies.find((item) => item.id === strategyId) ?? team?.strategies[0];
    if (!team || !strategy) return;
    const next = { ...workspace, activeTeamId: team.id, activeStrategyId: strategy.id };
    setWorkspace(next);
    setDraft(strategy.draft);
    persistSquadWorkspace(next);
  }

  function addTeam() {
    const team = createSavedTeam(createEmptyDraft(`Équipe ${workspace.teams.length + 1}`));
    const next = { ...workspace, activeTeamId: team.id, activeStrategyId: team.strategies[0].id, teams: [...workspace.teams, team] };
    setWorkspace(next);
    setDraft(team.strategies[0].draft);
    persistSquadWorkspace(next);
  }

  function addStrategy() {
    if (!activeTeam) return;
    const strategy = createSavedStrategy(draft, `Stratégie ${activeTeam.strategies.length + 1}`);
    const next = {
      ...workspace,
      activeStrategyId: strategy.id,
      teams: workspace.teams.map((team) => team.id === activeTeam.id ? { ...team, strategies: [...team.strategies, strategy] } : team),
    };
    setWorkspace(next);
    setDraft(strategy.draft);
    persistSquadWorkspace(next);
  }

  function updateTeamEmblem(emblem: string) {
    const next = {
      ...workspace,
      teams: workspace.teams.map((team) => team.id === activeTeam?.id ? { ...team, emblem } : team),
    };
    setWorkspace(next);
    persistSquadWorkspace(next);
  }

  function updateStrategyEmblem(emblem: string) {
    const next = {
      ...workspace,
      teams: workspace.teams.map((team) => team.id !== activeTeam?.id ? team : {
        ...team,
        strategies: team.strategies.map((strategy) => strategy.id === activeStrategy?.id
          ? { ...strategy, emblem }
          : strategy),
      }),
    };
    setWorkspace(next);
    persistSquadWorkspace(next);
  }

  function deleteTeam() {
    if (!activeTeam || !window.confirm(`Supprimer ${activeTeam.emblem} ${activeTeam.name} ?`)) return;
    const teams = workspace.teams.filter((team) => team.id !== activeTeam.id);
    const nextTeam = teams[0] ?? null;
    const nextStrategy = nextTeam?.strategies[0] ?? null;
    const next: SquadWorkspace = {
      ...workspace,
      teams,
      activeTeamId: nextTeam?.id ?? null,
      activeStrategyId: nextStrategy?.id ?? null,
    };
    setWorkspace(next);
    setDraft(nextStrategy?.draft ?? createEmptyDraft());
    persistSquadWorkspace(next);
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
      setMessage("Le banc est limité à 7 joueurs.");
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

  async function randomizeTeam() {
    try {
      const response = await fetch(`/api/squad/random?seed=${Date.now()}`, { cache: "no-store" });
      const payload = (await response.json()) as SquadBootstrapResponse | { error: string };
      if (!response.ok || "error" in payload) throw new Error("error" in payload ? payload.error : "Chargement impossible.");
      const loaded = { ...draftFromSelection(payload.selection, payload.players), name: activeTeam?.name ?? draft.name };
      updateDraft(() => loaded);
      setMessage("Équipe aléatoire créée.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Chargement impossible.");
    }
  }

  if (!hydrated) return <div className="squad-inline-loading">Chargement…</div>;
  if (!activeTeam || !activeStrategy) {
    return <section className="empty-workspace"><h2>Aucune équipe</h2><p>Crée ta première équipe pour commencer.</p><button className="primary-button" type="button" onClick={addTeam}>Créer une équipe</button></section>;
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
          <h2>Joueurs</h2>
          <span className="squad-count">{search.total.toLocaleString("fr-FR")}</span>
        </div>
        <div className="squad-search-filters">
          <input className="text-input" aria-label="Rechercher un joueur" placeholder="Nom du joueur…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
          <div className="squad-filter-row">
            <select aria-label="Filtrer par poste" value={position} onChange={(event) => { setPosition(event.target.value as "" | Position); setPage(1); }}>
              {POSITIONS.map((item) => <option key={item || "ALL"} value={item}>{item ? positionLabel(item) : "Tous les postes"}</option>)}
            </select>
            <input aria-label="Note générale minimum" type="number" min={1} max={100} placeholder="Note min" value={minOverall} onChange={(event) => { setMinOverall(event.target.value); setPage(1); }} />
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
          <div className="workspace-switchers">
            <div className="editable-entity editable-team">
              <select className="emblem-picker" aria-label="Emblème de l’équipe" value={activeTeam.emblem} onChange={(event) => updateTeamEmblem(event.target.value)}>
                {TEAM_EMBLEMS.map((emblem) => <option key={emblem} value={emblem}>{emblem}</option>)}
              </select>
              <input aria-label="Nom de l’équipe" value={draft.name} onChange={(event) => updateDraft((current) => ({ ...current, name: event.target.value }))} />
              <select className="entity-menu" aria-label="Changer d’équipe" title="Changer d’équipe" value={activeTeam.id} onChange={(event) => activate(event.target.value)}>
                {workspace.teams.map((team) => <option key={team.id} value={team.id}>{team.emblem} {team.name}</option>)}
              </select>
              <button type="button" aria-label="Créer une équipe" title="Créer une équipe" onClick={addTeam}>＋</button>
            </div>
            <div className="editable-entity editable-strategy">
              <select className="emblem-picker" aria-label="Emblème de la stratégie" value={activeStrategy.emblem} onChange={(event) => updateStrategyEmblem(event.target.value)}>
                {STRATEGY_EMBLEMS.map((emblem) => <option key={emblem} value={emblem}>{emblem}</option>)}
              </select>
              <input aria-label="Nom de la stratégie" value={activeStrategy.name} onChange={(event) => {
              const name = event.target.value;
              const next = { ...workspace, teams: workspace.teams.map((team) => team.id === activeTeam.id ? { ...team, strategies: team.strategies.map((strategy) => strategy.id === activeStrategy.id ? { ...strategy, name } : strategy) } : team) };
              setWorkspace(next); persistSquadWorkspace(next);
              }} />
              <select className="entity-menu" aria-label="Changer de stratégie" title="Changer de stratégie" value={activeStrategy.id} onChange={(event) => activate(activeTeam.id, event.target.value)}>
                {activeTeam.strategies.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.emblem} {strategy.name}</option>)}
              </select>
              <button type="button" aria-label="Créer une stratégie" title="Créer une stratégie" onClick={addStrategy}>＋</button>
            </div>
          </div>
          <div className="squad-toolbar-actions">
            <button type="button" aria-label="Créer une équipe aléatoire" title="Équipe aléatoire" onClick={randomizeTeam}>🎲</button>
            <button className="danger-button" type="button" aria-label="Supprimer l’équipe" title="Supprimer l’équipe" onClick={deleteTeam}>🗑</button>
          </div>
        </section>

        {message && <div className="squad-message" role="status">{message}</div>}

        <section className="squad-pitch" aria-label={`Terrain ${FORMATION_LABELS[draft.formationId]}`}>
          <div className="squad-pitch-markings" />
          {formation.map((slot) => {
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
                  }}
                  aria-label={player ? `${slotId}, ${player.shortName}` : `${slotId}, vide`}
                >
                  <span className="squad-slot-position">{positionShortLabel(slot.position)}</span>
                  {player ? (
                    <><strong>{player.shortName}</strong><span>{player.overall} · {positionShortLabel(player.primaryPosition)}</span></>
                  ) : <span className="squad-slot-empty">Ajouter</span>}
                </button>
                {player && (
                  <div className="slot-actions">
                    <select aria-label={`Rôle de ${player.shortName}`} value={draft.roles[slotId] ?? "NORMAL"} onChange={(event) => updateDraft((current) => ({ ...current, roles: { ...current.roles, [slotId]: event.target.value as Role } }))}>
                      {ROLES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
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
          <div className="squad-section-title"><h2>Banc</h2><span>{draft.bench.length}/7</span></div>
          <div className="bench-list">
            {Array.from({ length: 7 }, (_, index) => {
              const player = draft.bench[index];
              return player ? (
                <div
                  className="bench-player"
                  key={player.playerId}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("text/player-id", String(player.playerId))}
                >
                  <button className="bench-player-main" type="button" aria-label={`Placer ${player.shortName} en ${slotLabel(selectedSlot)}`} onClick={() => placeInSlot(player)}>
                    <span className="player-overall">{player.overall}</span><span className="bench-player-identity"><strong>{player.shortName}</strong><span>{positionShortLabel(player.primaryPosition)} · {nationalityLabel(player.nationalityName)}</span></span>
                  </button>
                  <button type="button" aria-label={`Retirer ${player.shortName}`} onClick={() => updateDraft((current) => removePlayer(current, player.playerId))}>×</button>
                </div>
              ) : (
                <div className="bench-player bench-player-empty" key={`empty-${index}`}>
                  <span>{index + 1}</span><strong>Emplacement libre</strong>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <aside className="squad-analysis-column" data-mobile-active={mobileTab === "ANALYSIS"}>
        <section className="card squad-diagnostic-card">
          <div className="squad-section-title"><h2>Équilibre du XI</h2><strong>{diagnostics.filledSlots}/11</strong></div>
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
          <label>Formation<select value={draft.formationId} onChange={(event) => updateDraft((current) => ({ ...current, formationId: event.target.value as FormationId }))}>{Object.entries(FORMATION_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label>Hauteur du bloc<select value={draft.tactics.blockHeight} onChange={(event) => updateDraft((current) => ({ ...current, tactics: { ...current.tactics, blockHeight: event.target.value as SquadDraft["tactics"]["blockHeight"] } }))}><option value="LOW">Bas</option><option value="NORMAL">Normal</option><option value="HIGH">Haut</option></select></label>
          <label>Construction<select value={draft.tactics.buildUp} onChange={(event) => updateDraft((current) => ({ ...current, tactics: { ...current.tactics, buildUp: event.target.value as SquadDraft["tactics"]["buildUp"] } }))}><option value="SHORT">Courte</option><option value="BALANCED">Équilibrée</option><option value="DIRECT">Directe</option></select></label>
          <label>Pressing<select value={draft.tactics.pressing ?? "BALANCED"} onChange={(event) => updateDraft((current) => ({ ...current, tactics: { ...current.tactics, pressing: event.target.value as NonNullable<SquadDraft["tactics"]["pressing"]> } }))}><option value="CAUTIOUS">Prudent</option><option value="BALANCED">Équilibré</option><option value="AGGRESSIVE">Agressif</option></select></label>
          <label>Largeur<select value={draft.tactics.width ?? "BALANCED"} onChange={(event) => updateDraft((current) => ({ ...current, tactics: { ...current.tactics, width: event.target.value as NonNullable<SquadDraft["tactics"]["width"]> } }))}><option value="NARROW">Resserrée</option><option value="BALANCED">Équilibrée</option><option value="WIDE">Large</option></select></label>
        </section>

        {candidate && <ComparisonPanel current={selectedPlayer} candidate={candidate} position={selectedFormationSlot.position} benchmark={selectedBenchmark} role={draft.roles[selectedSlot] ?? "NORMAL"} />}
      </aside>
    </div>
  );
}

function PlayerSearchCard({ player, selected, inSquad, targetSlot, onSelect, onPlace, onBench }: {
  player: PlayerCard; selected: boolean; inSquad: boolean; targetSlot: SquadSlotId;
  onSelect: () => void; onPlace: () => void; onBench: () => void;
}) {
  return (
    <article className="player-search-card" data-selected={selected} draggable onDragStart={(event) => event.dataTransfer.setData("text/player-id", String(player.playerId))} onClick={onSelect}>
      <div className="player-card-heading"><span className="player-overall">{player.overall}</span><div><strong>{player.shortName}</strong><span>{positionShortLabel(player.primaryPosition)} · {nationalityLabel(player.nationalityName)}</span></div>{inSquad && <span className="in-squad-badge">RETENU</span>}</div>
      <div className="player-mini-stats">{STATS.map((stat) => <span key={stat}><b>{player.stats[stat]}</b>{STAT_LABELS[stat]}</span>)}</div>
      <div className="player-card-actions"><button type="button" onClick={(event) => { event.stopPropagation(); onPlace(); }}>Placer en {slotLabel(targetSlot)}</button><button type="button" onClick={(event) => { event.stopPropagation(); onBench(); }}>Banc</button></div>
    </article>
  );
}

function ComparisonPanel({ current, candidate, position, benchmark, role }: {
  current: PlayerCard | null; candidate: PlayerCard | null; position: Position; benchmark?: PositionBenchmarks; role: Role;
}) {
  return (
    <section className="card comparison-card">
      <div className="squad-section-title"><div><span className="config-kicker">COMPARAISON · {positionShortLabel(position)}</span><h2>{candidate ? candidate.shortName : "Sélectionne un joueur"}</h2></div>{candidate && <span className="role-fit">Compatibilité rôle {roleFitScore(candidate, role)}</span>}</div>
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

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}
