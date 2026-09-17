import { z } from "zod/v4";

import {
  canvasTargetFields,
  coordinateField,
  resolveAndCallCanvasRuntime,
} from "./canvasCommandHelpers";
import { defineCommand } from "../types";

const schema = z
  .object({
    ...canvasTargetFields,
    shape_id: z.string().min(1).max(300).describe("Shape to place."),
    reference_shape_id: z
      .string()
      .min(1)
      .max(300)
      .describe("Existing shape used as the placement reference."),
    side: z
      .enum(["top", "bottom", "left", "right"])
      .describe("Side of the reference shape."),
    align: z
      .enum(["start", "center", "end"])
      .default("center")
      .describe("Alignment along the selected side."),
    side_offset: coordinateField("Gap from the reference shape.").default(0),
    align_offset: coordinateField("Offset along the alignment axis.").default(
      0,
    ),
  })
  .strict();

export const placeCanvasShapeCommand = defineCommand({
  effect: "update",
  visibility: "immediate",
  destructive: false,
  summary: "Place one shape relative to another",
  description:
    "Place an existing shape on a named side of a reference shape with bounded offsets.",
  helpFooter: `Example:\n  berdctl canvas place --session-id <session-id> --shape-id <shape> --reference-shape-id <reference> --side right --align center --side-offset 24\n\nResult:\n  {"action":"place"} — the shape is visibly placed relative to the reference.`,
  schema,
  execute: async (args, ctx) => {
    const { target, result } = await resolveAndCallCanvasRuntime(
      args,
      "place",
      {
        shape_ids: [args.shape_id],
        reference_shape_id: args.reference_shape_id,
        side: args.side,
        align: args.align,
        side_offset: args.side_offset,
        align_offset: args.align_offset,
      },
      ctx,
    );
    return { ...(result as object), board_id: target.boardId };
  },
});
