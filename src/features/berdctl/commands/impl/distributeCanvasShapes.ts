import { z } from "zod/v4";
import { defineCommand } from "../types";
import {
  canvasTargetFields,
  resolveAndCallCanvasRuntime,
  shapeIdsField,
} from "./canvasCommandHelpers";

const schema = z
  .object({
    ...canvasTargetFields,
    shape_ids: shapeIdsField,
    axis: z
      .enum(["horizontal", "vertical"])
      .describe("Axis along which to distribute the shapes."),
  })
  .strict();

export const distributeCanvasShapesCommand = defineCommand({
  effect: "update",
  visibility: "immediate",
  destructive: false,
  summary: "Distribute visible canvas shapes",
  description: "Distribute three or more visible shapes evenly along an axis.",
  helpFooter: `Example:\n  berdctl canvas distribute --session-id <session-id> --shape-ids <shape-a> --shape-ids <shape-b> --shape-ids <shape-c> --axis horizontal\n\nResult:\n  {"ok": true} — the selected shapes are evenly distributed.`,
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
      "distribute",
      input,
      ctx,
    );
    return { ok: true as const, board_id: target.boardId, result };
  },
});
