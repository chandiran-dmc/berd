import { z } from "zod/v4";
import { defineCommand } from "../types";
import {
  canvasTargetFields,
  coordinateField,
  resolveAndCallCanvasRuntime,
  shapeIdsField,
} from "./canvasCommandHelpers";

const schema = z
  .object({
    ...canvasTargetFields,
    shape_ids: shapeIdsField,
    degrees: z
      .number()
      .finite()
      .min(-3600)
      .max(3600)
      .describe("Clockwise rotation in degrees."),
    origin_x: coordinateField(
      "Optional page-space rotation origin x.",
    ).optional(),
    origin_y: coordinateField(
      "Optional page-space rotation origin y.",
    ).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.origin_x === undefined) !== (value.origin_y === undefined))
      ctx.addIssue({
        code: "custom",
        message: "origin_x and origin_y must be supplied together",
      });
  });

export const rotateCanvasShapesCommand = defineCommand({
  effect: "update",
  visibility: "immediate",
  destructive: false,
  summary: "Rotate visible canvas shapes",
  description:
    "Rotate shapes around their shared center or an explicit page-space origin.",
  helpFooter: `Example:\n  berdctl canvas rotate --session-id <session-id> --shape-ids <shape-id> --degrees 45\n\nResult:\n  {"ok": true} — the shape is visibly rotated.`,
  schema,
  execute: async (args, ctx) => {
    const {
      session_id: _sessionId,
      project_id: _projectId,
      scope: _scope,
      ...input
    } = args;
    const { target, result } = await resolveAndCallCanvasRuntime(
      args,
      "rotate",
      input,
      ctx,
    );
    return { ok: true as const, board_id: target.boardId, result };
  },
});
