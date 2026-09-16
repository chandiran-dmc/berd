import { z } from "zod/v4";
import {
  createShapeId,
  renderPlaintextFromRichText,
  toRichText,
  type Editor,
  type TLShapeId,
} from "tldraw";
import {
  closeCanvas,
  openCanvas,
  type CanvasOpenRequest,
} from "./canvasEvents";
import type { CanvasBoardIdentity } from "./canvasIdentity";

export { closeCanvas, openCanvas };
export type { CanvasOpenRequest };

const mountedEditors = new Map<string, Editor>();
const mountedBoards = new Map<string, CanvasBoardIdentity>();

const coordinateSchema = z.number().finite().min(-100_000).max(100_000);
const dimensionSchema = z.number().finite().min(8).max(20_000);
const colorSchema = z.enum([
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
]);

const createShapeSchema = z
  .object({
    kind: z.enum(["rectangle", "ellipse", "note", "text"]),
    x: coordinateSchema,
    y: coordinateSchema,
    width: dimensionSchema.optional(),
    height: dimensionSchema.optional(),
    text: z.string().max(20_000).optional(),
    color: colorSchema.optional(),
  })
  .strict()
  .superRefine((shape, ctx) => {
    if (
      (shape.kind === "note" || shape.kind === "text") &&
      (shape.width !== undefined || shape.height !== undefined)
    ) {
      ctx.addIssue({
        code: "custom",
        message: `${shape.kind} shapes do not accept width or height`,
      });
    }
  });

const updateShapeSchema = z
  .object({
    shapeId: z.string().min(1).max(300),
    x: coordinateSchema.optional(),
    y: coordinateSchema.optional(),
    width: dimensionSchema.optional(),
    height: dimensionSchema.optional(),
    text: z.string().max(20_000).optional(),
    color: colorSchema.optional(),
  })
  .strict();

export type CanvasCreateShapeInput = z.input<typeof createShapeSchema>;
export type CanvasUpdateShapeInput = z.input<typeof updateShapeSchema>;

export interface CanvasContext {
  boardId: string;
  scope: CanvasBoardIdentity["scope"];
  sessionId: string;
  projectId: string | null;
  shapeCount: number;
  shapes: CanvasShapeContext[];
  shapesTruncated: boolean;
  selectedShapeIds: string[];
}

export interface CanvasShapeContext {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color?: string;
}

const MAX_CONTEXT_SHAPES = 200;

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function describeShape(editor: Editor, shape: ReturnType<Editor["getShape"]>) {
  if (!shape) return null;
  const props = recordValue(shape.props);
  const richText = props?.richText;
  const text = richText
    ? renderPlaintextFromRichText(
        editor,
        richText as Parameters<typeof renderPlaintextFromRichText>[1],
      )
    : "";
  const bounds = editor.getShapePageBounds(shape);
  return {
    id: String(shape.id),
    type:
      shape.type === "geo" && typeof props?.geo === "string"
        ? props.geo
        : shape.type,
    x: shape.x,
    y: shape.y,
    width: bounds?.width ?? 0,
    height: bounds?.height ?? 0,
    text,
    ...(typeof props?.color === "string" ? { color: props.color } : null),
  } satisfies CanvasShapeContext;
}

export function registerMountedEditor(
  identity: CanvasBoardIdentity,
  editor: Editor,
): () => void {
  mountedEditors.set(identity.boardId, editor);
  mountedBoards.set(identity.boardId, identity);
  return () => {
    if (mountedEditors.get(identity.boardId) === editor) {
      mountedEditors.delete(identity.boardId);
      mountedBoards.delete(identity.boardId);
    }
  };
}

export function getMountedEditor(boardId?: string): Editor | null {
  if (boardId) return mountedEditors.get(boardId) ?? null;
  if (mountedEditors.size !== 1) return null;
  return mountedEditors.values().next().value ?? null;
}

