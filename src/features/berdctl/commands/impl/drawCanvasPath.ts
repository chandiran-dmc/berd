import { z } from "zod/v4";
import { defineCommand } from "../types";
import {
  canvasTargetFields,
  colorField,
  coordinateField,
  resolveAndCallCanvasRuntime,
} from "./canvasCommandHelpers";

const schema = z
  .object({
    ...canvasTargetFields,
    points: z
      .array(
        z
          .string()
          .regex(
            /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/,
            "Each point must use x,y notation.",
          ),
      )
      .min(2)
      .max(500)
      .describe("Ordered page-space points forming the pen stroke."),
    color: colorField,
    fill: z
      .enum(["none", "semi", "solid", "pattern"])
      .default("none")
      .describe("Fill style for a closed stroke."),
    closed: z
      .boolean()
      .default(false)
      .describe("Close the stroke back to its first point."),
    style: z
      .enum(["smooth", "straight"])
      .default("smooth")
      .describe("Smooth freehand path or straight point-to-point segments."),
  })
  .strict();

export const drawCanvasPathCommand = defineCommand({
  effect: "create",
  visibility: "immediate",
  destructive: false,
  summary: "Draw a freehand canvas path",
  description:
    "Create an editable freehand stroke from bounded page-space points.",
  helpFooter: `Example:\n  berdctl canvas draw --session-id <session-id> --points 100,100 --points 180,140\n\nResult:\n  {"ok": true} — the freehand path is visible and selected.`,
  schema,
  execute: async (args, ctx) => {
    const {
      session_id: _sessionId,
      project_id: _projectId,
      scope: _scope,
      points,
      ...input
    } = args;
    const parsedPoints = points.map((value) => {
      const [x, y] = value.split(",").map(Number);
      return {
        x: coordinateField("x").parse(x),
        y: coordinateField("y").parse(y),
      };
    });
    const { target, result } = await resolveAndCallCanvasRuntime(
      args,
      "draw",
      { ...input, points: parsedPoints },
      ctx,
    );
    return { ok: true as const, board_id: target.boardId, result };
  },
});
