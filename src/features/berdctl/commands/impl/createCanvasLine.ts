import { z } from "zod/v4";

import {
  canvasTargetFields,
  colorField,
  coordinateField,
  resolveAndCallCanvasRuntime,
} from "./canvasCommandHelpers";
import { defineCommand } from "../types";

const schema = z
  .object({
    ...canvasTargetFields,
    start_x: coordinateField("Line start x position."),
    start_y: coordinateField("Line start y position."),
    end_x: coordinateField("Line end x position."),
    end_y: coordinateField("Line end y position."),
    color: colorField,
  })
  .strict();

export const createCanvasLineCommand = defineCommand({
  effect: "create",
  visibility: "immediate",
  destructive: false,
  summary: "Create one straight canvas line",
  description:
    "Create the Agent starter kit's editable line shape between two page coordinates.",
  helpFooter: `Example:\n  berdctl canvas line --session-id <session-id> --start-x 100 --start-y 100 --end-x 300 --end-y 180\n\nResult:\n  {"action":"line"} — one editable line is visible on the open canvas.`,
  schema,
  execute: async (args, ctx) => {
    const { target, result } = await resolveAndCallCanvasRuntime(
      args,
      "line",
      {
        start: { x: args.start_x, y: args.start_y },
        end: { x: args.end_x, y: args.end_y },
        color: args.color,
      },
      ctx,
    );
    return { ...(result as object), board_id: target.boardId };
  },
});
