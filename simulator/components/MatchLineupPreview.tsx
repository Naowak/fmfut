import { getFormation } from "@/lib/game/formations";
import { positionShortLabel } from "@/lib/game/localization";
import type { PlayerCard, TeamSelection } from "@/lib/game/types";

export type LineupPreviewTeam = {
  name: string;
  badge?: string;
  color: string;
  selection: TeamSelection;
  players: PlayerCard[];
};

type PreviewPlayer = {
  id: string;
  name: string;
  position: string;
  left: number;
  top: number;
};

export function formationPreviewPlayers(team: LineupPreviewTeam, side: "FIRST" | "SECOND"): PreviewPlayer[] {
  const byId = new Map(team.players.map((player) => [player.playerId, player]));
  return getFormation(team.selection.formationId).map((slot) => {
    const playerId = team.selection.starters[slot.id];
    const player = byId.get(playerId);
    return {
      id: `${side}-${slot.id}`,
      name: player?.shortName ?? "—",
      position: positionShortLabel(slot.position),
      left: 8 + slot.anchor.y * 84,
      top: 5 + (side === "FIRST" ? 1 - slot.anchor.x : slot.anchor.x) * 90,
    };
  });
}

export function MatchLineupPreview({ first, second }: { first: LineupPreviewTeam; second: LineupPreviewTeam }) {
  const teams = [
    { team: first, side: "FIRST" as const },
    { team: second, side: "SECOND" as const },
  ];

  return (
    <section className="lineup-preview" aria-label={`Aperçu de ${first.name} contre ${second.name}`}>
      <div className="lineup-preview-scoreboard">
        <strong><span>{first.badge}</span>{first.name}</strong>
        <span>VS</span>
        <strong>{second.name}<span>{second.badge}</span></strong>
      </div>
      <div className="lineup-preview-pitch">
        <div className="lineup-preview-lines" aria-hidden="true" />
        {teams.flatMap(({ team, side }) => formationPreviewPlayers(team, side).map((player) => (
          <div
            className="lineup-preview-player"
            data-side={side}
            key={player.id}
            style={{ left: `${player.left}%`, top: `${player.top}%`, "--team-color": team.color } as React.CSSProperties}
          >
            <span>{player.position}</span>
            <b>{player.name}</b>
          </div>
        )))}
      </div>
    </section>
  );
}
