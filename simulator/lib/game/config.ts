export const ENGINE_VERSION = "0.3.0";

export const MATCH_CONFIG = {
  displayedMinutes: 90,
  logicalSeconds: 360,
  physicsStep: 0.2,
  decisionInterval: 1,
  replayFrameInterval: 0.2,
  maxSubstitutions: 5,

  decision: {
    // V0.3 : plage volontairement resserrée. L'Intelligence doit compter,
    // mais ne plus écraser les cinq autres statistiques.
    temperatureMin: 0.10,
    temperatureMax: 0.36,
    temperatureGamma: 1.25,
  },

  synergy: {
    intelligencePerMatchingNeighbor: 2,
    maxIntelligenceBonus: 6,
  },

  fatigue: {
    minStatMultiplier: 0.82,
    autoSubDisplayedMinute: 65,
    autoSubEnergyThreshold: 42,
    distanceEnergyCost: 3.5,
    pressingCostMultiplier: 1.10,
  },

  movement: {
    minSpeedPerLogicalSecond: 0.022,
    maxSpeedPerLogicalSecond: 0.055,
    controlledBallSpeedMultiplierMin: 0.80,
    controlledBallSpeedMultiplierMax: 0.96,
  },

  offBallRuns: {
    minDuration: 2.2,
    maxDuration: 5.2,
    minDepth: 0.10,
    maxDepth: 0.24,
    baseChancePerDecision: 0.06,
  },

  duels: {
    loserStunMinSeconds: 0.8,
    loserStunMaxSeconds: 1.8,
    stunnedSpeedMultiplier: 0.12,
  },

  possession: {
    minControlSecondsBeforeEasyPass: 0.75,
  },

  ball: {
    // Les passes ne téléportent plus la possession à la cible : le ballon
    // possède une vélocité et ralentit jusqu'à être contrôlé ou s'arrêter.
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
} as const;

export function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
