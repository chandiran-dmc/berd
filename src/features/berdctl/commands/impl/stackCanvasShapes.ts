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
    shape_ids: shapeIdsField.min(2),
    direction: z
      .enum(["horizontal", "vertical"])
      .describe("Direction in which to stack the shapes."),
    gap: z
      .number()
      .finite()
      .min(0)
      .max(20000)
      .describe("Page-space gap between stacked shapes."),
  })
  .strict();

export const stackCanvasShapesCommand = defineCommand({
  effect: "update",
  visibility: "immediate",
  destructive: false,
  summary: "Stack visible canvas shapes",
  description: "Arrange two or more shapes in order with a consistent gap.",
  helpFooter: `Example:\n  berdctl canvas stack --session-id <session-id> --shape-ids <a> --shape-ids <b> --direction horizontal --gap 24\n\nResult:\n  {"ok": true} — the shapes are visibly stacked.`,
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
      "stack",
      input,
      ctx,
    );
    return { ok: true as const, board_id: target.boardId, result };
  },
});
