import { z } from "zod/v4";
import {
  AssetRecordType,
  b64Vecs,
  Box,
  createShapeId,
  renderPlaintextFromRichText,
  toRichText,
  type Editor,
  type IndexKey,
  type TLImageAsset,
  type TLDrawShapeSegment,
  type TLShapeId,
} from "tldraw";
import {
  announceCanvasAction,
  canvasActionSchema,
  type CanvasAction,
  type CanvasActionResult,
} from "./actions";
import {
  closeCanvas,
  openCanvas,
  type CanvasOpenRequest,
} from "./canvasEvents";
import type { CanvasBoardIdentity } from "./canvasIdentity";
import { readCanvasAgentState, updateCanvasAgentState } from "./agentState";
import {
  createCanvasAttachment,
  type CanvasContextMode,
} from "./contextAttachment";

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

const AGENT_GEO_TO_TLDRAW_GEO = {
  rectangle: "rectangle",
  ellipse: "ellipse",
  triangle: "triangle",
  diamond: "diamond",
  hexagon: "hexagon",
  pill: "oval",
  cloud: "cloud",
  "x-box": "x-box",
  "check-box": "check-box",
  heart: "heart",
  pentagon: "pentagon",
  octagon: "octagon",
  star: "star",
  "parallelogram-right": "rhombus",
  "parallelogram-left": "rhombus-2",
  trapezoid: "trapezoid",
  "fat-arrow-right": "arrow-right",
  "fat-arrow-left": "arrow-left",
  "fat-arrow-up": "arrow-up",
  "fat-arrow-down": "arrow-down",
} as const;

