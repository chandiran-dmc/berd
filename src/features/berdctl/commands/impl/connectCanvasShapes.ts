import { z } from "zod/v4";
import { defineCommand } from "../types";
import {
  canvasTargetFields,
  colorField,
  resolveAndCallCanvasRuntime,
} from "./canvasCommandHelpers";

const schema = z
  .object({
    ...canvasTargetFields,
    from_shape_id: z
      .string()
      .min(1)
      .max(300)
      .describe("Id of the shape where the connector starts."),
    to_shape_id: z
      .string()
      .min(1)
      .max(300)
      .describe("Id of the shape where the connector ends."),
    text: z
      .string()
      .max(20000)
      .optional()
      .describe("Visible text on the connector."),
    color: colorField,
  })
  .strict();

export const connectCanvasShapesCommand = defineCommand({
  effect: "create",
  visibility: "immediate",
  destructive: false,
  summary: "Connect two visible canvas shapes",
  description: "Create one visible connector between two existing shapes.",
  helpFooter: `Example:\n  berdctl canvas connect --session-id <session-id> --from-shape-id <from-id> --to-shape-id <to-id>\n\nResult:\n  {"shape_id": "..."} — the connector is visible on the open canvas.`,
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
        startShapeId: args.from_shape_id,
        endShapeId: args.to_shape_id,
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
