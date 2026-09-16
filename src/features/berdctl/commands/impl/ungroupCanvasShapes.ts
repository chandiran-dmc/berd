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
    group_ids: shapeIdsField.describe(
      "One or more visible group ids to ungroup.",
    ),
  })
  .strict();

export const ungroupCanvasShapesCommand = defineCommand({
  effect: "update",
  visibility: "immediate",
  destructive: false,
  summary: "Ungroup visible canvas groups",
  description:
    "Ungroup the named visible canvas groups while preserving their children.",
  helpFooter: `Example:\n  berdctl canvas ungroup --session-id <session-id> --group-ids <group-id>\n\nResult:\n  {"ok": true} — the group is removed and its shapes remain visible.`,
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
      "ungroup",
      input,
      ctx,
    );
    return { ok: true as const, board_id: target.boardId, result };
  },
});
