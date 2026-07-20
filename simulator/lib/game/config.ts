export const ENGINE_VERSION = "0.4.0";

export const MATCH_CONFIG = {
  displayedMinutes: 90,
  logicalSeconds: 360,
  physicsStep: 0.2,
  decisionInterval: 1,
  replayFrameInterval: 0.2,
  spatialSampleInterval: 1,
  maxSubstitutions: 5,

  decision: {
    temperatureMin: 0.09,
    temperatureMax: 0.40,
    temperatureGamma: 1.22,
  },

  synergy: {
    intelligencePerMatchingNeighbor: 2,
    maxIntelligenceBonus: 6,
  },

  fatigue: {
    minStatMultiplier: 0.82,
    distanceEnergyCost: 3.1,
    pressingCostMultiplier: 1.10,
  },

  substitutions: {
    // Une équipe saine doit tout de même faire tourner son banc. Ces fenêtres
    // produisent en général 2 à 3 changements, sans détruire l'intérêt de la fatigue.
    plannedWindows: [62, 72, 82],
    plannedEnergyThreshold: 78,
    emergencyEnergyThreshold: 42,
    minimumDisplayedMinute: 58,
    cooldownDisplayedMinutes: 5,
  },

  movement: {
    minSpeedPerLogicalSecond: 0.022,
    maxSpeedPerLogicalSecond: 0.055,
    controlledBallSpeedMultiplierMin: 0.80,
    controlledBallSpeedMultiplierMax: 0.96,
    shapeRepositionMultiplier: 1.32,
  },

  block: {
    // Centre longitudinal de la forme 4-3-3 d'origine en coordonnées équipe
    // (0 = notre but, 1 = but adverse).
    baseCenterProgress: 0.39,
    attackBaseAdvance: 0.13,
    defenseBaseRetreat: -0.085,
    ballFollowAttack: 0.34,
    ballFollowDefense: 0.42,
    lateralBallFollowAttack: 0.22,
    lateralBallFollowDefense: 0.30,
    attackWidth: 1.22,
    defenseWidth: 0.82,
    attackDepth: 1.02,
    defenseDepth: 0.82,
  },

  offBallRuns: {
    minDuration: 2.2,
    maxDuration: 5.2,
    minDepth: 0.10,
    maxDepth: 0.24,
    baseChancePerDecision: 0.06,
  },

  offsides: {
    enabled: true,
    lineBuffer: 0.012,
    maxLowIntelligenceOvershoot: 0.035,
  },

  duels: {
    loserStunMinSeconds: 0.8,
    loserStunMaxSeconds: 1.8,
    stunnedSpeedMultiplier: 0.12,
  },

  possession: {
    minControlSecondsBeforeEasyPass: 0.75,
    transitionShotWindowSeconds: 4,
  },

  ball: {
    passDeceleration: 0.12,
    passMinSpeed: 0.11,
    passMaxSpeed: 0.36,
    looseBallStopSpeed: 0.008,
    controlRadiusMin: 0.012,
    controlRadiusMax: 0.022,
    comfortableControlSpeed: 0.22,
    reboundDeceleration: 0.15,
    shotMinDuration: 0.65,
    shotMaxDuration: 1.25,
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
