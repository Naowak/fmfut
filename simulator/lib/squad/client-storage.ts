import {
  createSnapshot,
  draftFromSelection,
  parseSnapshot,
  type SquadDraft,
} from "./builder";
import type { SquadBootstrapResponse } from "./api-types";

export const SQUAD_STORAGE_KEY = "fmfut:squad-builder:v1";

export async function loadSquadDraft(): Promise<SquadDraft> {
  const stored = window.localStorage.getItem(SQUAD_STORAGE_KEY);
  if (stored) return parseSnapshot(stored).draft;

  const response = await fetch("/api/squad/bootstrap");
  const payload = (await response.json()) as
    | SquadBootstrapResponse
    | { error: string };
  if (!response.ok || "error" in payload) {
    throw new Error(
      "error" in payload ? payload.error : "Chargement de l’équipe impossible.",
    );
  }
  const draft = draftFromSelection(payload.selection, payload.players);
  persistSquadDraft(draft);
  return draft;
}

export function persistSquadDraft(draft: SquadDraft): void {
  window.localStorage.setItem(
    SQUAD_STORAGE_KEY,
    JSON.stringify(createSnapshot(draft)),
  );
}
