import { renderPlaintextFromRichText, type Editor, type TLShape } from "tldraw";
import type { ChatImageAttachmentDraft } from "@/shared/types/messages";
import { resizeImage } from "@/features/chat/lib/resizeImage";
import type { CanvasBoardIdentity } from "./canvasIdentity";
import { detectCanvasAgentLints, readCanvasAgentState } from "./agentState";

export type CanvasContextMode = "viewport" | "selection";
const MAX_SHAPES = 100;
const MAX_TEXT = 500;
const MAX_JSON = 64_000;
const recent = new WeakMap<
  Editor,
  {
    revision: number;
    edits: {
      revision: number;
      added: string[];
      updated: string[];
      removed: string[];
    }[];
  }
>();

export function trackCanvasEdits(editor: Editor) {
  const state = {
    revision: 0,
    edits: [] as {
      revision: number;
      added: string[];
      updated: string[];
      removed: string[];
    }[],
  };
  recent.set(editor, state);
  return editor.store.listen(
    ({ changes }) => {
      const shapeIds = (records: Record<string, unknown>) =>
        Object.keys(records)
          .filter((id) => id.startsWith("shape:"))
          .sort()
          .slice(0, 50);
      const added = shapeIds(changes.added);
      const updated = shapeIds(changes.updated);
      const removed = shapeIds(changes.removed);
      if (!(added.length || updated.length || removed.length)) return;
      state.edits.push({ revision: ++state.revision, added, updated, removed });
      state.edits = state.edits.slice(-10);
    },
    { scope: "document" },
  );
}

const round = (value: number) => Math.round(value * 100) / 100;
function bounds(box: { x: number; y: number; w: number; h: number }) {
  return {
    x: round(box.x),
    y: round(box.y),
    width: round(box.w),
    height: round(box.h),
  };
}
function describe(editor: Editor, shape: TLShape, focused: boolean) {
  const box = editor.getShapePageBounds(shape);
  const props = shape.props as Record<string, unknown>;
  const text = props.richText
    ? renderPlaintextFromRichText(
        editor,
        props.richText as Parameters<typeof renderPlaintextFromRichText>[1],
      )
    : typeof props.text === "string"
      ? props.text
      : "";
  const detail: Record<string, unknown> = {};
  for (const key of [
    "geo",
    "color",
    "fill",
    "size",
    "font",
    "align",
    "textAlign",
    "dash",
    "arrowheadStart",
    "arrowheadEnd",
    "assetId",
    "start",
    "end",
  ]) {
    if (props[key] !== undefined && focused) detail[key] = props[key];
  }
  return {
    id: shape.id,
    type: shape.type,
    parentId: shape.parentId,
    bounds: box ? bounds(box) : null,
    rotation: round(shape.rotation),
    text: text.slice(0, MAX_TEXT),
    textTruncated: text.length > MAX_TEXT,
    ...detail,
  };
}

