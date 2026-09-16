import { z } from "zod/v4";
import { defineCommand } from "../types";
import {
  canvasTargetFields,
  resolveAndCallCanvasRuntime,
} from "./canvasCommandHelpers";

const schema = z
  .object({
    ...canvasTargetFields,
    steps: z
      .number()
      .int()
      .finite()
      .min(1)
      .max(20)
      .default(1)
      .describe("Number of recent visible canvas changes to undo."),
  })
  .strict();

export const undoCanvasCommand = defineCommand({
  effect: "update",
  visibility: "immediate",
  destructive: false,
  summary: "Undo visible canvas changes",
  description: "Undo one or more recent changes on the open canvas.",
  helpFooter: `Example:\n  berdctl canvas undo --session-id <session-id> --steps 1\n\nResult:\n  {"ok": true} — recent canvas changes are undone visibly.`,
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
      "undo",
      input,
      ctx,
    );
    return { ok: true as const, board_id: target.boardId, result };
  },
});
