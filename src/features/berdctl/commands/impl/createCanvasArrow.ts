import { z } from "zod/v4";
import { defineCommand } from "../types";
import {
  resolveAndCallCanvasRuntime,
  canvasTargetFields,
  colorField,
} from "./canvasCommandHelpers";

const schema = z
  .object({
    ...canvasTargetFields,
    start_shape_id: z
      .string()
      .min(1)
      .max(300)
      .describe("Id of the visible shape where the arrow starts."),
    end_shape_id: z
      .string()
      .min(1)
      .max(300)
      .describe("Id of the visible shape where the arrow ends."),
    text: z
      .string()
      .max(20000)
      .optional()
      .describe("Visible text on the arrow."),
    color: colorField,
  })
  .strict();

export const createCanvasArrowCommand = defineCommand({
  effect: "create",
  visibility: "immediate",
  destructive: false,
  summary: "Draw one visible canvas arrow",
  description:
    "Create one visible arrow connecting two existing shapes on an open canvas.",
  helpFooter: `Example:\n  berdctl canvas arrow --session-id <session-id> --start-shape-id <from-id> --end-shape-id <to-id>\n\nResult:\n  {"action": "create-arrow"} — the arrow is visible on the open canvas.`,
  schema,
  execute: async (args, ctx) => {
    const {
      session_id: _sessionId,
      project_id: _projectId,
      scope: _scope,
      ...input
    } = args;
    const { result } = await resolveAndCallCanvasRuntime(
      args,
      "create-arrow",
      {
        startShapeId: args.start_shape_id,
        endShapeId: args.end_shape_id,
        ...(input.text === undefined ? {} : { text: input.text }),
        ...(input.color === undefined ? {} : { color: input.color }),
      },
      ctx,
    );
    return {
      result,
      shape_id:
        typeof result === "object" &&
        result !== null &&
        "affectedShapeIds" in result &&
        Array.isArray(result.affectedShapeIds)
          ? result.affectedShapeIds[0]
          : undefined,
    };
  },
});
