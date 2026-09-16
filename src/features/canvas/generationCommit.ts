import {
  createTLStore,
  getIndexAbove,
  PageRecordType,
  type TLImageAsset,
  type TLImageShape,
  type TLPageId,
  type TLRecord,
  type TLShapePartial,
  type TLStoreSnapshot,
} from "tldraw";

export interface GeneratedCanvasPlacement {
  asset: TLImageAsset;
  shape: TLShapePartial<TLImageShape>;
}

/** Merge paid results without restoring a stale board or using a newly selected page. */
export function mergeGeneratedPlacements(
  snapshot: TLStoreSnapshot | undefined,
  originalPageId: TLPageId,
  placements: GeneratedCanvasPlacement[],
) {
  const store = createTLStore({ snapshot });
  const records: TLRecord[] = [];
  let pageId = originalPageId;
  if (!store.has(pageId)) {
    pageId = PageRecordType.createId();
    const pages = store
      .allRecords()
      .filter((record) => record.typeName === "page");
    const page = PageRecordType.create({
      id: pageId,
      name: "Generated variations",
      index: getIndexAbove(
        pages
          .map((page) => page.index)
          .sort()
          .at(-1),
      ),
    });
    records.push(page);
  }
  let index = getIndexAbove(
    store
      .allRecords()
      .filter(
        (record) => record.typeName === "shape" && record.parentId === pageId,
      )
      .map((record) => ("index" in record ? record.index : undefined))
      .filter((index) => index !== undefined)
      .sort()
      .at(-1),
  );
  for (const placement of placements) {
    records.push(
      placement.asset,
      store.schema.types.shape.create({
        ...placement.shape,
        parentId: pageId,
        index,
      }),
    );
    index = getIndexAbove(index);
  }
  store.put(records);
  return { snapshot: store.getStoreSnapshot("document"), records, pageId };
}

/** Inspect IHDR before image decoding can allocate a huge pixel buffer. */
export function generatedPngDimensions(bytes: Uint8Array) {
  if (
    bytes.length < 24 ||
    bytes[0] !== 137 ||
    String.fromCharCode(...bytes.slice(1, 4)) !== "PNG" ||
    String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR"
  )
    throw new Error("The provider did not return a valid PNG.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (
    !width ||
    !height ||
    width > 16384 ||
    height > 16384 ||
    width * height > 64_000_000
  )
    throw new Error("Generated image dimensions exceed the supported limit.");
  return { width, height };
}
