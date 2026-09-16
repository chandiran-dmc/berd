import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { createTLStore, loadSnapshot, type TLStoreSnapshot } from "tldraw";
import {
  getCanvasBoardIdentity,
  type CanvasBoardTarget,
} from "./canvasIdentity";
import { getCanvasPersistenceDatabase } from "./persistence";
import { mutateCanvasBoardCatalog } from "./boardCatalog";

const FORMAT = "berd-creative-project";
const VERSION = 1;
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_ASSET_BYTES = 25 * 1024 * 1024;

export interface PortableBoardInput {
  boardId: string;
  name: string;
  persistenceKey: string;
}
export interface PortableBundleInput {
  boards: PortableBoardInput[];
}
export interface PortableImportResult {
  boards: Array<{ sourceBoardId: string; boardId: string; name: string }>;
  assetCount: number;
}

type Manifest = {
  format: typeof FORMAT;
  version: 1;
  exportedAt: string;
  boards: Array<{
    boardId: string;
    name: string;
    snapshotPath: string;
    assets: Array<{ id: string; path: string; mimeType: string; size: number }>;
  }>;
};

function fail(message: string): never {
  throw new Error(`Invalid Creative Harness bundle: ${message}`);
}
function isSafeId(id: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._:%-]{0,127}$/.test(id);
}
function validateSnapshot(snapshot: unknown): TLStoreSnapshot {
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    !("store" in snapshot) ||
    !("schema" in snapshot)
  )
    fail("invalid tldraw snapshot");
  const candidate = snapshot as TLStoreSnapshot;
  const store = createTLStore();
  try {
    if (Object.keys(candidate.store).length > 100000) fail("too many records");
    // Validate every record before loading: loadSnapshot can repair invalid references.
    for (const [id, record] of Object.entries(candidate.store)) {
      if (id !== record.id) fail("record key does not match id");
      store.schema.validateRecord(store, record, "initialize", null);
    }
    loadSnapshot(store, candidate);
  } catch {
    fail("invalid tldraw snapshot schema or records");
  }
  const assets = new Set(
    Object.values(candidate.store)
      .filter((r) => r.typeName === "asset")
      .map((r) => r.id),
  );
  for (const record of Object.values(candidate.store)) {
    if (record.typeName === "shape") {
      const parent = candidate.store[record.parentId];
      if (
        !parent ||
        (parent.typeName !== "page" && parent.typeName !== "shape")
      )
        fail("shape references missing parent");
      const seen = new Set<string>([record.id]);
      let ancestor = parent;
      while (ancestor.typeName === "shape") {
        if (seen.has(ancestor.id)) fail("cyclic shape hierarchy");
        seen.add(ancestor.id);
        const next = candidate.store[ancestor.parentId];
        if (!next || (next.typeName !== "shape" && next.typeName !== "page"))
          fail("shape references missing parent");
        ancestor = next;
      }
    }
    if (
      record.typeName === "binding" &&
      (candidate.store[record.fromId]?.typeName !== "shape" ||
        candidate.store[record.toId]?.typeName !== "shape")
    )
      fail("binding references missing shape");
    if (
      record.typeName === "asset" &&
      record.type === "bookmark" &&
      (record.props.image || record.props.favicon)
    )
      fail("bookmark preview media must be removed before portable export");
    if (
      record.typeName === "shape" &&
      "assetId" in record.props &&
      record.props.assetId !== null &&
      !assets.has(record.props.assetId)
    )
      fail("shape references missing asset");
  }
  return store.getStoreSnapshot("document");
}

function mediaRecords(snapshot: TLStoreSnapshot) {
  return Object.values(snapshot.store).filter(
    (record) =>
      record.typeName === "asset" &&
      record.type !== "bookmark" &&
      record.props.src !== null,
  );
}

function validateMedia(bytes: Uint8Array, mime: string) {
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  const supported =
    (mime === "image/png" &&
      bytes[0] === 137 &&
      ascii(1, 4) === "PNG" &&
      bytes[4] === 13 &&
      bytes[5] === 10) ||
    (mime === "image/jpeg" &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255) ||
    (mime === "image/gif" && /^GIF8[79]a$/.test(ascii(0, 6))) ||
    (mime === "image/webp" &&
      ascii(0, 4) === "RIFF" &&
      ascii(8, 12) === "WEBP") ||
    ((mime === "video/mp4" ||
      mime === "video/quicktime" ||
      mime === "image/avif") &&
      ascii(4, 8) === "ftyp") ||
    (mime === "video/webm" &&
      bytes[0] === 26 &&
      bytes[1] === 69 &&
      bytes[2] === 223 &&
      bytes[3] === 163);
  if (!supported) fail("unsupported media type or invalid media signature");
}