const createShapeSchema = z
  .object({
    kind: z.enum([
      "rectangle",
      "ellipse",
      "triangle",
      "diamond",
      "hexagon",
      "pill",
      "cloud",
      "x-box",
      "check-box",
      "heart",
      "pentagon",
      "octagon",
      "star",
      "parallelogram-right",
      "parallelogram-left",
      "trapezoid",
      "fat-arrow-right",
      "fat-arrow-left",
      "fat-arrow-up",
      "fat-arrow-down",
      "note",
      "text",
    ]),
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

export interface CanvasShapeQuery {
  type?: string;
  text?: string;
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

export async function createMountedCanvasAttachment(
  boardId: string,
  mode: CanvasContextMode,
  expectedTarget?: CanvasActionTarget,
) {
  const editor = requireMountedEditor(boardId);
  requireTarget(boardId, expectedTarget);
  const identity = mountedBoards.get(boardId);
  if (!identity) throw new Error(`Canvas ${boardId} is not open`);
  return createCanvasAttachment(editor, identity, mode);
}

function requireMountedEditor(boardId: string): Editor {
  const editor = getMountedEditor(boardId);
  if (!editor) {
    throw new Error(`Canvas ${boardId} is not open`);
  }
  return editor;
}

function requireCurrentPageShapeIds(
  editor: Editor,
  rawIds: string[],
): TLShapeId[] {
  const ids = [...new Set(rawIds)].map((id) => id as TLShapeId);
  const currentIds = editor.getCurrentPageShapeIds();
  const missing = ids.filter((id) => !editor.getShape(id));
  if (missing.length)
    throw new Error(`Shapes do not exist: ${missing.join(", ")}`);
  const offPage = ids.filter((id) => !currentIds.has(id));
  if (offPage.length) {
    throw new Error(
      `Shapes are not on the current canvas page: ${offPage.join(", ")}`,
    );
  }
  return ids;
}

export interface CanvasActionTarget {
  sessionId?: string;
  projectId?: string | null;
}

function requireTarget(boardId: string, expected?: CanvasActionTarget): void {
  if (!expected) return;
  const mounted = mountedBoards.get(boardId);
  if (!mounted) throw new Error(`Canvas ${boardId} is not open`);
  if (
    expected.sessionId !== undefined &&
    expected.sessionId !== mounted.sessionId
  ) {
    throw new Error(
      `Canvas ${boardId} does not belong to session ${expected.sessionId}`,
    );
  }
  if (
    mounted.scope === "project" &&
    expected.projectId !== undefined &&
    expected.projectId !== mounted.projectId
  ) {
    throw new Error(
      `Canvas ${boardId} does not belong to project ${expected.projectId ?? "none"}`,
    );
  }
}

function hasExpectedImageSignature(mimeType: string, bytes: Uint8Array) {
  if (mimeType === "image/png")
    return [137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => bytes[index] === value,
    );
  if (mimeType === "image/jpeg")
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return (
    mimeType === "image/webp" &&
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  );
}

export async function executeCanvasAction(
  boardId: string,
  rawAction: CanvasAction,
  expectedTarget?: CanvasActionTarget,
): Promise<CanvasActionResult> {
  const action = canvasActionSchema.parse(rawAction);
  const editor = requireMountedEditor(boardId);
  requireTarget(boardId, expectedTarget);
  let affectedShapeIds: string[] = [];
  let message = "Canvas updated";

  if (action.type === "undo") {
    for (let index = 0; index < action.steps; index += 1) editor.undo();
    message = `Undid ${action.steps} canvas operation${action.steps === 1 ? "" : "s"}`;
  } else if (action.type === "agent-state") {
    editor.markHistoryStoppingPoint("agent canvas state");
    const state = updateCanvasAgentState(editor, action);
    message = action.todo
      ? `${action.todo.remove ? "Removed" : "Updated"} agent task ${action.todo.title}`
      : `Canvas agent mode changed to ${state.mode}`;
  } else if (action.type === "agent-context") {
    editor.markHistoryStoppingPoint("agent canvas context");
    if (action.operation === "add" && action.contextItem?.type === "shapes") {
      requireCurrentPageShapeIds(editor, action.contextItem.shapeIds);
    }
    const existingContextItem =
      action.operation === "remove"
        ? readCanvasAgentState(editor).contextItems.find(
            (item) => item.id === action.contextId,
          )
        : undefined;
    if (action.operation === "remove" && !existingContextItem) {
      throw new Error(
        `Canvas agent context ${action.contextId} does not exist`,
      );
    }
    const state = updateCanvasAgentState(editor, {
      clearContext: action.operation === "clear",
      contextItem:
        action.operation === "add" && action.contextItem
          ? action.contextItem
          : existingContextItem
            ? { ...existingContextItem, remove: true }
            : undefined,
    });
    message = `Canvas agent now has ${state.contextItems.length} context ${state.contextItems.length === 1 ? "item" : "items"}`;
  } else if (action.type === "agent-review") {
    editor.markHistoryStoppingPoint("agent canvas review");
    updateCanvasAgentState(editor, {
      mode: "reviewing",
      contextItem: {
        id: "review-area",
        type: "area",
        bounds: action.bounds,
      },
    });
    editor.zoomToBounds(
      new Box(
        action.bounds.x,
        action.bounds.y,
        action.bounds.width,
        action.bounds.height,
      ),
      { inset: 64 },
    );
    message = `Prepared review area: ${action.intent}`;
  } else if (action.type === "viewport") {
    if (action.mode === "fit")
      editor.zoomToFit({ animation: { duration: 180 } });
    if (action.mode === "selection")
      editor.zoomToSelection({ animation: { duration: 180 } });
    if (action.mode === "camera") {
      editor.setCamera(
        {
          x: action.x as number,
          y: action.y as number,
          z: action.zoom as number,
        },
        { animation: { duration: 180 } },
      );
    }
    if (action.mode === "shapes") {
      const ids = requireCurrentPageShapeIds(editor, action.shapeIds ?? []);
      const shapeBounds = ids
        .map((id) => editor.getShapePageBounds(id))
        .filter((bounds): bounds is Box => bounds !== null);
      if (shapeBounds.length !== ids.length)
        throw new Error("Could not determine bounds for the requested shapes");
      const bounds = Box.Common(shapeBounds);
      editor.zoomToBounds(bounds, { animation: { duration: 180 }, inset: 64 });
      affectedShapeIds = ids.map(String);
    }
    message = `Canvas viewport changed to ${action.mode}`;
  } else {
    if (action.type === "draw") {
      editor.markHistoryStoppingPoint(`agent canvas ${action.type}`);
      const id = createShapeId();
      const points = action.closed
        ? [...action.points, action.points[0]]
        : action.points;
      const minX = Math.min(...points.map((point) => point.x));
      const minY = Math.min(...points.map((point) => point.y));
      const path = b64Vecs.encodePoints(
        points.map((point) => ({
          x: point.x - minX,
          y: point.y - minY,
          z: 0.75,
        })),
      );
      const segments: TLDrawShapeSegment[] = [
        { type: action.style === "straight" ? "straight" : "free", path },
      ];
      editor.createShape({
        id,
        type: "draw",
        x: minX,
        y: minY,
        props: {
          color: action.color ?? "black",
          fill: action.fill,
          dash: "draw",
          size: "s",
          segments,
          isComplete: true,
          isClosed: action.closed,
          isPen: true,
        },
      });
      affectedShapeIds = [String(id)];
      editor.select(id);
      message = `Drew a ${action.closed ? "closed" : "freehand"} shape`;
    } else if (action.type === "line") {
      editor.markHistoryStoppingPoint(`agent canvas ${action.type}`);
      const id = createShapeId();
      editor.createShape({
        id,
        type: "line",
        x: action.start.x,
        y: action.start.y,
        props: {
          color: action.color ?? "black",
          points: {
            a1: {
              id: "a1",
              index: "a1" as IndexKey,
              x: 0,
              y: 0,
            },
            a2: {
              id: "a2",
              index: "a2" as IndexKey,
              x: action.end.x - action.start.x,
              y: action.end.y - action.start.y,
            },
          },
          spline: "line",
        },
      });
      affectedShapeIds = [String(id)];
      editor.select(id);
      message = "Created line";
    } else if (action.type === "create-arrow") {
      const [startId, endId] = requireCurrentPageShapeIds(editor, [
        action.startShapeId,
        action.endShapeId,
      ]);
      if (startId === endId)
        throw new Error("An arrow must connect two different shapes");
      const startBounds = editor.getShapePageBounds(startId);
      const endBounds = editor.getShapePageBounds(endId);
      if (!startBounds || !endBounds)
        throw new Error("Could not determine connector endpoints");
      editor.markHistoryStoppingPoint(`agent canvas ${action.type}`);
      const id = createShapeId();
      editor.createShape({
        id,
        type: "arrow",
        x: startBounds.center.x,
        y: startBounds.center.y,
        props: {
          color: action.color ?? "black",
          richText: toRichText(action.text ?? ""),
          start: { x: 0, y: 0 },
          end: {
            x: endBounds.center.x - startBounds.center.x,
            y: endBounds.center.y - startBounds.center.y,
          },
        },
      });
      editor.createBindings([
        {
          type: "arrow",
          fromId: id,
          toId: startId,
          props: {
            terminal: "start",
            normalizedAnchor: { x: 0.5, y: 0.5 },
            isExact: false,
            isPrecise: false,
            snap: "none",
          },
        },
        {
          type: "arrow",
          fromId: id,
          toId: endId,
          props: {
            terminal: "end",
            normalizedAnchor: { x: 0.5, y: 0.5 },
            isExact: false,
            isPrecise: false,
            snap: "none",
          },
        },
      ]);
      affectedShapeIds = [String(id), String(startId), String(endId)];
      editor.select(id);
      message = `Connected ${startId} to ${endId}`;
    } else if (action.type === "place-image") {
      const expectedPrefix = `data:${action.mimeType};base64,`;
      if (!action.src.startsWith(expectedPrefix)) {
        throw new Error(
          "Canvas images must use a matching PNG, JPEG, or WebP data URL so they remain available offline",
        );
      }
      const encoded = action.src.slice(expectedPrefix.length);
      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(atob(encoded), (character) =>
          character.charCodeAt(0),
        );
      } catch {
        throw new Error("Canvas image data is not valid base64");
      }
      if (bytes.length === 0 || bytes.length > 10 * 1024 * 1024) {
        throw new Error("Canvas images must contain 1 byte to 10 MiB of data");
      }
      if (!hasExpectedImageSignature(action.mimeType, bytes)) {
        throw new Error("Canvas image data does not match its MIME type");
      }
      editor.markHistoryStoppingPoint(`agent canvas ${action.type}`);
      const assetId = AssetRecordType.createId();
      const id = createShapeId();
      const asset = AssetRecordType.create({
        id: assetId,
        type: "image",
        props: {
          name: action.name,
          src: null,
          mimeType: action.mimeType,
          w: action.width,
          h: action.height,
          fileSize: bytes.length,
          isAnimated: false,
        },
        meta: {},
      }) as TLImageAsset;
      const upload = await editor.uploadAsset(
        asset,
        new File([Uint8Array.from(bytes).buffer], action.name, {
          type: action.mimeType,
        }),
      );
      editor.createAssets([
        {
          ...asset,
          props: {
            ...asset.props,
            src: upload.src,
          },
          meta: upload.meta ? { ...asset.meta, ...upload.meta } : asset.meta,
        },
      ]);
      editor.createShape({
        id,
        type: "image",
        x: action.x,
        y: action.y,
        props: {
          assetId,
          w: action.width,
          h: action.height,
          altText: action.altText ?? "",
        },
      });
      affectedShapeIds = [String(id)];
      editor.select(id);
      message = `Placed image ${action.name}`;
    } else if (action.type === "clear") {
      const ids = [...editor.getCurrentPageShapeIds()];
      editor.markHistoryStoppingPoint(`agent canvas ${action.type}`);
      editor.deleteShapes(ids);
      affectedShapeIds = ids.map(String);
      message = `Cleared ${ids.length} shape${ids.length === 1 ? "" : "s"}`;
    } else {
      const ids = requireCurrentPageShapeIds(editor, action.shapeIds);
      editor.markHistoryStoppingPoint(`agent canvas ${action.type}`);
      affectedShapeIds = ids.map(String);
      if (action.type === "delete") {
        editor.deleteShapes(ids);
        message = `Deleted ${ids.length} shape${ids.length === 1 ? "" : "s"}`;
      } else if (action.type === "group") {
        const groupId = createShapeId();
        editor.groupShapes(ids, { groupId, select: true });
        affectedShapeIds = [String(groupId), ...affectedShapeIds];
        message = `Grouped ${ids.length} shapes`;
      } else if (action.type === "ungroup") {
        const invalid = ids.filter(
          (id) => editor.getShape(id)?.type !== "group",
        );
        if (invalid.length)
          throw new Error(
            `Only group shapes can be ungrouped: ${invalid.join(", ")}`,
          );
        editor.ungroupShapes(ids, { select: true });
        message = `Ungrouped ${ids.length} group${ids.length === 1 ? "" : "s"}`;
      } else if (action.type === "move") {
        editor.updateShapes(
          ids.map((id) => {
            const shape = editor.getShape(id);
            if (!shape) throw new Error(`Shape ${id} does not exist`);
            return {
              id,
              type: shape.type,
              x: shape.x + action.deltaX,
              y: shape.y + action.deltaY,
            };
          }),
        );
        editor.select(...ids);
        message = `Moved ${ids.length} shape${ids.length === 1 ? "" : "s"}`;
      } else if (action.type === "place") {
        const [id] = ids;
        const referenceId = requireCurrentPageShapeIds(editor, [
          action.referenceShapeId,
        ])[0];
        if (id === referenceId)
          throw new Error("A shape cannot be placed relative to itself");
        const shape = editor.getShape(id);
        const shapeBounds = editor.getShapePageBounds(id);
        const referenceBounds = editor.getShapePageBounds(referenceId);
        if (!shape || !shapeBounds || !referenceBounds)
          throw new Error("Could not determine placement bounds");
        const sideCoordinate =
          action.side === "top"
            ? {
                x: referenceBounds.x,
                y: referenceBounds.y - shapeBounds.h - action.sideOffset,
              }
            : action.side === "bottom"
              ? {
                  x: referenceBounds.x,
                  y: referenceBounds.maxY + action.sideOffset,
                }
              : action.side === "left"
                ? {
                    x: referenceBounds.x - shapeBounds.w - action.sideOffset,
                    y: referenceBounds.y,
                  }
                : {
                    x: referenceBounds.maxX + action.sideOffset,
                    y: referenceBounds.y,
                  };
        if (action.side === "top" || action.side === "bottom") {
          sideCoordinate.x =
            action.align === "start"
              ? referenceBounds.x + action.alignOffset
              : action.align === "center"
                ? referenceBounds.center.x -
                  shapeBounds.w / 2 +
                  action.alignOffset
                : referenceBounds.maxX - shapeBounds.w - action.alignOffset;
        } else {
          sideCoordinate.y =
            action.align === "start"
              ? referenceBounds.y + action.alignOffset
              : action.align === "center"
                ? referenceBounds.center.y -
                  shapeBounds.h / 2 +
                  action.alignOffset
                : referenceBounds.maxY - shapeBounds.h - action.alignOffset;
        }
        editor.updateShape({
          id,
          type: shape.type,
          x: shape.x + sideCoordinate.x - shapeBounds.x,
          y: shape.y + sideCoordinate.y - shapeBounds.y,
        });
        editor.select(id);
        message = `Placed ${id} ${action.side} of ${referenceId}`;
      } else if (action.type === "resize") {
        for (const id of ids)
          editor.resizeShape(id, { x: action.scaleX, y: action.scaleY });
        editor.select(...ids);
        message = `Resized ${ids.length} shape${ids.length === 1 ? "" : "s"}`;
      } else if (action.type === "rotate") {
        const commonBounds = Box.Common(
          ids
            .map((id) => editor.getShapePageBounds(id))
            .filter((bounds): bounds is Box => bounds !== null),
        );
        editor.rotateShapesBy(ids, (action.degrees * Math.PI) / 180, {
          center:
            action.originX === undefined
              ? commonBounds.center
              : { x: action.originX, y: action.originY as number },
        });
        message = `Rotated ${ids.length} shape${ids.length === 1 ? "" : "s"}`;
      } else if (action.type === "stack") {
        editor.stackShapes(ids, action.direction, action.gap);
        message = `Stacked ${ids.length} shapes ${action.direction}ly`;
      } else if (action.type === "align") {
        editor.alignShapes(ids, action.alignment);
        editor.select(...ids);
        message = `Aligned ${ids.length} shapes ${action.alignment}`;
      } else if (action.type === "distribute") {
        editor.distributeShapes(ids, action.axis);
        editor.select(...ids);
        message = `Distributed ${ids.length} shapes ${action.axis}`;
      } else if (action.type === "reorder") {
        if (action.position === "front") editor.bringToFront(ids);
        if (action.position === "back") editor.sendToBack(ids);
        if (action.position === "forward") editor.bringForward(ids);
        if (action.position === "backward") editor.sendBackward(ids);
        editor.select(...ids);
        message = `Moved ${ids.length} shape${ids.length === 1 ? "" : "s"} ${action.position}`;
      }
    }
  }

  const result = { boardId, action: action.type, affectedShapeIds, message };
  announceCanvasAction(result);
  return result;
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

export function countCanvasShapes(
  boardId: string,
  query: CanvasShapeQuery,
  expectedTarget?: CanvasActionTarget,
) {
  const editor = requireMountedEditor(boardId);
  requireTarget(boardId, expectedTarget);
  const normalizedText = query.text?.trim().toLocaleLowerCase();
  const matches = editor.getCurrentPageShapes().filter((shape) => {
    const description = describeShape(editor, shape);
    if (!description) return false;
    if (
      query.type &&
      description.type.toLocaleLowerCase() !== query.type.toLocaleLowerCase()
    )
      return false;
    if (
      query.color &&
      description.color?.toLocaleLowerCase() !== query.color.toLocaleLowerCase()
    )
      return false;
    if (
      normalizedText &&
      !description.text.toLocaleLowerCase().includes(normalizedText)
    )
      return false;
    return true;
  });
  return {
    count: matches.length,
    shapeIds: matches.slice(0, 100).map((shape) => String(shape.id)),
    shapeIdsTruncated: matches.length > 100,
  };
}

export function createCanvasShape(
  boardId: string,
  rawInput: CanvasCreateShapeInput,
  expectedTarget?: CanvasActionTarget,
): string {
  const input = createShapeSchema.parse(rawInput);
  const editor = requireMountedEditor(boardId);
  requireTarget(boardId, expectedTarget);
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
    const geo = AGENT_GEO_TO_TLDRAW_GEO[input.kind];
    editor.createShape({
      id,
      type: "geo",
      x: input.x,
      y: input.y,
      props: {
        geo,
        w: input.width ?? 240,
        h: input.height ?? 144,
        color,
        richText: toRichText(input.text ?? ""),
      },
    });
  }

  editor.select(id);
  editor.zoomToSelection();

  announceCanvasAction({
    boardId,
    action: "create-shape",
    affectedShapeIds: [String(id)],
    message: `Created ${input.kind}`,
  });

  return id;
}

export function updateCanvasShape(
  boardId: string,
  rawInput: CanvasUpdateShapeInput,
  expectedTarget?: CanvasActionTarget,
): void {
  const input = updateShapeSchema.parse(rawInput);
  const editor = requireMountedEditor(boardId);
  requireTarget(boardId, expectedTarget);
  const shape = editor.getShape(input.shapeId as TLShapeId);
  if (!shape) throw new Error(`Shape ${input.shapeId} does not exist`);
  if (!editor.getCurrentPageShapeIds().has(shape.id)) {
    throw new Error(`Shape ${input.shapeId} is not on the current canvas page`);
  }
  if (
    !(["geo", "note", "text", "line", "arrow", "draw"] as const).includes(
      shape.type as "geo" | "note" | "text" | "line" | "arrow" | "draw",
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
  if (
    input.text !== undefined &&
    !(["geo", "note", "text", "arrow"] as const).includes(
      shape.type as "geo" | "note" | "text" | "arrow",
    )
  ) {
    throw new Error(`Shape type ${shape.type} does not accept text updates`);
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
  announceCanvasAction({
    boardId,
    action: "update-shape",
    affectedShapeIds: [String(shape.id)],
    message: `Updated ${shape.id}`,
  });
}