function requireMountedEditor(boardId: string): Editor {
  const editor = getMountedEditor(boardId);
  if (!editor) {
    throw new Error(`Canvas ${boardId} is not open`);
  }
  return editor;
}

export function getCanvasContext(boardId?: string): CanvasContext | null {
  const editor = getMountedEditor(boardId);
  if (!editor) return null;
  const resolvedBoardId =
    boardId ??
    [...mountedEditors.entries()].find(
      ([, candidate]) => candidate === editor,
    )?.[0];
  if (!resolvedBoardId) return null;
  const board = mountedBoards.get(resolvedBoardId);
  if (!board) return null;

  const currentShapes = editor.getCurrentPageShapes();
  const shapes = currentShapes
    .slice(0, MAX_CONTEXT_SHAPES)
    .map((shape) => describeShape(editor, shape))
    .filter((shape): shape is CanvasShapeContext => shape !== null);

  return {
    boardId: resolvedBoardId,
    scope: board.scope,
    sessionId: board.sessionId,
    projectId: board.projectId,
    shapeCount: currentShapes.length,
    shapes,
    shapesTruncated: currentShapes.length > MAX_CONTEXT_SHAPES,
    selectedShapeIds: editor.getSelectedShapeIds().map(String),
  };
}

export function createCanvasShape(
  boardId: string,
  rawInput: CanvasCreateShapeInput,
): string {
  const input = createShapeSchema.parse(rawInput);
  const editor = requireMountedEditor(boardId);
  const id = createShapeId();
  const color = input.color ?? "black";

  editor.markHistoryStoppingPoint("agent create canvas shape");
  if (input.kind === "note") {
    editor.createShape({
      id,
      type: "note",
      x: input.x,
      y: input.y,
      props: {
        color,
        richText: toRichText(input.text ?? ""),
      },
    });
  } else if (input.kind === "text") {
    editor.createShape({
      id,
      type: "text",
      x: input.x,
      y: input.y,
      props: {
        color,
        richText: toRichText(input.text ?? ""),
      },
    });
  } else {
    editor.createShape({
      id,
      type: "geo",
      x: input.x,
      y: input.y,
      props: {
        geo: input.kind,
        w: input.width ?? 240,
        h: input.height ?? 144,
        color,
        richText: toRichText(input.text ?? ""),
      },
    });
  }

  editor.select(id);
  editor.zoomToSelection();

  return id;
}

export function updateCanvasShape(
  boardId: string,
  rawInput: CanvasUpdateShapeInput,
): void {
  const input = updateShapeSchema.parse(rawInput);
  const editor = requireMountedEditor(boardId);
  const shape = editor.getShape(input.shapeId as TLShapeId);
  if (!shape) throw new Error(`Shape ${input.shapeId} does not exist`);
  if (!editor.getCurrentPageShapeIds().has(shape.id)) {
    throw new Error(`Shape ${input.shapeId} is not on the current canvas page`);
  }
  if (
    !(["geo", "note", "text"] as const).includes(
      shape.type as "geo" | "note" | "text",
    )
  ) {
    throw new Error(
      `Shape type ${shape.type} cannot be updated by canvas commands`,
    );
  }
  if (
    shape.type !== "geo" &&
    (input.width !== undefined || input.height !== undefined)
  ) {
    throw new Error(
      `${shape.type} shapes do not accept width or height updates`,
    );
  }

  const props: Record<string, unknown> = {};
  if (input.color !== undefined) props.color = input.color;
  if (input.width !== undefined) props.w = input.width;
  if (input.height !== undefined) props.h = input.height;
  if (input.text !== undefined) props.richText = toRichText(input.text);

  editor.markHistoryStoppingPoint("agent update canvas shape");
  editor.updateShape({
    id: shape.id,
    type: shape.type,
    ...(input.x === undefined ? null : { x: input.x }),
    ...(input.y === undefined ? null : { y: input.y }),
    ...(Object.keys(props).length === 0 ? null : { props }),
  });
  editor.select(shape.id);
  editor.zoomToSelection();
}
