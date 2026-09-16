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
      .describe("Canvas scope to inspect."),
  })
  .strict();

export const getCanvasContextCommand = defineCommand({
  effect: "read",
  visibility: "immediate",
  destructive: false,
  summary: "Read the visible canvas context",
  description:
    "Read the selected canvas identity, visible shapes, and selection.",
  helpFooter: `Example:\n  berdctl canvas context --session-id <session-id> --scope chat\n\nResult:\n  {"board_id": "...", "shape_count": 0, "selection": []}`,
  schema,
  execute: async (args) => {
    const { getCanvasContext } = await import("@/features/canvas/runtime");
    const board = await resolveCanvasTarget(args);
    const context = getCanvasContext(board.boardId);
    if (!context)
      throw new Error(
        `Canvas ${board.boardId} is not open; run berdctl canvas open first.`,
      );
    if (!context)
      throw new Error(
        `Canvas ${board.boardId} is not open; run berdctl canvas open first.`,
      );
    return context;
  },
});
