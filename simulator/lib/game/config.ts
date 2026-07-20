export const ENGINE_VERSION = "0.2.0";

export const MATCH_CONFIG = {
  displayedMinutes: 90,
  logicalSeconds: 360,
  physicsStep: 0.2,
  decisionInterval: 1,
  replayFrameInterval: 0.2,
  maxSubstitutions: 5,

  decision: {
    temperatureMin: 0.06,
    temperatureMax: 0.55,
    temperatureGamma: 1.5,
  },

  synergy: {
    intelligencePerMatchingNeighbor: 2,
    maxIntelligenceBonus: 6,
  },

  fatigue: {
    minStatMultiplier: 0.75,
    autoSubDisplayedMinute: 60,
    autoSubEnergyThreshold: 56,
  },

  movement: {
    minSpeedPerLogicalSecond: 0.022,
    maxSpeedPerLogicalSecond: 0.055,
    controlledBallSpeedMultiplierMin: 0.78,
    controlledBallSpeedMultiplierMax: 0.95,
  },

  offBallRuns: {
    minDuration: 2.2,
    maxDuration: 5.2,
    minDepth: 0.10,
    maxDepth: 0.24,
    baseChancePerDecision: 0.07,
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
    passMinDuration: 0.32,
    passMaxDuration: 1.0,
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
