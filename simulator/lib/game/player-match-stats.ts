import { round } from "./config";
import type { MatchState, RuntimePlayer } from "./runtime";
import type { PlayerMatchStats } from "./types";

export function accruePlayerParticipation(state: MatchState, dt: number): void {
  for (const player of state.allPlayers) {
    if (player.active) player.matchStats.logicalSecondsPlayed += dt;
  }
}

export function finalizePlayerMatchStats(
  player: RuntimePlayer,
  periodRegulationDuration: number,
): PlayerMatchStats {
  const stats = player.matchStats;
  const minutesPlayed =
    periodRegulationDuration > 0
      ? (stats.logicalSecondsPlayed / periodRegulationDuration) * 45
      : 0;
  return {
    runtimeId: player.runtimeId,
    playerId: player.card.playerId,
    playerName: player.card.shortName,
    team: player.side,
    starter: player.runtimeId.includes(":START:"),
    shirtNumber: player.shirtNumber,
    position: player.assignedPosition,
    role: player.role,
    minutesPlayed: round(minutesPlayed, 1),
    distanceCovered: round(stats.distanceCovered, 3),
    touches: stats.touches,
    goals: stats.goals,
    assists: stats.assists,
    ownGoals: stats.ownGoals,
    shots: stats.shots,
    shotsOnTarget: stats.shotsOnTarget,
    passesAttempted: stats.passesAttempted,
    passesCompleted: stats.passesCompleted,
    passCompletion:
      stats.passesAttempted === 0
        ? 0
        : round((stats.passesCompleted / stats.passesAttempted) * 100, 1),
    dribbles: stats.dribbles,
    progressiveRuns: stats.progressiveRuns,
    tackles: stats.tackles,
    interceptions: stats.interceptions,
    duelsWon: stats.duelsWon,
    possessionRegains: stats.possessionRegains,
    fouls: stats.fouls,
    yellowCards: stats.yellowCards,
    redCards: stats.redCards,
    offsides: stats.offsides,
    goalkeeperSaves: stats.goalkeeperSaves,
    energyStart: 100,
    energyEnd: round(player.energy, 1),
  };
}
