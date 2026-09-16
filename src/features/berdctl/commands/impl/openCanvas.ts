import { z } from "zod/v4";

import { defineCommand } from "../types";
import { resolveCanvasTarget } from "./canvasTarget";

const schema = z
  .object({
    session_id: z
      .string()
      .min(1)
      .describe("Id of the session owning the canvas."),
    project_id: z
      .string()
      .min(1)
      .optional()
      .describe("Project id for a project canvas."),
    board_id: z
      .string()
      .min(1)
      .max(128)
      .optional()
      .describe("Named board id. Omit for the default board."),
    scope: z
      .enum(["chat", "project"])
      .default("chat")
      .describe("Canvas scope to open."),
  })
  .strict();

export const openCanvasCommand = defineCommand({
  effect: "update",
  visibility: "immediate",
  destructive: false,
  summary: "Open a session canvas and make it visible",
  description: "Open the selected chat or project canvas in the app window.",
  helpFooter: `Example:\n  berdctl canvas open --session-id <session-id> --scope chat\n\nResult:\n  {"board_id": "...", "scope": "chat"} — the canvas is visible.`,
  schema,
  execute: async (args, ctx) => {
    const { openCanvas } = await import("@/features/canvas/runtime");
    const target = await resolveCanvasTarget(args);
    const outcome = await (await import("../../navigation"))
      .getAppNavigationController()
      .openSession(target.sessionId);
    if (!outcome.ok) {
      throw new Error(
        `Unable to open session "${target.sessionId}" (${outcome.reason}).`,
      );
    }
    const deadline = ctx.deadlineMs ?? Date.now() + 5000;
    const { getCanvasContext } = await import("@/features/canvas/runtime");
    const isTargetVisible = () =>
      getCanvasContext(target.boardId)?.sessionId === target.sessionId;
    while (Date.now() < deadline && !isTargetVisible()) {
      await openCanvas({
        sessionId: target.sessionId,
        projectId: target.projectId,
        scope: target.scope,
        boardId: target.boardId,
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (!isTargetVisible())
      throw new Error(
        `Canvas ${target.boardId} did not become visible before timeout.`,
      );
    return { board_id: target.boardId, scope: target.scope };
  },
});
