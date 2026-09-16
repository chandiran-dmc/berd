import { z } from "zod/v4";
import { CommandError, defineCommand } from "../types";
import {
  canvasTargetFields,
  resolveAndCallCanvasRuntime,
} from "./canvasCommandHelpers";

const schema = z
  .object({
    ...canvasTargetFields,
    confirm: z
      .boolean()
      .default(false)
      .describe("Explicitly confirm clearing the visible canvas page."),
  })
  .strict();

export const clearCanvasCommand = defineCommand({
  effect: "archive",
  visibility: "immediate",
  destructive: false,
  summary: "Clear the visible canvas page",
  description:
    "Delete every shape on the current page after explicit confirmation. Undo remains available.",
  helpFooter: `Example:\n  berdctl canvas clear --session-id <session-id> --confirm\n\nResult:\n  {"ok": true} — every visible shape on the current page is removed.`,
  schema,
  precheck: (args) => {
    if (!args.confirm)
      throw new CommandError(
        "invalid_args",
        "Clearing the canvas requires --confirm.",
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
      "clear",
      input,
      ctx,
    );
    return { ok: true as const, board_id: target.boardId, result };
  },
});
