import { z } from "zod/v4";
import { resolveCanvasTarget } from "./canvasTarget";
import { defineCommand } from "../types";

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
      .describe("Canvas scope to modify."),
    shape_id: z
      .string()
      .min(1)
      .max(300)
      .describe("Id of the visible shape to update."),
    x: z
      .number()
      .int()
      .finite()
      .min(-100000)
      .max(100000)
      .optional()
      .describe("New page x position."),
    y: z
      .number()
      .int()
      .finite()
      .min(-100000)
      .max(100000)
      .optional()
      .describe("New page y position."),
    width: z
      .number()
      .int()
      .finite()
      .min(8)
      .max(20000)
      .optional()
      .describe("New shape width."),
    height: z
      .number()
      .int()
      .finite()
      .min(8)
      .max(20000)
      .optional()
      .describe("New shape height."),
    text: z.string().max(20000).optional().describe("New visible text."),
    color: z
      .enum([
        "black",
        "grey",
        "light-violet",
        "violet",
        "blue",
        "light-blue",
        "yellow",
        "orange",
        "green",
        "light-green",
        "light-red",
        "red",
      ])
      .optional()
      .describe("New tldraw shape color."),
  })
  .strict();

export const updateCanvasShapeCommand = defineCommand({
  effect: "update",
  visibility: "immediate",
  destructive: false,
  summary: "Update one visible canvas shape",
  description:
    "Update bounded properties of one existing shape on an open canvas.",
  helpFooter: `Example:\n  berdctl canvas update --session-id <session-id> --shape-id <shape-id> --text "Approved"\n\nResult:\n  {"ok": true} — the visible shape is updated.`,
  schema,
  execute: async (args, ctx) => {
    const target = await resolveCanvasTarget(args);
    const { updateCanvasShape } = await import("@/features/canvas/runtime");
    if (ctx.deadlineMs !== undefined && Date.now() >= ctx.deadlineMs)
      throw new Error("Canvas command timed out before mutation.");
    updateCanvasShape(
      target.boardId,
      {
        shapeId: args.shape_id,
        x: args.x,
        y: args.y,
        width: args.width,
        height: args.height,
        text: args.text,
        color: args.color,
      },
      { sessionId: target.sessionId, projectId: target.projectId },
    );
    return {
      ok: true as const,
      board_id: target.boardId,
      shape_id: args.shape_id,
    };
  },
});
