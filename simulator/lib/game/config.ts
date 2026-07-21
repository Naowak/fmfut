export const ENGINE_VERSION = "0.9.0";

export const MATCH_CONFIG = {
  displayedMinutes: 90,
  logicalSeconds: 360,
  physicsStep: 0.2,
  ballSubstep: 0.04,
  decisionInterval: 1,
  replayFrameInterval: 0.16,
  spatialSampleInterval: 1,
  maxSubstitutions: 5,

  decision: {
    // Plage légèrement resserrée : l'Intelligence reste la statistique de
    // décision, sans produire un écart de performance global excessif entre
    // les joueurs déjà très bien notés.
    temperatureMin: 0.12,
    temperatureMax: 0.34,
    temperatureGamma: 1.08,
  },

  synergy: {
    intelligencePerMatchingNeighbor: 2,
    maxIntelligenceBonus: 6,
  },

  fatigue: {
    minStatMultiplier: 0.82,
    distanceEnergyCost: 2.7,
    pressingCostMultiplier: 1.10,
  },

  substitutions: {
    plannedWindows: [62, 72, 82],
    plannedEnergyThreshold: 78,
    emergencyEnergyThreshold: 42,
    minimumDisplayedMinute: 58,
    cooldownDisplayedMinutes: 5,
  },

  movement: {
    minSpeedPerLogicalSecond: 0.03,
    maxSpeedPerLogicalSecond: 0.07,
    controlledBallSpeedMultiplierMin: 0.80,
    controlledBallSpeedMultiplierMax: 0.96,
    shapeRepositionMultiplier: 1.32,
    restartRepositionMultiplier: 2.25,
  },

  block: {
    baseCenterProgress: 0.39,
    attackBaseAdvance: 0.16,
    defenseBaseRetreat: -0.11,
    ballFollowAttack: 0.39,
    ballFollowDefense: 0.47,
    lateralBallFollowAttack: 0.24,
    lateralBallFollowDefense: 0.33,
    attackWidth: 1.25,
    defenseWidth: 0.78,
    attackDepth: 1.08,
    defenseDepth: 0.78,
  },

  offBallRuns: {
    minDuration: 2.2,
    maxDuration: 5.2,
    minDepth: 0.10,
    maxDepth: 0.24,
    baseChancePerDecision: 0.06,
  },

  wingPlay: {
    cornerProgressThreshold: 0.86,
    sidelineThreshold: 0.105,
    inwardEscapeDistance: 0.13,
    cornerDribblePenalty: 0.34,
    centralPassBonus: 0.24,
  },

  goalkeeper: {
    baseProgress: 0.042,
    possessionProgress: 0.070,
    lateralFollow: 0.18,
    maxLateralOffset: 0.085,
    looseBallMaxProgress: 0.19,
    requiredDistanceAdvantage: 0.025,
  },

  offsides: {
    enabled: true,
    lineBuffer: 0.008,
    maxLowIntelligenceOvershoot: 0.050,
  },

  duels: {
    engagementRadius: 0.020,
    loserStunMinSeconds: 0.8,
    loserStunMaxSeconds: 1.8,
    stunnedSpeedMultiplier: 0.12,
  },

  possession: {
    minControlSecondsBeforeEasyPass: 0.75,
    transitionShotWindowSeconds: 4,
  },

  passing: {
    backwardPenalty: 0.72,
    backwardPressureRelief: 0.50,
    goalkeeperBasePenalty: 0.48,
    goalkeeperPressureRelief: 0.54,
    goalkeeperSafeLead: 0.045,
    goalkeeperErrorMultiplier: 0.30,
    goalkeeperPowerErrorMultiplier: 0.22,
    goalkeeperSpeedMultiplier: 0.78,
  },

  ball: {
    passDeceleration: 0.12,
    passMinSpeed: 0.11,
    passMaxSpeed: 0.36,
    shotDeceleration: 0.025,
    shotMinSpeed: 0.48,
    shotMaxSpeed: 0.92,
    looseBallStopSpeed: 0.008,
    controlRadiusMin: 0.010,
    controlRadiusMax: 0.017,
    goalkeeperCatchRadius: 0.024,
    goalkeeperParryRadius: 0.041,
    goalkeeperBackPassControlRadius: 0.027,
    comfortableControlSpeed: 0.22,
    reboundDeceleration: 0.15,
    goalMouthMinY: 0.42,
    goalMouthMaxY: 0.58,
  },

  setPieces: {
    throwInPause: 1.1,
    cornerPause: 1.7,
    goalKickPause: 1.5,
    freeKickPause: 1.8,
    penaltyPause: 2.4,
    kickoffPause: 1.6,
    halftimePause: 2.6,
    closeFreeKickDistance: 0.30,
    penaltyAreaDepth: 0.16,
    penaltyAreaHalfWidth: 0.24,
    penaltySpotDistanceFromGoal: 0.11,
    wallDistance: 0.085,
    wallMinPlayers: 3,
    wallMaxPlayers: 5,
  },

  addedTime: {
    // Une partie seulement des arrêts est compensée, comme dans un vrai match.
    compensationRatio: 0.72,
    maxLogicalSecondsPerHalf: 18,
  },

  analytics: {
    heatmapColumns: 8,
    heatmapRows: 12,
  },
} as const;

export function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
