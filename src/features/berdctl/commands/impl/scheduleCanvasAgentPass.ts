import { z } from "zod/v4";

import {
  callCanvasRuntime,
  canvasTargetFields,
  coordinateField,
  dimensionField,
} from "./canvasCommandHelpers";
import { resolveCanvasTarget } from "./canvasTarget";
import { defineCommand } from "../types";

const reviewSchema = z
  .object({
    ...canvasTargetFields,
    intent: z
      .string()
      .trim()
      .min(1)
      .max(2_000)
      .describe("What the follow-up review should verify."),
    x: coordinateField("Review-area x position."),
    y: coordinateField("Review-area y position."),
    width: dimensionField("Review-area width."),
    height: dimensionField("Review-area height."),
  })
  .strict();

const detailSchema = z
  .object({
    ...canvasTargetFields,
    intent: z
      .string()
      .trim()
      .min(1)
      .max(2_000)
      .default("Add detail to the canvas.")
      .describe("What detail the follow-up pass should add."),
  })
  .strict();

async function scheduleFollowUp({
  sessionId,
  boardId,
  projectId,
  prompt,
  ctx,
}: {
  sessionId: string;
  boardId: string;
  projectId: string | null;
  prompt: string;
  ctx: { deadlineMs?: number };
}) {
  if (ctx.deadlineMs !== undefined && Date.now() >= ctx.deadlineMs)
    throw new Error("Canvas command timed out before capture.");
  const { createMountedCanvasAttachment } = await import(
    "@/features/canvas/runtime"
  );
  const attachment = await createMountedCanvasAttachment(boardId, "viewport", {
    sessionId,
    projectId,
  });
  const { deliverSessionPrompt } = await import(
    "../runtime/deliverSessionPrompt"
  );
  const delivery = await deliverSessionPrompt(
    {
      session_id: sessionId,
      prompt,
      if_running: "queue",
      from: "canvas agent",
      attachments: [attachment],
    },
    { eventType: "notification" },
  );
  return delivery.send_status;
}

export const scheduleCanvasReviewCommand = defineCommand({
  effect: "update",
  visibility: "immediate",
  destructive: false,
  summary: "Schedule a visual canvas review pass",
  description:
    "Frame an area, capture fresh visual and structured context, and queue the Agent starter kit review pass in the same session.",
  helpFooter: `Example:\n  berdctl canvas review --session-id <session-id> --intent "Check spacing and arrow labels" --x 0 --y 0 --width 800 --height 600\n\nResult:\n  {"send_status":"queued"} — a fresh visual review runs after the current turn.`,
  schema: reviewSchema,
  bridgeTimeoutMs: 60_000,
  execute: async (args, ctx) => {
    const target = await resolveCanvasTarget(args);
    await callCanvasRuntime(
      target.boardId,
      "agent-review",
      {
        intent: args.intent,
        bounds: {
          x: args.x,
          y: args.y,
          width: args.width,
          height: args.height,
        },
      },
      ctx,
      { sessionId: target.sessionId, projectId: target.projectId },
    );
    const sendStatus = await scheduleFollowUp({
      sessionId: target.sessionId,
      boardId: target.boardId,
      projectId: target.projectId,
      prompt: `Review the attached current canvas area with this intent: ${args.intent}\n\nCheck the work completed since the preceding user request. Correct any visual or structural issues you find with berdctl canvas commands, update the canvas todo list, and finish only when the requested result is complete.`,
      ctx,
    });
    return {
      board_id: target.boardId,
      mode: "reviewing" as const,
      send_status: sendStatus,
    };
  },
});

export const scheduleCanvasDetailCommand = defineCommand({
  effect: "update",
  visibility: "immediate",
  destructive: false,
  summary: "Schedule another visual canvas detail pass",
  description:
    "Capture fresh visual and structured context and queue another Agent starter kit work pass in the same session.",
  helpFooter: `Example:\n  berdctl canvas add-detail --session-id <session-id> --intent "Add labels and supporting notes"\n\nResult:\n  {"send_status":"queued"} — another visual work pass runs after the current turn.`,
  schema: detailSchema,
  bridgeTimeoutMs: 60_000,
  execute: async (args, ctx) => {
    const target = await resolveCanvasTarget(args);
    await callCanvasRuntime(
      target.boardId,
      "agent-state",
      { mode: "working" },
      ctx,
      { sessionId: target.sessionId, projectId: target.projectId },
    );
    const sendStatus = await scheduleFollowUp({
      sessionId: target.sessionId,
      boardId: target.boardId,
      projectId: target.projectId,
      prompt: `Continue working from the attached current canvas state. Intent: ${args.intent}\n\nUse berdctl canvas commands for visible edits, keep the todo list current, and schedule a review pass if the result needs visual verification.`,
      ctx,
    });
    return {
      board_id: target.boardId,
      mode: "working" as const,
      send_status: sendStatus,
    };
  },
});
