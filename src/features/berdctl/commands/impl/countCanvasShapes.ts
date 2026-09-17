import { z } from "zod/v4";

import { canvasTargetFields, colorField } from "./canvasCommandHelpers";
import { resolveCanvasTarget } from "./canvasTarget";
import { defineCommand } from "../types";

const schema = z
  .object({
    ...canvasTargetFields,
    type: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional()
      .describe("Optional tldraw or geometric shape type."),
    text: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .optional()
      .describe("Optional case-insensitive text fragment."),
    color: colorField,
  })
  .strict();

export const countCanvasShapesCommand = defineCommand({
  effect: "read",
  visibility: "immediate",
  destructive: false,
  summary: "Count canvas shapes matching optional filters",
  description:
    "Count all current-page shapes or filter by shape type, visible text, and color.",
  helpFooter: `Examples:\n  berdctl canvas count --session-id <session-id>\n  berdctl canvas count --session-id <session-id> --type rectangle --color blue\n\nResult:\n  {"count":2,"shape_ids":["shape:..."]} — matching visible shapes are returned.`,
  schema,
  execute: async (args, ctx) => {
    const target = await resolveCanvasTarget(args);
    if (ctx.deadlineMs !== undefined && Date.now() >= ctx.deadlineMs)
      throw new Error("Canvas command timed out before reading.");
    const { countCanvasShapes } = await import("@/features/canvas/runtime");
    const result = countCanvasShapes(
      target.boardId,
      { type: args.type, text: args.text, color: args.color },
      { sessionId: target.sessionId, projectId: target.projectId },
    );
    return {
      count: result.count,
      shape_ids: result.shapeIds,
      shape_ids_truncated: result.shapeIdsTruncated,
      board_id: target.boardId,
    };
  },
});
