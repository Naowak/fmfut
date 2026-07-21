import { z } from "zod";

export const playerSearchSchema = z
  .object({
    query: z.string().trim().max(80).optional(),
    position: z
      .enum(["GK", "LB", "CB", "RB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST"])
      .optional(),
    nation: z.string().trim().max(80).optional(),
    minOverall: z.coerce.number().int().min(1).max(100).optional(),
    maxOverall: z.coerce.number().int().min(1).max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(40),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.minOverall !== undefined &&
      value.maxOverall !== undefined &&
      value.minOverall > value.maxOverall
    ) {
      context.addIssue({
        code: "custom",
        path: ["minOverall"],
        message: "minOverall doit être inférieur ou égal à maxOverall.",
      });
    }
  });
