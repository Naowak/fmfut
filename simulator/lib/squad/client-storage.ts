import {
  createEmptyDraft,
  createSnapshot,
  parseSnapshot,
  type SquadDraft,
} from "./builder";

export const SQUAD_STORAGE_KEY = "fmfut:squad-builder:v1";
export const WORKSPACE_STORAGE_KEY = "fmfut:squad-workspace:v2";

export interface SavedStrategy {
  id: string;
  name: string;
  draft: SquadDraft;
  updatedAt: string;
}

export interface SavedTeam {
  id: string;
  name: string;
  emblem: string;
  strategies: SavedStrategy[];
}

export interface SquadWorkspace {
  version: 2;
  activeTeamId: string | null;
  activeStrategyId: string | null;
  teams: SavedTeam[];
}

export function emptyWorkspace(): SquadWorkspace {
  return { version: 2, activeTeamId: null, activeStrategyId: null, teams: [] };
}

export function createSavedTeam(
  draft = createEmptyDraft("Nouvelle équipe"),
  strategyName = "Principale",
  emblem = "⚽",
): SavedTeam {
  const teamId = createId("team");
  return {
    id: teamId,
    name: draft.name,
    emblem,
    strategies: [createSavedStrategy(draft, strategyName)],
  };
}

export function createSavedStrategy(
  draft: SquadDraft,
  name = "Nouvelle stratégie",
): SavedStrategy {
  return {
    id: createId("strategy"),
    name,
    draft: cloneDraft(draft),
    updatedAt: new Date().toISOString(),
  };
}

export async function loadSquadWorkspace(): Promise<SquadWorkspace> {
  const stored = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
  if (stored) return parseWorkspace(stored);

  const legacy = window.localStorage.getItem(SQUAD_STORAGE_KEY);
  if (legacy) {
    const draft = parseSnapshot(legacy).draft;
    const team = createSavedTeam(draft);
    const workspace: SquadWorkspace = {
      version: 2,
      activeTeamId: team.id,
      activeStrategyId: team.strategies[0].id,
      teams: [team],
    };
    persistSquadWorkspace(workspace);
    return workspace;
  }

  return emptyWorkspace();
}

export function persistSquadWorkspace(workspace: SquadWorkspace): void {
  window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
}

export function activeWorkspaceDraft(workspace: SquadWorkspace): SquadDraft | null {
  const team = workspace.teams.find((item) => item.id === workspace.activeTeamId);
  return team?.strategies.find((item) => item.id === workspace.activeStrategyId)?.draft ?? null;
}

export function parseWorkspace(value: string): SquadWorkspace {
  const parsed = JSON.parse(value) as Partial<SquadWorkspace>;
  if (parsed.version !== 2 || !Array.isArray(parsed.teams)) {
    throw new Error("Espace équipes invalide.");
  }
  for (const team of parsed.teams) {
    if (!team || typeof team.id !== "string" || typeof team.name !== "string" || !Array.isArray(team.strategies)) {
      throw new Error("Équipe sauvegardée invalide.");
    }
    for (const strategy of team.strategies) {
      if (!strategy || typeof strategy.id !== "string" || typeof strategy.name !== "string") {
        throw new Error("Stratégie sauvegardée invalide.");
      }
      parseSnapshot(JSON.stringify({ version: 1, savedAt: strategy.updatedAt, draft: strategy.draft }));
    }
  }
  return {
    ...(parsed as SquadWorkspace),
    teams: (parsed.teams as SavedTeam[]).map((team) => ({
      ...team,
      emblem: typeof team.emblem === "string" && team.emblem.trim() ? team.emblem : "⚽",
    })),
  };
}

// Compatibilité temporaire pour les imports/exportations V0.11.
export async function loadSquadDraft(): Promise<SquadDraft> {
  const draft = activeWorkspaceDraft(await loadSquadWorkspace());
  if (!draft) throw new Error("Aucune équipe enregistrée.");
  return draft;
}

export function persistSquadDraft(draft: SquadDraft): void {
  window.localStorage.setItem(SQUAD_STORAGE_KEY, JSON.stringify(createSnapshot(draft)));
}

function cloneDraft(draft: SquadDraft): SquadDraft {
  return JSON.parse(JSON.stringify(draft)) as SquadDraft;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
