import { z } from "zod/v4";
import { defineCommand } from "../types";
import {
  canvasTargetFields,
  coordinateField,
  resolveAndCallCanvasRuntime,
} from "./canvasCommandHelpers";

const schema = z
  .object({
    ...canvasTargetFields,
    mode: z
      .enum(["fit", "selection", "shapes", "camera"])
      .describe("Viewport operation to apply."),
    shape_ids: z
      .array(z.string().min(1).max(300))
      .min(1)
      .max(100)
      .optional()
      .describe("Visible shape ids when mode is shapes."),
    x: coordinateField("Viewport page x center.").optional(),
    y: coordinateField("Viewport page y center.").optional(),
    zoom_percent: z
      .number()
      .int()
      .finite()
      .min(5)
      .max(1600)
      .optional()
      .describe("Viewport zoom percentage for camera mode."),
  })
  .strict();

export const setCanvasViewportCommand = defineCommand({
  effect: "update",
  visibility: "immediate",
  destructive: false,
  summary: "Set the visible canvas viewport",
  description:
    "Set the open canvas camera or fit its visible shapes in the viewport.",
  helpFooter: `Example:\n  berdctl canvas viewport --session-id <session-id> --mode camera --x 320 --y 180 --zoom-percent 125\n\nResult:\n  {"ok": true} — the canvas viewport changes visibly.`,
  schema,
  execute: async (args, ctx) => {
    const { target, result } = await resolveAndCallCanvasRuntime(
      args,
      "viewport",
      {
        mode: args.mode,
        ...(args.shape_ids === undefined ? {} : { shapeIds: args.shape_ids }),
        ...(args.x === undefined ? {} : { x: args.x }),
        ...(args.y === undefined ? {} : { y: args.y }),
        ...(args.zoom_percent === undefined
          ? {}
          : { zoom: args.zoom_percent / 100 }),
      },
      ctx,
    );
    return { ok: true as const, board_id: target.boardId, result };
  },
});
