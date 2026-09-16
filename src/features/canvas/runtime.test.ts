import { afterEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "tldraw";
import { getCanvasBoardIdentity } from "./canvasIdentity";

vi.hoisted(() => {
  if (typeof CSS === "undefined") {
    Object.defineProperty(globalThis, "CSS", {
      configurable: true,
      value: { supports: () => false },
    });
  } else if (typeof CSS.supports !== "function") {
    Object.defineProperty(CSS, "supports", {
      configurable: true,
      value: () => false,
    });
  }
});

import {
  createCanvasShape,
  getCanvasContext,
  getMountedEditor,
  registerMountedEditor,
  updateCanvasShape,
} from "./runtime";

function makeEditor(overrides: Partial<Editor> = {}): Editor {
  return {
    getCurrentPageShapes: () => [] as never[],
    getCurrentPageShapeIds: () => new Set() as never,
    getSelectedShapeIds: () => [],
    getShapePageBounds: () => null,
    getTextOptions: () => ({}),
    ...overrides,
  } as unknown as Editor;
}

function board(sessionId: string, projectId?: string) {
  return getCanvasBoardIdentity({
    scope: projectId ? "project" : "chat",
    sessionId,
    projectId,
  });
}

const cleanupCallbacks: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanupCallbacks.splice(0)) cleanup();
});

describe("canvas runtime editor registry", () => {
  it("registers an editor and exposes its board context", () => {
    const identity = board("session-1", "project-1");
    const editor = makeEditor({
      getCurrentPageShapes: () =>
        [
          {
            id: "shape:one",
            type: "geo",
            x: 10,
            y: 20,
            props: {
              geo: "rectangle",
              w: 120,
              h: 80,
              color: "blue",
              richText: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Rectangle" }],
                  },
                ],
              },
            },
          },
          {
            id: "shape:two",
            type: "text",
            x: 200,
            y: 220,
            props: { w: 80, h: 32, color: "black" },
          },
        ] as never[],
      getShapePageBounds: (shape) => {
        const shapeType = typeof shape === "string" ? null : shape.type;
        return {
          width: shapeType === "geo" ? 120 : 80,
          height: shapeType === "geo" ? 80 : 32,
        } as never;
      },
      getSelectedShapeIds: () => ["shape:one" as never],
    });
    cleanupCallbacks.push(registerMountedEditor(identity, editor));

    expect(getMountedEditor(identity.boardId)).toBe(editor);
    expect(getCanvasContext(identity.boardId)).toEqual({
      boardId: identity.boardId,
      scope: "project",
      sessionId: "session-1",
      projectId: "project-1",
      shapeCount: 2,
      shapesTruncated: false,
      shapes: [
        {
          id: "shape:one",
          type: "rectangle",
          x: 10,
          y: 20,
          width: 120,
          height: 80,
          text: "Rectangle",
          color: "blue",
        },
        {
          id: "shape:two",
          type: "text",
          x: 200,
          y: 220,
          width: 80,
          height: 32,
          text: "",
          color: "black",
        },
      ],
      selectedShapeIds: ["shape:one"],
    });
  });

  it("returns no implicit editor when more than one board is mounted", () => {
    const first = board("session-1");
    const second = board("session-2");
    cleanupCallbacks.push(registerMountedEditor(first, makeEditor()));
    cleanupCallbacks.push(registerMountedEditor(second, makeEditor()));

    expect(getMountedEditor()).toBeNull();
    expect(getCanvasContext()).toBeNull();
    expect(getCanvasContext(first.boardId)?.sessionId).toBe("session-1");
  });

  it("bounds the shape details exposed to an agent", () => {
    const identity = board("session-1");
    const shapes = Array.from({ length: 201 }, (_, index) => ({
      id: `shape:${index}`,
      type: "geo",
      x: index,
      y: index,
      props: { geo: "rectangle", w: 32, h: 32, color: "blue" },
    })) as never[];
    const editor = makeEditor({
      getCurrentPageShapes: () => shapes,
      getShapePageBounds: () => ({ width: 32, height: 32 }) as never,
    });
    cleanupCallbacks.push(registerMountedEditor(identity, editor));

    const context = getCanvasContext(identity.boardId);

    expect(context?.shapeCount).toBe(201);
    expect(context?.shapes).toHaveLength(200);
    expect(context?.shapesTruncated).toBe(true);
    expect(context?.shapes[0]?.id).toBe("shape:0");
    expect(context?.shapes.at(-1)?.id).toBe("shape:199");
  });

  it("removes only the matching editor when a board unmounts", () => {
    const identity = board("session-1");
    const previousEditor = makeEditor();
    const currentEditor = makeEditor();
    const removePrevious = registerMountedEditor(identity, previousEditor);
    cleanupCallbacks.push(removePrevious);
    const removeCurrent = registerMountedEditor(identity, currentEditor);
    cleanupCallbacks.push(removeCurrent);

    removePrevious();

    expect(getMountedEditor(identity.boardId)).toBe(currentEditor);
    removeCurrent();
    expect(getMountedEditor(identity.boardId)).toBeNull();
  });

  it("rejects commands for a board that is not mounted", () => {
    const identity = board("session-1");

    expect(() =>
      createCanvasShape(identity.boardId, {
        kind: "rectangle",
        x: 10,
        y: 20,
      }),
    ).toThrow(`Canvas ${identity.boardId} is not open`);
  });

  it("creates and updates shapes through the registered editor", () => {
    const identity = board("session-1");
    const createShape = vi.fn();
    const updateShape = vi.fn();
    const markHistoryStoppingPoint = vi.fn();
    const select = vi.fn();
    const zoomToSelection = vi.fn();
    const editor = makeEditor({
      createShape,
      updateShape,
      markHistoryStoppingPoint,
      select,
      zoomToSelection,
      getShape: () =>
        ({
          id: "shape:existing",
          type: "geo",
        }) as never,
      getCurrentPageShapeIds: () => new Set(["shape:existing"]) as never,
    });
    cleanupCallbacks.push(registerMountedEditor(identity, editor));

    const shapeId = createCanvasShape(identity.boardId, {
      kind: "rectangle",
      x: 10,
      y: 20,
      width: 120,
      height: 80,
      text: "Sketch",
      color: "blue",
    });
    updateCanvasShape(identity.boardId, {
      shapeId: "shape:existing",
      x: 30,
      text: "Updated",
    });

    expect(shapeId).toMatch(/^shape:/);
    expect(createShape).toHaveBeenCalledWith(
      expect.objectContaining({
        id: shapeId,
        type: "geo",
        x: 10,
        y: 20,
        props: expect.objectContaining({
          geo: "rectangle",
          w: 120,
          h: 80,
          color: "blue",
        }),
      }),
    );
    expect(markHistoryStoppingPoint).toHaveBeenCalledWith(
      expect.stringContaining("canvas"),
    );
    expect(select).toHaveBeenCalledWith(shapeId);
    expect(zoomToSelection).toHaveBeenCalled();
    expect(updateShape).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "shape:existing",
        type: "geo",
        x: 30,
        props: expect.objectContaining({ richText: expect.any(Object) }),
      }),
    );
    expect(markHistoryStoppingPoint).toHaveBeenCalledTimes(2);
    expect(select).toHaveBeenCalledWith("shape:existing");
    expect(zoomToSelection).toHaveBeenCalledTimes(2);
  });
});
