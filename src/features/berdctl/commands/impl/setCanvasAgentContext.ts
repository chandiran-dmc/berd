import { z } from "zod/v4";

import {
  canvasTargetFields,
  coordinateField,
  dimensionField,
  resolveAndCallCanvasRuntime,
  shapeIdsField,
} from "./canvasCommandHelpers";
import { defineCommand } from "../types";

const schema = z
  .object({
    ...canvasTargetFields,
    operation: z
      .enum(["add-shapes", "add-area", "add-point", "remove", "clear"])
      .describe("Persistent agent context operation."),
    context_id: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe("Stable context id; required for remove, optional for add."),
    shape_ids: shapeIdsField.optional(),
    x: coordinateField("Area or point x position.").optional(),
    y: coordinateField("Area or point y position.").optional(),
    width: dimensionField("Area width.").optional(),
    height: dimensionField("Area height.").optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.operation === "add-shapes" && !value.shape_ids?.length) {
      ctx.addIssue({ code: "custom", message: "shape_ids are required" });
    }
    if (
      (value.operation === "add-area" || value.operation === "add-point") &&
      (value.x === undefined || value.y === undefined)
    ) {
      ctx.addIssue({ code: "custom", message: "x and y are required" });
    }
    if (
      value.operation === "add-area" &&
      (value.width === undefined || value.height === undefined)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "width and height are required for an area",
      });
    }
    if (value.operation === "remove" && !value.context_id) {
      ctx.addIssue({ code: "custom", message: "context_id is required" });
    }
  });

export const setCanvasAgentContextCommand = defineCommand({
  effect: "update",
  visibility: "immediate",
  destructive: false,
  summary: "Manage persistent point, area, or shape context",
  description:
    "Add, remove, or clear the Agent starter kit context items included with future canvas prompts.",
  helpFooter: `Examples:\n  berdctl canvas agent-context --session-id <session-id> --operation add-shapes --shape-ids <shape-id>\n  berdctl canvas agent-context --session-id <session-id> --operation add-area --x 0 --y 0 --width 640 --height 480\n\nResult:\n  {"action":"agent-context"} — future canvas prompts include the saved context.`,
  schema,
  execute: async (args, ctx) => {
    const contextId =
      args.context_id ?? `ctx-${crypto.randomUUID().slice(0, 12)}`;
    const contextItem =
      args.operation === "add-shapes"
        ? { id: contextId, type: "shapes", shapeIds: args.shape_ids }
        : args.operation === "add-area"
          ? {
              id: contextId,
              type: "area",
              bounds: {
                x: args.x,
                y: args.y,
                width: args.width,
                height: args.height,
              },
            }
          : args.operation === "add-point"
            ? {
                id: contextId,
                type: "point",
                point: { x: args.x, y: args.y },
              }
            : undefined;
    const operation = args.operation.startsWith("add-")
      ? "add"
      : args.operation;
    const { target, result } = await resolveAndCallCanvasRuntime(
      args,
      "agent-context",
      {
        operation,
        context_item: contextItem,
        context_id: args.context_id,
      },
      ctx,
    );
    return {
      ...(result as object),
      board_id: target.boardId,
      ...(operation === "add" ? { context_id: contextId } : null),
    };
  },
});
