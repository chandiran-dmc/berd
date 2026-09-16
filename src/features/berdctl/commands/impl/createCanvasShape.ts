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
    scope: z
      .enum(["chat", "project"])
      .default("chat")
      .describe("Canvas scope to modify."),
    kind: z
      .enum(["rectangle", "ellipse", "note", "text"])
      .describe("Bounded shape kind to create."),
    x: z
      .number()
      .int()
      .finite()
      .min(-100000)
      .max(100000)
      .describe("Page x position."),
    y: z
      .number()
      .int()
      .finite()
      .min(-100000)
      .max(100000)
      .describe("Page y position."),
    width: z
      .number()
      .int()
      .finite()
      .min(8)
      .max(20000)
      .optional()
      .describe("Shape width for geometric shapes."),
    height: z
      .number()
      .int()
      .finite()
      .min(8)
      .max(20000)
      .optional()
      .describe("Shape height for geometric shapes."),
    text: z
      .string()
      .max(20000)
      .optional()
      .describe("Visible text inside the shape."),
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
      .describe("tldraw shape color."),
  })
  .strict();

export const createCanvasShapeCommand = defineCommand({
  effect: "create",
  visibility: "immediate",
  destructive: false,
  summary: "Create one visible canvas shape",
  description:
    "Create exactly one bounded shape on an already visible session or project canvas.",
  helpFooter: `Example:\n  berdctl canvas add --session-id <session-id> --kind rectangle --x 100 --y 100\n\nResult:\n  {"shape_id": "..."} — one shape is visible on the open canvas.`,
  schema,
  execute: async (args, ctx) => {
    const target = await resolveCanvasTarget(args);
    const { createCanvasShape } = await import("@/features/canvas/runtime");
    if (ctx.deadlineMs !== undefined && Date.now() >= ctx.deadlineMs)
      throw new Error("Canvas command timed out before mutation.");
    const {
      session_id: _sessionId,
      project_id: _projectId,
      scope: _scope,
      ...shape
    } = args;
    const id = createCanvasShape(target.boardId, shape);
    return { shape_id: id, board_id: target.boardId };
  },
});
