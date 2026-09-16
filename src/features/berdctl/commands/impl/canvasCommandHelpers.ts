import { z } from "zod/v4";

import { resolveCanvasTarget } from "./canvasTarget";
import type { CommandContext } from "../types";

export const canvasTargetFields = {
  session_id: z
    .string()
    .min(1)
    .describe("Id of the session owning the canvas."),
  project_id: z
    .string()
    .min(1)
    .optional()
    .describe("Project id for a project canvas."),
  board_id: z
    .string()
    .min(1)
    .max(128)
    .optional()
    .describe("Named board id. Omit for the default board."),
  scope: z
    .enum(["chat", "project"])
    .default("chat")
    .describe("Canvas scope to modify."),
};

export const shapeIdsField = z
  .array(z.string().min(1).max(300))
  .min(1)
  .max(100)
  .describe("One or more visible shape ids to modify.");

export const coordinateField = (description: string) =>
  z.number().finite().min(-100000).max(100000).describe(description);

export const dimensionField = (description: string) =>
  z.number().finite().min(8).max(20000).describe(description);

export const colorField = z
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
  .describe("tldraw shape color.");

export async function callCanvasRuntime(
  boardId: string,
  functionName: string,
  input: unknown,
  ctx: CommandContext,
  target?: { sessionId?: string; projectId?: string | null },
): Promise<unknown> {
  if (ctx.deadlineMs !== undefined && Date.now() >= ctx.deadlineMs) {
    throw new Error("Canvas command timed out before mutation.");
  }
  const runtime = await import("@/features/canvas/runtime");
  if (typeof runtime.executeCanvasAction !== "function")
    throw new Error("Canvas runtime does not support canvas actions.");
  const action = Object.fromEntries(
    Object.entries(input as Record<string, unknown>).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      value,
    ]),
  ) as Record<string, unknown>;
  for (const key of ["sessionId", "projectId", "boardId", "scope", "confirm"]) {
    delete action[key];
  }
  if (functionName === "ungroup" && action.groupIds !== undefined) {
    action.shapeIds = action.groupIds;
    delete action.groupIds;
  }
  return runtime.executeCanvasAction(
    boardId,
    { type: functionName, ...action } as never,
    target,
  );
}

export async function resolveAndCallCanvasRuntime(
  args: {
    session_id: string;
    project_id?: string;
    board_id?: string;
    scope: "chat" | "project";
  },
  functionName: string,
  input: unknown,
  ctx: CommandContext,
) {
  const target = await resolveCanvasTarget(args);
  const result = await callCanvasRuntime(
    target.boardId,
    functionName,
    input,
    ctx,
    { sessionId: target.sessionId, projectId: target.projectId },
  );
  return { target, result };
}
