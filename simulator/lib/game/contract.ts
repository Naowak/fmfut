import { z } from "zod";
import { FORMATION_SLOT_IDS } from "./formations";
import type { MatchSimulationRequest, TeamSelection } from "./types";

export const MATCH_CONTRACT_VERSION = "1.0.0";

const roleSchema = z.enum([
  "DEFENSIVE",
  "NORMAL",
  "OFFENSIVE",
  "CREATOR",
  "PRESSING",
]);

const playerIdSchema = z.number().int().safe();

const startersSchema = z
  .object({
    GK: playerIdSchema,
    LB: playerIdSchema,
    LCB: playerIdSchema,
    RCB: playerIdSchema,
    RB: playerIdSchema,
    CDM: playerIdSchema,
    LCM: playerIdSchema,
    RCM: playerIdSchema,
    LW: playerIdSchema,
    ST: playerIdSchema,
    RW: playerIdSchema,
  })
  .strict();

export const teamSelectionSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    formationId: z.literal("4-3-3"),
    starters: startersSchema,
    bench: z.array(playerIdSchema).max(12),
    roles: z.record(z.string(), roleSchema).optional(),
    tactics: z
      .object({
        blockHeight: z.enum(["LOW", "NORMAL", "HIGH"]),
        buildUp: z.enum(["SHORT", "BALANCED", "DIRECT"]),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((selection, context) => {
    const allPlayerIds = [
      ...Object.values(selection.starters),
      ...selection.bench,
    ];
    const duplicates = allPlayerIds.filter(
      (playerId, index) => allPlayerIds.indexOf(playerId) !== index,
    );
    if (duplicates.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["starters"],
        message: `Un joueur ne peut apparaître qu'une fois: ${[...new Set(duplicates)].join(", ")}`,
      });
    }

    const unknownRoleSlots = Object.keys(selection.roles ?? {}).filter(
      (slotId) => !FORMATION_SLOT_IDS.includes(slotId),
    );
    if (unknownRoleSlots.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["roles"],
        message: `Slots de rôle inconnus: ${unknownRoleSlots.join(", ")}`,
      });
    }
  });

export const matchSimulationRequestSchema = z
  .object({
    contractVersion: z.literal(MATCH_CONTRACT_VERSION).optional(),
    seed: z.string().trim().min(1).max(128).optional(),
    logicalSeconds: z.number().finite().min(60).max(900).optional(),
    home: teamSelectionSchema.optional(),
    away: teamSelectionSchema.optional(),
  })
  .strict();

export function parseMatchSimulationRequest(
  value: unknown,
): MatchSimulationRequest {
  return matchSimulationRequestSchema.parse(value);
}

export function assertTeamSelection(
  value: TeamSelection,
): asserts value is TeamSelection {
  teamSelectionSchema.parse(value);
}
