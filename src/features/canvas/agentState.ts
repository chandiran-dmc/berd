import {
  Box,
  getArrowBindings,
  renderPlaintextFromRichText,
  type Editor,
  type JsonValue,
  type TLShape,
} from "tldraw";

export type CanvasAgentMode = "working" | "reviewing";
export type CanvasAgentTodoStatus = "open" | "in-progress" | "done";
export interface CanvasAgentTodo {
  id: string;
  title: string;
  status: CanvasAgentTodoStatus;
}
export interface CanvasAgentState {
  mode: CanvasAgentMode;
  todos: CanvasAgentTodo[];
}
export interface CanvasAgentLint {
  type: "growY-on-shape" | "overlapping-text" | "friendless-arrow";
  shapeIds: string[];
}

const META_KEY = "berdCanvasAgent";
const EMPTY_STATE: CanvasAgentState = { mode: "working", todos: [] };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

export function readCanvasAgentState(editor: Editor): CanvasAgentState {
  const raw = record(record(editor.getCurrentPage().meta)?.[META_KEY]);
  const todos = Array.isArray(raw?.todos)
    ? raw.todos.flatMap((value) => {
        const item = record(value);
        const status = item?.status;
        if (
          typeof item?.id !== "string" ||
          typeof item.title !== "string" ||
          (status !== "open" && status !== "in-progress" && status !== "done")
        )
          return [];
        return [
          {
            id: item.id,
            title: item.title,
            status: status as CanvasAgentTodoStatus,
          },
        ];
      })
    : [];
  return {
    mode: raw?.mode === "reviewing" ? "reviewing" : "working",
    todos: todos.slice(0, 50),
  };
}

export function updateCanvasAgentState(
  editor: Editor,
  update: Partial<Pick<CanvasAgentState, "mode">> & {
    todo?: CanvasAgentTodo & { remove?: boolean };
  },
) {
  const current = readCanvasAgentState(editor);
  let todos = current.todos;
  if (update.todo) {
    todos = todos.filter((item) => item.id !== update.todo?.id);
    if (!update.todo.remove) todos = [...todos, update.todo].slice(-50);
  }
  const next: CanvasAgentState = {
    mode: update.mode ?? current.mode,
    todos,
  };
  const page = editor.getCurrentPage();
  editor.updatePage({
    id: page.id,
    meta: { ...page.meta, [META_KEY]: next as unknown as JsonValue },
  });
  return next;
}

function shapeText(editor: Editor, shape: TLShape) {
  const props = record(shape.props);
  return props?.richText
    ? renderPlaintextFromRichText(
        editor,
        props.richText as Parameters<typeof renderPlaintextFromRichText>[1],
      )
    : "";
}

export function detectCanvasAgentLints(editor: Editor): CanvasAgentLint[] {
  const shapes = editor.getCurrentPageShapes();
  const lints: CanvasAgentLint[] = [];
  for (const shape of shapes) {
    const props = record(shape.props);
    if (typeof props?.growY === "number" && props.growY > 5)
      lints.push({ type: "growY-on-shape", shapeIds: [shape.id] });
    if (shape.type === "arrow") {
      const bindings = getArrowBindings(editor, shape);
      if (!bindings.start || !bindings.end)
        lints.push({ type: "friendless-arrow", shapeIds: [shape.id] });
    }
  }
  const textShapes = shapes
    .filter((shape) => shapeText(editor, shape).length > 0)
    .slice(0, 200);
  for (let index = 0; index < textShapes.length; index += 1) {
    const first = textShapes[index];
    const firstBounds = editor.getShapePageBounds(first);
    if (!firstBounds) continue;
    for (
      let otherIndex = index + 1;
      otherIndex < textShapes.length;
      otherIndex += 1
    ) {
      const second = textShapes[otherIndex];
      const secondBounds = editor.getShapePageBounds(second);
      if (secondBounds && Box.Collides(firstBounds, secondBounds))
        lints.push({
          type: "overlapping-text",
          shapeIds: [first.id, second.id],
        });
      if (lints.length >= 100) return lints;
    }
  }
  return lints;
}

export function emptyCanvasAgentState(): CanvasAgentState {
  return EMPTY_STATE;
}
