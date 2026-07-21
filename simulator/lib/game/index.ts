/**
 * Frontière publique du moteur de match.
 *
 * Les autres modules doivent importer le moteur depuis ce fichier plutôt que
 * depuis ses modules internes. Cette façade pourra rester stable pendant le
 * découpage progressif de engine.ts.
 */
export {
  MATCH_CONTRACT_VERSION,
  assertTeamSelection,
  matchSimulationRequestSchema,
  parseMatchSimulationRequest,
  teamSelectionSchema,
} from "./contract";
export { ENGINE_VERSION, MATCH_CONFIG } from "./config";
export { simulateMatch } from "./engine";
export type {
  MatchSimulationInput,
  MatchSimulationOutput,
  MatchSimulationRequest,
  TeamSelection,
} from "./types";
