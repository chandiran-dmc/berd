import { z } from "zod/v4";
import { defineCommand } from "../types";
import {
  canvasTargetFields,
  resolveAndCallCanvasRuntime,
  shapeIdsField,
} from "./canvasCommandHelpers";

const schema = z
  .object({ ...canvasTargetFields, shape_ids: shapeIdsField })
  .strict();

export const groupCanvasShapesCommand = defineCommand({
  effect: "update",
  visibility: "immediate",
  destructive: false,
  summary: "Group visible canvas shapes",
  description:
    "Group two or more visible shapes into one editable canvas group.",
  helpFooter: `Example:\n  berdctl canvas group --session-id <session-id> --shape-ids <shape-a> --shape-ids <shape-b>\n\nResult:\n  {"group_id": "..."} — the shapes are visibly grouped.`,
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
      "group",
      input,
      ctx,
    );
    return {
      board_id: target.boardId,
      group_id:
        typeof result === "object" &&
        result !== null &&
        "affectedShapeIds" in result &&
        Array.isArray(result.affectedShapeIds)
          ? result.affectedShapeIds[0]
          : undefined,
      result,
    };
  },
});
