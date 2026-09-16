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
    delta_x: coordinateField("Horizontal page distance to move each shape."),
    delta_y: coordinateField("Vertical page distance to move each shape."),
  })
  .strict();

export const moveCanvasShapesCommand = defineCommand({
  effect: "update",
  visibility: "immediate",
  destructive: false,
  summary: "Move several visible canvas shapes",
  description: "Move each named visible shape by the same bounded page offset.",
  helpFooter: `Example:\n  berdctl canvas move --session-id <session-id> --shape-ids <shape-a> --shape-ids <shape-b> --delta-x 40 --delta-y 0\n\nResult:\n  {"ok": true} — all named shapes move together.`,
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
      "move",
      input,
      ctx,
    );
    return { ok: true as const, board_id: target.boardId, result };
  },
});
