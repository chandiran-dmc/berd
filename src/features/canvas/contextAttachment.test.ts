import { describe, expect, it, vi } from "vitest";
vi.hoisted(() => {
  if (typeof CSS === "undefined")
    Object.defineProperty(globalThis, "CSS", {
      value: { supports: () => false },
      configurable: true,
    });
  else if (typeof CSS.supports !== "function")
    Object.defineProperty(CSS, "supports", {
      value: () => false,
      configurable: true,
    });
});
import { Box, type Editor, type TLShape } from "tldraw";
import { collectCanvasContext } from "./contextAttachment";
import { getCanvasBoardIdentity } from "./canvasIdentity";

describe("canvas context", () => {
  it("prioritizes selection, summarizes offscreen shapes and bounds deterministic serialization", () => {
    const shapes = Array.from({ length: 400 }, (_, i) => ({
      id: `shape:${String(i).padStart(3, "0")}`,
      type: "geo",
      parentId: "page:p",
      x: i < 200 ? i : 5000 + i,
      y: 0,
      rotation: 0,
      props: { text: "x".repeat(2000), color: "red" },
    })) as unknown as TLShape[];
    const editor = {
      getCurrentPageShapes: () => [...shapes].reverse(),
      getSelectedShapeIds: () => [shapes[399].id],
      getViewportPageBounds: () => new Box(0, 0, 1000, 1000),
      getShapePageBounds: (shape: TLShape) =>
        new Box(shape.x, shape.y, 100, 100),
      getCamera: () => ({ x: 0, y: 0, z: 1 }),
      getCurrentPageId: () => "page:p",
      getCurrentPage: () => ({ id: "page:p", meta: {} }),
      getSelectionPageBounds: () => new Box(5399, 0, 100, 100),
    } as unknown as Editor;
    const identity = getCanvasBoardIdentity({ sessionId: "s", scope: "chat" });
    const context = collectCanvasContext(editor, identity, "selection");
    expect(context.shapes[0].id).toBe(shapes[399].id);
    expect(context.offscreenShapeCount).toBe(199);
    expect(context.offscreenClusters.reduce((sum, c) => sum + c.count, 0)).toBe(
      199,
    );
    expect(context.shapes.length).toBeLessThanOrEqual(100);
    expect(context.omittedRelevantShapes).toBeGreaterThan(0);
    expect(JSON.stringify(context).length).toBeLessThanOrEqual(64000);
    expect(collectCanvasContext(editor, identity, "selection")).toEqual(
      context,
    );
  });
});
