import { NextResponse } from "next/server";
import { loadPlayers } from "@/lib/data/load-players";
import { positionCompatibility } from "@/lib/game/compatibility";
import { FORMATION_433 } from "@/lib/game/formations";
import { SeededRng } from "@/lib/game/rng";
import type { PlayerCard, TeamSelection } from "@/lib/game/types";
import type { SquadBootstrapResponse } from "@/lib/squad/api-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const seed = new URL(request.url).searchParams.get("seed") ?? `random-${Date.now()}`;
    return NextResponse.json(createRandomSquad(loadPlayers(), seed), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Équipe aléatoire impossible." },
      { status: 500 },
    );
  }
}

export function createRandomSquad(players: PlayerCard[], seed: string): SquadBootstrapResponse {
  const rng = new SeededRng(seed);
  const available = [...players];
  const starters: Record<string, number> = {};
  const selected: PlayerCard[] = [];

  for (const slot of FORMATION_433) {
    const candidates = available.filter(
      (player) => positionCompatibility(player, slot.position) >= 0.75,
    );
    if (candidates.length === 0) throw new Error(`Aucun joueur compatible en ${slot.id}.`);
    const player = rng.pick(candidates);
    starters[slot.id] = player.playerId;
    selected.push(player);
    available.splice(available.findIndex((item) => item.playerId === player.playerId), 1);
  }

  while (selected.length < 18 && available.length > 0) {
    const player = rng.pick(available);
    selected.push(player);
    available.splice(available.findIndex((item) => item.playerId === player.playerId), 1);
  }

  const selection: TeamSelection = {
    name: "Équipe aléatoire",
    formationId: "4-3-3",
    starters,
    bench: selected.slice(11).map((player) => player.playerId),
    roles: { CDM: "DEFENSIVE", LCM: "CREATOR", LW: "OFFENSIVE", ST: "OFFENSIVE" },
    tactics: { blockHeight: "NORMAL", buildUp: "BALANCED" },
  };

  return { selection, players: selected };
}
