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
    alignment: z
      .enum([
        "left",
        "right",
        "top",
        "bottom",
        "center-horizontal",
        "center-vertical",
        "center",
      ])
      .describe("Edge or center line on which to align the shapes."),
  })
  .strict();

export const alignCanvasShapesCommand = defineCommand({
  effect: "update",
  visibility: "immediate",
  destructive: false,
  summary: "Align visible canvas shapes",
  description:
    "Align two or more visible shapes to a shared edge or center line.",
  helpFooter: `Example:\n  berdctl canvas align --session-id <session-id> --shape-ids <shape-a> --shape-ids <shape-b> --alignment left\n\nResult:\n  {"ok": true} — the selected shapes are visibly aligned.`,
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
      "align",
      input,
      ctx,
    );
    return { ok: true as const, board_id: target.boardId, result };
  },
});
