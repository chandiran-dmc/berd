import { IconBrain, IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { Editor } from "tldraw";
import {
  detectCanvasAgentLints,
  emptyCanvasAgentState,
  readCanvasAgentState,
  updateCanvasAgentState,
  type CanvasAgentState,
} from "./agentState";

export function AgentKitControls({
  editor,
  busy,
  onAsk,
}: {
  editor: Editor | null;
  busy: boolean;
  onAsk: (prompt: string) => void;
}) {
  const [state, setState] = useState<CanvasAgentState>(emptyCanvasAgentState);
  const [lintCount, setLintCount] = useState(0);
  const [selectionCount, setSelectionCount] = useState(0);
  const [todoTitle, setTodoTitle] = useState("");

  useEffect(() => {
    if (!editor) {
      setState(emptyCanvasAgentState());
      setLintCount(0);
      setSelectionCount(0);
      return;
    }
    const refresh = () => {
      setState(readCanvasAgentState(editor));
      setLintCount(detectCanvasAgentLints(editor).length);
    };
    const refreshSelection = () =>
      setSelectionCount(editor.getSelectedShapeIds().length);
    refresh();
    refreshSelection();
    const stopDocumentListener = editor.store.listen(refresh, {
      scope: "document",
    });
    const stopSessionListener = editor.store.listen(refreshSelection, {
      scope: "session",
    });
    return () => {
      stopDocumentListener();
      stopSessionListener();
    };
  }, [editor]);

  const update = (value: Parameters<typeof updateCanvasAgentState>[1]) => {
    if (!editor) return;
    editor.markHistoryStoppingPoint("canvas agent state");
    setState(updateCanvasAgentState(editor, value));
  };
  const addTodo = () => {
    const title = todoTitle.trim();
    if (!title) return;
    update({
      todo: {
        id: crypto.randomUUID().slice(0, 12),
        title,
        status: "open",
      },
    });
    setTodoTitle("");
  };
  const addSelectionContext = () => {
    if (!editor) return;
    const shapeIds = editor.getSelectedShapeIds().map(String);
    if (!shapeIds.length) return;
    update({
      contextItem: {
        id: crypto.randomUUID().slice(0, 12),
        type: "shapes",
        shapeIds,
      },
    });
  };
  const addViewportContext = () => {
    if (!editor) return;
    const viewport = editor.getViewportPageBounds();
    update({
      contextItem: {
        id: crypto.randomUUID().slice(0, 12),
        type: "area",
        bounds: {
          x: viewport.x,
          y: viewport.y,
          width: viewport.w,
          height: viewport.h,
        },
      },
    });
  };
  const addCenterPointContext = () => {
    if (!editor) return;
    const center = editor.getViewportPageBounds().center;
    update({
      contextItem: {
        id: crypto.randomUUID().slice(0, 12),
        type: "point",
        point: { x: center.x, y: center.y },
      },
    });
  };
  const prompt =
    state.mode === "reviewing"
      ? "Review this canvas using the attached screenshot, structured shapes, recent edits, task list, and canvas lints. Explain the most important issues before making changes; use berdctl canvas commands only when I ask you to fix them."
      : "Continue working on this canvas using the attached screenshot, structured shapes, recent edits, task list, and canvas lints. Use berdctl canvas commands for visible edits, keep the task list current, and verify the result with canvas context.";

  return (
    <details className="group relative">
      <summary
        aria-label="Canvas agent controls"
        className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-full px-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
      >
        <IconBrain className="size-4" aria-hidden="true" />
        Agent
        {state.todos.length || lintCount ? (
          <span className="rounded-full bg-muted-foreground/15 px-1.5 text-[10px]">
            {state.todos.length} tasks · {lintCount} lints
          </span>
        ) : null}
      </summary>
      <div className="absolute right-0 top-10 z-[420] w-80 rounded-lg border border-border bg-card p-3 text-xs shadow-lg">
        <p className="font-semibold text-foreground">Agent starter workspace</p>
        <p className="mt-1 text-muted-foreground">
          Berd chat supplies the model and streaming history. This board
          supplies modes, tasks, visual context, lints, and canvas actions.
        </p>
        <fieldset
          aria-label="Canvas agent mode"
          className="mt-3 flex rounded-md bg-muted p-0.5"
        >
          {(["idling", "working", "reviewing"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={state.mode === mode}
              onClick={() => update({ mode })}
              className="flex-1 rounded px-2 py-1.5 capitalize text-muted-foreground aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-mini"
            >
              {mode}
            </button>
          ))}
        </fieldset>
        <p className="mt-3 font-medium text-foreground">Prompt context</p>
        <div className="mt-1 grid grid-cols-3 gap-1">
          <button
            type="button"
            disabled={!editor || selectionCount === 0}
            onClick={addSelectionContext}
            className="rounded border border-border px-1.5 py-1.5 disabled:opacity-40"
          >
            Selection
          </button>
          <button
            type="button"
            disabled={!editor}
            onClick={addViewportContext}
            className="rounded border border-border px-1.5 py-1.5 disabled:opacity-40"
          >
            Area
          </button>
          <button
            type="button"
            disabled={!editor}
            onClick={addCenterPointContext}
            className="rounded border border-border px-1.5 py-1.5 disabled:opacity-40"
          >
            Point
          </button>
        </div>
        {state.contextItems.length ? (
          <ul className="mt-2 max-h-28 space-y-1 overflow-auto">
            {state.contextItems.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-md bg-muted/60 px-2 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate">
                  {item.type === "shapes"
                    ? `${item.shapeIds.length} selected ${item.shapeIds.length === 1 ? "shape" : "shapes"}`
                    : item.type === "area"
                      ? `Area ${Math.round(item.bounds.width)}×${Math.round(item.bounds.height)}`
                      : `Point ${Math.round(item.point.x)}, ${Math.round(item.point.y)}`}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${item.type} context`}
                  onClick={() =>
                    update({ contextItem: { ...item, remove: true } })
                  }
                  className="text-muted-foreground hover:text-foreground"
                >
                  <IconTrash className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-3 flex gap-1">
          <input
            aria-label="New canvas agent task"
            value={todoTitle}
            maxLength={500}
            onChange={(event) => setTodoTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addTodo();
            }}
            placeholder="Add a task"
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            aria-label="Add canvas agent task"
            onClick={addTodo}
            className="inline-flex size-8 items-center justify-center rounded-md bg-foreground text-background"
          >
            <IconPlus className="size-4" aria-hidden="true" />
          </button>
        </div>
        {state.todos.length ? (
          <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
            {state.todos.map((todo) => (
              <li
                key={todo.id}
                className="flex items-center gap-2 rounded-md bg-muted/60 px-2 py-1.5"
              >
                <input
                  type="checkbox"
                  aria-label={`Complete ${todo.title}`}
                  checked={todo.status === "done"}
                  onChange={(event) =>
                    update({
                      todo: {
                        ...todo,
                        status: event.target.checked ? "done" : "open",
                      },
                    })
                  }
                />
                <span className="min-w-0 flex-1 truncate">{todo.title}</span>
                <button
                  type="button"
                  aria-label={`Remove ${todo.title}`}
                  onClick={() => update({ todo: { ...todo, remove: true } })}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <IconTrash className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-2 text-muted-foreground">
          {lintCount} canvas {lintCount === 1 ? "lint" : "lints"} detected
        </p>
        <button
          type="button"
          disabled={!editor || busy}
          onClick={() => {
            if (state.mode === "idling") update({ mode: "working" });
            onAsk(prompt);
          }}
          className="mt-3 w-full rounded-md bg-foreground px-3 py-2 font-medium text-background disabled:opacity-40"
        >
          {state.mode === "reviewing"
            ? "Review with agent"
            : state.mode === "idling"
              ? "Start agent"
              : "Continue with agent"}
        </button>
      </div>
    </details>
  );
}
