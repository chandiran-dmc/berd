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
    shape_ids: shapeIdsField,
    scale_x_percent: z
      .number()
      .int()
      .finite()
      .min(1)
      .max(10000)
      .describe("Horizontal scale percentage for each selected shape."),
    scale_y_percent: z
      .number()
      .int()
      .finite()
      .min(1)
      .max(10000)
      .describe("Vertical scale percentage for each selected shape."),
  })
  .strict();

export const resizeCanvasShapesCommand = defineCommand({
  effect: "update",
  visibility: "immediate",
  destructive: false,
  summary: "Resize several visible canvas shapes",
  description:
    "Resize each named visible shape using bounded horizontal and vertical scale factors.",
  helpFooter: `Example:\n  berdctl canvas resize --session-id <session-id> --shape-ids <shape-a> --shape-ids <shape-b> --scale-x-percent 125 --scale-y-percent 125\n\nResult:\n  {"ok": true} — all named shapes are resized.`,
  schema,
  execute: async (args, ctx) => {
    const { target, result } = await resolveAndCallCanvasRuntime(
      args,
      "resize",
      {
        shapeIds: args.shape_ids,
        scaleX: args.scale_x_percent / 100,
        scaleY: args.scale_y_percent / 100,
      },
      ctx,
    );
    return { ok: true as const, board_id: target.boardId, result };
  },
});
