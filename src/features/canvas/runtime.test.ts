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
  executeCanvasAction,
  getCanvasContext,
  getMountedEditor,
  registerMountedEditor,
  updateCanvasShape,
} from "./runtime";
import { onCanvasAction } from "./actions";

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

  it("executes validated batch editing as one logical history operation", async () => {
    const identity = board("session-1", "project-1");
    const shapes = new Map([
      ["shape:one", { id: "shape:one", type: "geo", x: 10, y: 20 }],
      ["shape:two", { id: "shape:two", type: "geo", x: 50, y: 60 }],
      ["shape:three", { id: "shape:three", type: "geo", x: 90, y: 100 }],
    ]);
    const markHistoryStoppingPoint = vi.fn();
    const updateShapes = vi.fn();
    const alignShapes = vi.fn();
    const distributeShapes = vi.fn();
    const bringToFront = vi.fn();
    const select = vi.fn();
    const editor = makeEditor({
      markHistoryStoppingPoint,
      updateShapes,
      alignShapes,
      distributeShapes,
      bringToFront,
      select,
      getShape: (id) => shapes.get(String(id)) as never,
      getCurrentPageShapeIds: () => new Set(shapes.keys()) as never,
    });
    cleanupCallbacks.push(registerMountedEditor(identity, editor));

    await executeCanvasAction(
      identity.boardId,
      {
        type: "move",
        shapeIds: ["shape:one", "shape:two"],
        deltaX: 5,
        deltaY: -2,
      },
      { sessionId: "session-1", projectId: "project-1" },
    );
    await executeCanvasAction(identity.boardId, {
      type: "align",
      shapeIds: ["shape:one", "shape:two"],
      alignment: "left",
    });
    await executeCanvasAction(identity.boardId, {
      type: "distribute",
      shapeIds: ["shape:one", "shape:two", "shape:three"],
      axis: "horizontal",
    });
    await executeCanvasAction(identity.boardId, {
      type: "reorder",
      shapeIds: ["shape:one"],
      position: "front",
    });

    expect(markHistoryStoppingPoint).toHaveBeenCalledTimes(4);
    expect(updateShapes).toHaveBeenCalledWith([
      expect.objectContaining({ id: "shape:one", x: 15, y: 18 }),
      expect.objectContaining({ id: "shape:two", x: 55, y: 58 }),
    ]);
    expect(alignShapes).toHaveBeenCalledWith(
      ["shape:one", "shape:two"],
      "left",
    );
    expect(distributeShapes).toHaveBeenCalledWith(
      ["shape:one", "shape:two", "shape:three"],
      "horizontal",
    );
    expect(bringToFront).toHaveBeenCalledWith(["shape:one"]);
    expect(select).toHaveBeenCalled();
  });

  it("supports the agent kit drawing, rotation, stacking, and clear actions", async () => {
    const identity = board("session-agent-kit");
    const shapes = new Map([
      ["shape:one", { id: "shape:one", type: "geo", x: 10, y: 20 }],
      ["shape:two", { id: "shape:two", type: "geo", x: 50, y: 60 }],
    ]);
    const createShape = vi.fn();
    const rotateShapesBy = vi.fn();
    const stackShapes = vi.fn();
    const deleteShapes = vi.fn();
    const editor = makeEditor({
      createShape,
      rotateShapesBy,
      stackShapes,
      deleteShapes,
      markHistoryStoppingPoint: vi.fn(),
      select: vi.fn(),
      getShape: (id) => shapes.get(String(id)) as never,
      getCurrentPageShapeIds: () => new Set(shapes.keys()) as never,
      getShapePageBounds: (id) =>
        ({
          x: id === "shape:one" ? 10 : 50,
          y: id === "shape:one" ? 20 : 60,
          width: 20,
          height: 20,
          center: id === "shape:one" ? { x: 20, y: 30 } : { x: 60, y: 70 },
        }) as never,
    });
    cleanupCallbacks.push(registerMountedEditor(identity, editor));

    await executeCanvasAction(identity.boardId, {
      type: "draw",
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 30 },
      ],
      fill: "none",
      closed: false,
    });
    await executeCanvasAction(identity.boardId, {
      type: "rotate",
      shapeIds: ["shape:one", "shape:two"],
      degrees: 90,
    });
    await executeCanvasAction(identity.boardId, {
      type: "stack",
      shapeIds: ["shape:one", "shape:two"],
      direction: "horizontal",
      gap: 24,
    });
    await executeCanvasAction(identity.boardId, { type: "clear" });

    expect(createShape).toHaveBeenCalledWith(
      expect.objectContaining({ type: "draw", x: 0, y: 0 }),
    );
    expect(rotateShapesBy).toHaveBeenCalledWith(
      ["shape:one", "shape:two"],
      Math.PI / 2,
      expect.objectContaining({ center: expect.any(Object) }),
    );
    expect(stackShapes).toHaveBeenCalledWith(
      ["shape:one", "shape:two"],
      "horizontal",
      24,
    );
    expect(deleteShapes).toHaveBeenCalledWith(["shape:one", "shape:two"]);
  });

  it("creates bound arrows and persistent image assets", async () => {
    const identity = board("session-1");
    const createShape = vi.fn();
    const createAssets = vi.fn();
    const createBindings = vi.fn();
    const uploadAsset = vi.fn().mockResolvedValue({ src: "asset:stored" });
    const editor = makeEditor({
      markHistoryStoppingPoint: vi.fn(),
      createShape,
      createAssets,
      createBindings,
      uploadAsset,
      select: vi.fn(),
      getShape: (id) => ({ id, type: "geo", x: 0, y: 0 }) as never,
      getCurrentPageShapeIds: () =>
        new Set(["shape:start", "shape:end"]) as never,
      getShapePageBounds: (shape) =>
        ({
          x: String(shape).includes("start") ? 0 : 200,
          y: 0,
          width: 100,
          height: 100,
          center: { x: String(shape).includes("start") ? 50 : 250, y: 50 },
        }) as never,
    });
    cleanupCallbacks.push(registerMountedEditor(identity, editor));

    const arrow = await executeCanvasAction(identity.boardId, {
      type: "create-arrow",
      startShapeId: "shape:start",
      endShapeId: "shape:end",
      text: "leads to",
    });
    const image = await executeCanvasAction(identity.boardId, {
      type: "place-image",
      src: "data:image/png;base64,iVBORw0KGgo=",
      mimeType: "image/png",
      name: "reference.png",
      x: 20,
      y: 30,
      width: 320,
      height: 180,
    });

    expect(arrow.affectedShapeIds).toContain("shape:start");
    expect(createShape).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "arrow",
        props: expect.objectContaining({ start: { x: 0, y: 0 } }),
      }),
    );
    expect(createBindings).toHaveBeenCalledWith([
      expect.objectContaining({
        fromId: expect.stringMatching(/^shape:/),
        toId: "shape:start",
        props: expect.objectContaining({ terminal: "start" }),
      }),
      expect.objectContaining({
        fromId: expect.stringMatching(/^shape:/),
        toId: "shape:end",
        props: expect.objectContaining({ terminal: "end" }),
      }),
    ]);
    expect(createAssets).toHaveBeenCalledWith([
      expect.objectContaining({
        type: "image",
        props: expect.objectContaining({
          src: "asset:stored",
        }),
      }),
    ]);
    expect(createShape).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "image", x: 20, y: 30 }),
    );
    expect(image.message).toContain("reference.png");
  });

  it("supports groups, deletion, viewport, undo, and visible feedback", async () => {
    const identity = board("session-1");
    const groupShapes = vi.fn();
    const ungroupShapes = vi.fn();
    const deleteShapes = vi.fn();
    const zoomToFit = vi.fn();
    const undo = vi.fn();
    const messages: string[] = [];
    const stopListening = onCanvasAction((event) =>
      messages.push(event.message),
    );
    cleanupCallbacks.push(stopListening);
    const editor = makeEditor({
      markHistoryStoppingPoint: vi.fn(),
      groupShapes,
      ungroupShapes,
      deleteShapes,
      zoomToFit,
      undo,
      getShape: (id) =>
        ({ id, type: String(id).includes("group") ? "group" : "geo" }) as never,
      getCurrentPageShapeIds: () =>
        new Set(["shape:one", "shape:two", "shape:group"]) as never,
    });
    cleanupCallbacks.push(registerMountedEditor(identity, editor));

    await executeCanvasAction(identity.boardId, {
      type: "group",
      shapeIds: ["shape:one", "shape:two"],
    });
    await executeCanvasAction(identity.boardId, {
      type: "ungroup",
      shapeIds: ["shape:group"],
    });
    await executeCanvasAction(identity.boardId, {
      type: "delete",
      shapeIds: ["shape:one"],
    });
    await executeCanvasAction(identity.boardId, {
      type: "viewport",
      mode: "fit",
    });
    await executeCanvasAction(identity.boardId, { type: "undo", steps: 2 });

    expect(groupShapes).toHaveBeenCalled();
    expect(ungroupShapes).toHaveBeenCalledWith(["shape:group"], {
      select: true,
    });
    expect(deleteShapes).toHaveBeenCalledWith(["shape:one"]);
    expect(zoomToFit).toHaveBeenCalled();
    expect(undo).toHaveBeenCalledTimes(2);
    expect(messages).toHaveLength(5);
  });

  it("rejects invalid, off-page, and wrongly scoped actions", async () => {
    const identity = board("session-1", "project-1");
    const editor = makeEditor({
      getShape: (id) => ({ id, type: "geo" }) as never,
      getCurrentPageShapeIds: () => new Set(["shape:current"]) as never,
    });
    cleanupCallbacks.push(registerMountedEditor(identity, editor));

    await expect(
      executeCanvasAction(identity.boardId, {
        type: "move",
        shapeIds: ["shape:other"],
        deltaX: 1,
        deltaY: 1,
      }),
    ).rejects.toThrow("not on the current canvas page");
    await expect(
      executeCanvasAction(
        identity.boardId,
        {
          type: "move",
          shapeIds: ["shape:current"],
          deltaX: 1,
          deltaY: 1,
        },
        { projectId: "wrong" },
      ),
    ).rejects.toThrow("does not belong to project wrong");
    await expect(
      executeCanvasAction(identity.boardId, {
        type: "resize",
        shapeIds: ["shape:current"],
        scaleX: 0,
        scaleY: 1,
      }),
    ).rejects.toThrow();
  });
});