function unzipArchive(bytes: Uint8Array) {
  let expanded = 0;
  const names = new Set<string>();
  return unzipSync(bytes, {
    filter(file) {
      if (names.has(file.name)) fail("duplicate archive path");
      names.add(file.name);
      if (names.size > 10000) fail("too many archive entries");
      if (
        file.name.startsWith("assets/") &&
        file.originalSize > MAX_ASSET_BYTES
      )
        fail("asset is too large");
      expanded += file.originalSize;
      if (expanded > MAX_ARCHIVE_BYTES) fail("expanded archive is too large");
      const allowed =
        file.name === "manifest.json" ||
        /^boards\/[a-zA-Z0-9][a-zA-Z0-9._:%-]{0,127}\.json$/.test(file.name) ||
        /^assets\/[a-zA-Z0-9][a-zA-Z0-9._:%-]{0,127}\/[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(
          file.name,
        );
      if (!allowed) fail("unsafe archive path");
      return true;
    },
  });
}

export async function exportCanvasBundle(
  input: PortableBundleInput,
): Promise<Uint8Array> {
  if (!input.boards.length || input.boards.length > 100)
    fail("bundle must contain 1–100 boards");
  const files: Record<string, Uint8Array> = {};
  const boards: Manifest["boards"] = [];
  for (const board of input.boards) {
    if (
      !board ||
      typeof board.boardId !== "string" ||
      !isSafeId(board.boardId) ||
      !board.name.trim() ||
      board.name.length > 120
    )
      fail("invalid board metadata");
    const snapshot =
      (await getCanvasPersistenceDatabase(
        board.persistenceKey,
      ).readDocument()) ?? createTLStore().getStoreSnapshot("document");
    validateSnapshot(snapshot);
    const snapshotPath = `boards/${board.boardId}.json`;
    files[snapshotPath] = strToU8(JSON.stringify(snapshot));
    const assets = [];
    const ids = [...new Set(mediaRecords(snapshot).map((record) => record.id))];
    const blobs = await getCanvasPersistenceDatabase(
      board.persistenceKey,
    ).readAssets(ids);
    for (const id of ids) {
      const blob = blobs.get(id);
      if (!blob) fail(`asset ${id} is missing`);
      if (blob.size > MAX_ASSET_BYTES) fail(`asset ${id} is too large`);
      if (!blob.type || !/^(image|video|audio)\//.test(blob.type))
        fail(`asset ${id} has unsupported media type`);
      const path = `assets/${board.boardId}/${id}`;
      files[path] = new Uint8Array(await blob.arrayBuffer());
      validateMedia(files[path], blob.type);
      assets.push({ id, path, mimeType: blob.type, size: blob.size });
    }
    boards.push({
      boardId: board.boardId,
      name: board.name,
      snapshotPath,
      assets,
    });
  }
  const manifest: Manifest = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    boards,
  };
  files["manifest.json"] = strToU8(JSON.stringify(manifest));
  if (
    Object.values(files).reduce((sum, file) => sum + file.byteLength, 0) >
    MAX_ARCHIVE_BYTES
  )
    fail("expanded archive is too large");
  const archive = zipSync(files, { level: 6 });
  validatePortableBundle(archive);
  if (archive.byteLength > MAX_ARCHIVE_BYTES) fail("archive is too large");
  return archive;
}

function parseManifest(files: Record<string, Uint8Array>) {
  const raw = files["manifest.json"];
  if (!raw) fail("manifest.json is missing");
  let value: Manifest;
  try {
    value = JSON.parse(strFromU8(raw)) as Manifest;
  } catch {
    fail("manifest.json is not valid JSON");
  }
  if (
    !value ||
    typeof value !== "object" ||
    value.format !== FORMAT ||
    value.version !== VERSION ||
    !Array.isArray(value.boards) ||
    !value.boards.length ||
    value.boards.length > 100
  )
    fail("unsupported manifest");
  const ids = new Set<string>();
  let inflatedBytes = 0;
  for (const board of value.boards) {
    if (
      !board ||
      typeof board.boardId !== "string" ||
      !isSafeId(board.boardId) ||
      ids.has(board.boardId) ||
      typeof board.name !== "string" ||
      !board.name.trim() ||
      !Array.isArray(board.assets) ||
      board.name.length > 120 ||
      board.snapshotPath !== `boards/${board.boardId}.json` ||
      !files[board.snapshotPath]
    )
      fail("invalid board entry");
    ids.add(board.boardId);
    inflatedBytes += files[board.snapshotPath].byteLength;
    if (inflatedBytes > MAX_ARCHIVE_BYTES)
      fail("expanded archive is too large");
    let snapshot: unknown;
    try {
      snapshot = JSON.parse(strFromU8(files[board.snapshotPath]));
    } catch {
      fail("board snapshot is not valid JSON");
    }
    const validated = validateSnapshot(snapshot);
    const media = mediaRecords(validated);
    for (const record of media) {
      if (record.typeName === "asset" && record.props.src !== record.id)
        fail("external asset source is not portable");
    }
    const referenced = new Set<string>(media.map((record) => record.id));
    const declared = new Set<string>();
    for (const asset of board.assets) {
      if (
        !asset ||
        typeof asset.id !== "string" ||
        !isSafeId(asset.id) ||
        asset.path !== `assets/${board.boardId}/${asset.id}` ||
        !files[asset.path] ||
        asset.size !== files[asset.path].byteLength ||
        asset.size > MAX_ASSET_BYTES ||
        !/^(image|video|audio)\//.test(asset.mimeType)
      )
        fail("invalid asset entry");
      validateMedia(files[asset.path], asset.mimeType);
      if (!referenced.has(asset.id)) fail("unreferenced asset entry");
      if (declared.has(asset.id)) fail("duplicate asset entry");
      declared.add(asset.id);
      inflatedBytes += files[asset.path].byteLength;
      if (inflatedBytes > MAX_ARCHIVE_BYTES)
        fail("expanded archive is too large");
    }
    for (const assetId of referenced)
      if (!declared.has(assetId)) fail(`asset ${assetId} is not declared`);
  }
  const expected = new Set([
    "manifest.json",
    ...value.boards.flatMap((board) => [
      board.snapshotPath,
      ...board.assets.map((asset) => asset.path),
    ]),
  ]);
  if (Object.keys(files).some((path) => !expected.has(path)))
    fail("unexpected archive entry");
  return value;
}

/** Validates an archive before any catalog or board write occurs. */
export function validatePortableBundle(bytes: Uint8Array): Manifest {
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) fail("archive is too large");
  let files: Record<string, Uint8Array>;
  try {
    files = unzipArchive(bytes);
  } catch {
    fail("archive could not be read");
  }
  return parseManifest(files);
}

