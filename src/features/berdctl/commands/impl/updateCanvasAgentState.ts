import { z } from "zod/v4";
import { defineCommand } from "../types";
import {
  canvasTargetFields,
  resolveAndCallCanvasRuntime,
} from "./canvasCommandHelpers";

const schema = z
  .object({
    ...canvasTargetFields,
    mode: z
      .enum(["idling", "working", "reviewing"])
      .optional()
      .describe("Canvas agent mode."),
    todo_id: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe("Stable task id to add, update, or remove."),
    todo_title: z.string().min(1).max(500).optional().describe("Task title."),
    todo_status: z
      .enum(["open", "in-progress", "done", "removed"])
      .optional()
      .describe("Task status; removed deletes the task."),
  })
  .strict()
  .superRefine((value, ctx) => {
    const todoFields = [value.todo_id, value.todo_title, value.todo_status];
    const hasAnyTodo = todoFields.some((field) => field !== undefined);
    if (!value.mode && !hasAnyTodo)
      ctx.addIssue({ code: "custom", message: "Provide mode or todo fields." });
    if (hasAnyTodo && todoFields.some((field) => field === undefined))
      ctx.addIssue({
        code: "custom",
        message: "todo_id, todo_title, and todo_status are required together.",
      });
  });

export const updateCanvasAgentStateCommand = defineCommand({
  effect: "update",
  visibility: "immediate",
  destructive: false,
  summary: "Update canvas agent mode or task list",
  description:
    "Switch between working and reviewing modes or maintain the board's visible agent task list.",
  helpFooter: `Examples:\n  berdctl canvas agent-state --session-id <session-id> --mode reviewing\n  berdctl canvas agent-state --session-id <session-id> --todo-id layout --todo-title "Align cards" --todo-status in-progress\n\nResult:\n  {"ok": true} — the agent state is updated on the visible board.`,
  schema,
  execute: async (args, ctx) => {
    const {
      session_id: _sessionId,
      project_id: _projectId,
      scope: _scope,
      mode,
      todo_id,
      todo_title,
      todo_status,
    } = args;
    const todo =
      todo_id && todo_title && todo_status
        ? {
            id: todo_id,
            title: todo_title,
            status: todo_status === "removed" ? "done" : todo_status,
            remove: todo_status === "removed",
          }
        : undefined;
    const { target, result } = await resolveAndCallCanvasRuntime(
      args,
      "agent-state",
      { mode, todo },
      ctx,
    );
    return { ok: true as const, board_id: target.boardId, result };
  },
});
