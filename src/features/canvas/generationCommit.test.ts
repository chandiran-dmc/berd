import { beforeAll, describe, expect, it } from "vitest";
import type { GeneratedCanvasPlacement } from "./generationCommit";
let sdk: typeof import("tldraw");
let merge: typeof import("./generationCommit").mergeGeneratedPlacements;
let dimensions: typeof import("./generationCommit").generatedPngDimensions;
beforeAll(async () => {
  if (typeof CSS !== "undefined" && !CSS.supports)
    Object.assign(CSS, { supports: () => true });
  sdk = await import("tldraw");
  ({ mergeGeneratedPlacements: merge, generatedPngDimensions: dimensions } =
    await import("./generationCommit"));
});
function placement(id: string): GeneratedCanvasPlacement {
  const assetId = sdk.AssetRecordType.createId(id);
  return {
    asset: {
      id: assetId,
      typeName: "asset",
      type: "image",
      meta: {},
      props: {
        src: assetId,
        name: id,
        w: 1024,
        h: 1536,
        mimeType: "image/png",
        isAnimated: false,
      },
    },
    shape: {
      id: sdk.createShapeId(id),
      type: "image",
      x: 10,
      y: 20,
      props: {
        w: 320,
        h: 480,
        assetId,
        playing: true,
        url: "",
        crop: null,
        flipX: false,
        flipY: false,
        altText: "",
      },
    },
  };
}
describe("generation result merging", () => {
  it("keeps latest edits, binds the original page, and assigns unique ordered indexes", () => {
    const store = sdk.createTLStore();
    const original = sdk.PageRecordType.createId("original");
    const other = sdk.PageRecordType.createId("other");
    store.put([
      sdk.PageRecordType.create({
        id: original,
        name: "Original",
        index: sdk.getIndexAbove(),
      }),
      sdk.PageRecordType.create({
        id: other,
        name: "Other",
        index: sdk.getIndexAbove(sdk.getIndexAbove()),
      }),
    ]);
    const first = merge(store.getStoreSnapshot("document"), original, [
      placement("existing"),
    ]);
    const result = merge(first.snapshot, original, [
      placement("new1"),
      placement("new2"),
    ]);
    expect(result.pageId).toBe(original);
    expect(result.snapshot.store[sdk.createShapeId("existing")]).toEqual(
      first.snapshot.store[sdk.createShapeId("existing")],
    );
    const shapes = Object.values(result.snapshot.store).filter(
      (record) => record.typeName === "shape",
    );
    expect(shapes).toHaveLength(3);
    expect(shapes.every((shape) => shape.parentId === original)).toBe(true);
    expect(new Set(shapes.map((shape) => shape.index)).size).toBe(3);
    expect(result.snapshot.store[other]).toBeDefined();
    expect(() =>
      sdk.createTLStore({ snapshot: result.snapshot }),
    ).not.toThrow();
  });
  it("recovers results to a new page if the original page was deleted", () => {
    const original = sdk.PageRecordType.createId("deleted");
    const result = merge(
      sdk.createTLStore().getStoreSnapshot("document"),
      original,
      [placement("recovered")],
    );
    expect(result.pageId).not.toBe(original);
    expect(result.snapshot.store[result.pageId]).toMatchObject({
      name: "Generated variations",
    });
    expect(result.snapshot.store[sdk.createShapeId("recovered")]).toMatchObject(
      { parentId: result.pageId },
    );
  });
  it("checks PNG dimensions before decoding", () => {
    const bytes = new Uint8Array(24);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    bytes.set([73, 72, 68, 82], 12);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 1024);
    view.setUint32(20, 1536);
    expect(dimensions(bytes)).toEqual({ width: 1024, height: 1536 });
    view.setUint32(16, 100000);
    expect(() => dimensions(bytes)).toThrow(/dimensions/);
    expect(() => dimensions(new Uint8Array(24))).toThrow(/PNG/);
  });
});
