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
    position: z
      .enum(["front", "back", "forward", "backward"])
      .describe("Layering move to apply to the selected shapes."),
  })
  .strict();

export const reorderCanvasShapesCommand = defineCommand({
  effect: "update",
  visibility: "immediate",
  destructive: false,
  summary: "Reorder visible canvas shapes",
  description:
    "Change the visible front to back order of selected canvas shapes.",
  helpFooter: `Example:\n  berdctl canvas reorder --session-id <session-id> --shape-ids <shape-a> --position front\n\nResult:\n  {"ok": true} — the selected shapes move in the layer order.`,
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
      "reorder",
      input,
      ctx,
    );
    return { ok: true as const, board_id: target.boardId, result };
  },
});