export function collectCanvasContext(
  editor: Editor,
  identity: CanvasBoardIdentity,
  mode: CanvasContextMode,
) {
  const viewport = editor.getViewportPageBounds();
  const selected = new Set(editor.getSelectedShapeIds());
  const shapes = editor
    .getCurrentPageShapes()
    .sort((a, b) => a.id.localeCompare(b.id));
  const visible = shapes.filter((shape) => {
    const box = editor.getShapePageBounds(shape);
    return box && viewport.collides(box);
  });
  const visibleIds = new Set(visible.map((shape) => shape.id));
  const relevant = [
    ...shapes.filter((shape) => selected.has(shape.id)),
    ...visible.filter((shape) => !selected.has(shape.id)),
  ];
  const offscreen = shapes.filter(
    (shape) => !visibleIds.has(shape.id) && !selected.has(shape.id),
  );
  const clusters = new Map<
    string,
    {
      count: number;
      x: number;
      y: number;
      right: number;
      bottom: number;
      types: Record<string, number>;
    }
  >();
  for (const shape of offscreen) {
    const box = editor.getShapePageBounds(shape);
    if (!box) continue;
    const key = `${Math.floor(box.x / 2000)},${Math.floor(box.y / 2000)}`;
    const cluster = clusters.get(key) ?? {
      count: 0,
      x: box.x,
      y: box.y,
      right: box.maxX,
      bottom: box.maxY,
      types: {},
    };
    cluster.count++;
    cluster.x = Math.min(cluster.x, box.x);
    cluster.y = Math.min(cluster.y, box.y);
    cluster.right = Math.max(cluster.right, box.maxX);
    cluster.bottom = Math.max(cluster.bottom, box.maxY);
    cluster.types[shape.type] = (cluster.types[shape.type] ?? 0) + 1;
    clusters.set(key, cluster);
  }
  const camera = editor.getCamera();
  const state = recent.get(editor);
  const selectionBounds = editor.getSelectionPageBounds();
  const context = {
    version: 1,
    boardId: identity.boardId,
    scope: identity.scope,
    projectId: identity.projectId,
    sessionId: identity.sessionId,
    pageId: editor.getCurrentPageId(),
    mode,
    revision: state?.revision ?? 0,
    viewport: bounds(viewport),
    camera: { x: round(camera.x), y: round(camera.y), zoom: round(camera.z) },
    selectionBounds: selectionBounds ? bounds(selectionBounds) : null,
    selectedShapeIds: [...selected].sort().slice(0, MAX_SHAPES),
    totalSelected: selected.size,
    shapeCount: shapes.length,
    visibleShapeCount: visible.length,
    shapes: relevant
      .slice(0, MAX_SHAPES)
      .map((shape) => describe(editor, shape, selected.has(shape.id))),
    omittedRelevantShapes: Math.max(0, relevant.length - MAX_SHAPES),
    offscreenShapeCount: offscreen.length,
    offscreenClusters: [...clusters.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 24)
      .map(([, c]) => ({
        count: c.count,
        bounds: bounds({ x: c.x, y: c.y, w: c.right - c.x, h: c.bottom - c.y }),
        types: c.types,
      })),
    omittedOffscreenClusters: Math.max(0, clusters.size - 24),
    recentEdits: [...(state?.edits ?? [])],
    omittedRecentEdits: 0,
    agentState: readCanvasAgentState(editor),
    canvasLints: detectCanvasAgentLints(editor),
  };
  while (
    new TextEncoder().encode(JSON.stringify(context)).length > MAX_JSON &&
    context.shapes.length
  ) {
    context.shapes.pop();
    context.omittedRelevantShapes++;
  }
  const exceedsBudget = () =>
    new TextEncoder().encode(JSON.stringify(context)).length > MAX_JSON;
  while (exceedsBudget() && context.recentEdits.length) {
    context.recentEdits.shift();
    context.omittedRecentEdits++;
  }
  while (exceedsBudget() && context.offscreenClusters.length) {
    context.offscreenClusters.pop();
    context.omittedOffscreenClusters++;
  }
  while (exceedsBudget() && context.selectedShapeIds.length)
    context.selectedShapeIds.pop();
  if (exceedsBudget())
    throw new Error("Canvas identifiers exceed the attachment budget.");
  return context;
}

export async function createCanvasAttachment(
  editor: Editor,
  identity: CanvasBoardIdentity,
  mode: CanvasContextMode,
): Promise<ChatImageAttachmentDraft> {
  if (mode === "selection" && !editor.getSelectedShapeIds().length)
    throw new Error("Select shapes before asking about a selection.");
  const context = collectCanvasContext(editor, identity, mode);
  const captureBounds =
    mode === "selection"
      ? editor.getSelectionPageBounds()
      : editor.getViewportPageBounds();
  if (!captureBounds)
    throw new Error("The selection is no longer available. Attach it again.");
  const shapes = editor.getCurrentPageShapes();
  if (!shapes.length)
    throw new Error("Add something to this board before attaching it.");
  const { blob } = await editor.toImage(shapes, {
    bounds: captureBounds,
    format: "png",
    background: true,
    padding: 0,
    pixelRatio: 1,
    scale: Math.min(1, 1600 / Math.max(captureBounds.w, captureBounds.h)),
  });
  const normalized = await resizeImage(
    new File([blob], "canvas.png", { type: "image/png" }),
  );
  const label =
    mode === "selection"
      ? `${context.totalSelected} selected shapes`
      : `${context.visibleShapeCount} visible shapes`;
  return {
    id: crypto.randomUUID(),
    kind: "image",
    name: `Canvas · ${label}`,
    ...normalized,
    previewUrl: `data:${normalized.mimeType};base64,${normalized.base64}`,
    canvasContext: {
      boardId: identity.boardId,
      summary: `${label} · ${context.offscreenShapeCount} offscreen · screenshot, shapes, selection, camera and recent edits`,
      json: JSON.stringify(context),
    },
  };
}
