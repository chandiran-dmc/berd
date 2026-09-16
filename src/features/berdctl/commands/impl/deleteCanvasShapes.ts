import { z } from "zod/v4";
import { defineCommand, CommandError } from "../types";
import {
  canvasTargetFields,
  resolveAndCallCanvasRuntime,
  shapeIdsField,
} from "./canvasCommandHelpers";

const schema = z
  .object({
    ...canvasTargetFields,
    shape_ids: shapeIdsField,
    confirm: z
      .boolean()
      .default(false)
      .describe("Explicitly confirm deleting these visible shapes."),
  })
  .strict();

export const deleteCanvasShapesCommand = defineCommand({
  effect: "archive",
  visibility: "immediate",
  destructive: false,
  summary: "Delete visible canvas shapes",
  description:
    "Delete the named visible shapes after explicit caller confirmation.",
  helpFooter: `Example:\n  berdctl canvas delete --session-id <session-id> --shape-ids <shape-id> --confirm\n\nResult:\n  {"deleted": 1} — the selected shapes are removed from the visible canvas.`,
  schema,
  precheck: (args) => {
    if (!args.confirm)
      throw new CommandError(
        "invalid_args",
        "Deleting canvas shapes requires --confirm.",
      );
  },
  execute: async (args, ctx) => {
    const {
      session_id: _sessionId,
      project_id: _projectId,
      scope: _scope,
      confirm: _confirm,
      ...input
    } = args;
    const { target, result } = await resolveAndCallCanvasRuntime(
      args,
      "delete",
      input,
      ctx,
    );
    return { ok: true as const, board_id: target.boardId, result };
  },
});