export async function importCanvasBundle(
  target: CanvasBoardTarget,
  bytes: Uint8Array,
  options: { conflict?: "fresh" | "reject" } = {},
): Promise<PortableImportResult> {
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) fail("archive is too large");
  let files: Record<string, Uint8Array>;
  try {
    files = unzipArchive(bytes);
  } catch {
    fail("archive could not be read");
  }
  const manifest = parseManifest(files);
  const written: ReturnType<typeof getCanvasPersistenceDatabase>[] = [];
  try {
    return await mutateCanvasBoardCatalog(target, async (catalog) => {
      if (
        options.conflict === "reject" &&
        manifest.boards.some((board) =>
          catalog.boards.some((existing) => existing.boardId === board.boardId),
        )
      )
        fail("a board already exists");
      const imported: PortableImportResult["boards"] = [];
      let assetCount = 0;
      for (const source of manifest.boards) {
        const boardId = `board:${crypto.randomUUID()}`;
        const identity = getCanvasBoardIdentity({ ...target, boardId });
        const snapshot = validateSnapshot(
          JSON.parse(strFromU8(files[source.snapshotPath])),
        );
        const db = getCanvasPersistenceDatabase(identity.persistenceKey);
        written.push(db);
        const assets = new Map<string, Blob>();
        for (const asset of source.assets) {
          assets.set(
            asset.id,
            new Blob([new Uint8Array(files[asset.path])], {
              type: asset.mimeType,
            }),
          );
          assetCount++;
        }
        await db.replaceDocumentAndAssets(snapshot, assets);
        const now = new Date().toISOString();
        catalog.boards.push({
          boardId,
          name: source.name,
          createdAt: now,
          updatedAt: now,
        });
        imported.push({
          sourceBoardId: source.boardId,
          boardId,
          name: source.name,
        });
      }
      return { boards: imported, assetCount };
    });
  } catch (error) {
    const cleanup = await Promise.allSettled(written.map((db) => db.clear()));
    if (cleanup.some((result) => result.status === "rejected"))
      throw new Error(
        "Import failed and temporary board cleanup failed; storage may be unavailable",
        { cause: error },
      );
    throw error;
  }
}
