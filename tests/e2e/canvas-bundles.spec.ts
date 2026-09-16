import { expect, test } from "@playwright/test";
import { buildInitScript } from "./fixtures/tauri-mock";

test("editable multi-board bundle preserves media offline after reload and rejects invalid archives", async ({
  page,
}) => {
  await page.addInitScript({ content: buildInitScript({ sessions: [] }) });
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const dynamic = (path: string) => import(/* @vite-ignore */ path);
    const { createTLStore, AssetRecordType, PageRecordType } = await dynamic(
      "/node_modules/.vite/deps/tldraw.js",
    );
    const { getCanvasPersistenceDatabase } = await dynamic(
      "/src/features/canvas/persistence.ts",
    );
    const { exportCanvasBundle, importCanvasBundle, validatePortableBundle } =
      await dynamic("/src/features/canvas/portableBundles.ts");
    const { getCanvasBoardIdentity } = await dynamic(
      "/src/features/canvas/canvasIdentity.ts",
    );
    const target = {
      scope: "project",
      projectId: "bundle-roundtrip",
      sessionId: "bundle",
    };
    const identity = getCanvasBoardIdentity(target);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.fillStyle = "#ff0044";
    ctx.fillRect(0, 0, 32, 32);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
      }, "image/png"),
    );
    const store = createTLStore();
    const asset = AssetRecordType.create({
      id: AssetRecordType.createId("roundtrip"),
      type: "image",
      props: {
        src: "asset:roundtrip",
        w: 32,
        h: 32,
        name: "reference.png",
        mimeType: "image/png",
        isAnimated: false,
      },
    });
    const pageId = PageRecordType.createId("main");
    store.put([
      asset,
      PageRecordType.create({ id: pageId, name: "Page", index: "a1" }),
      {
        id: "shape:reference",
        typeName: "shape",
        type: "image",
        x: 16,
        y: 24,
        rotation: 0,
        index: "a1",
        parentId: pageId,
        isLocked: false,
        opacity: 1,
        meta: {},
        props: {
          w: 32,
          h: 32,
          playing: true,
          url: "",
          assetId: asset.id,
          crop: null,
          flipX: false,
          flipY: false,
          altText: "Reference",
        },
      },
    ]);
    const db = getCanvasPersistenceDatabase(identity.persistenceKey);
    await db.replaceDocumentAndAssets(
      store.getStoreSnapshot("document"),
      new Map([[asset.id, blob]]),
    );
    const bytes = await exportCanvasBundle({
      boards: [
        {
          boardId: identity.boardId,
          name: "Reference",
          persistenceKey: identity.persistenceKey,
        },
        {
          boardId: "board:empty",
          name: "Empty",
          persistenceKey: "unmounted-empty",
        },
      ],
    });
    let rejected = false;
    try {
      validatePortableBundle(new Uint8Array([1, 2, 3]));
    } catch {
      rejected = true;
    }
    const imported = await importCanvasBundle(target, bytes);
    return { imported, rejected };
  });
  expect(result.rejected).toBe(true);
  expect(result.imported.boards).toHaveLength(2);
  expect(result.imported.assetCount).toBe(1);
  await page.reload();
  const loaded = await page.evaluate(async (boardId) => {
    const dynamic = (path: string) => import(/* @vite-ignore */ path);
    const { getCanvasPersistenceDatabase } = await dynamic(
      "/src/features/canvas/persistence.ts",
    );
    const { getCanvasBoardIdentity } = await dynamic(
      "/src/features/canvas/canvasIdentity.ts",
    );
    const { loadCanvasBoardCatalog } = await dynamic(
      "/src/features/canvas/boardCatalog.ts",
    );
    const target = {
      scope: "project",
      projectId: "bundle-roundtrip",
      sessionId: "different-session",
      boardId,
    };
    const db = getCanvasPersistenceDatabase(
      getCanvasBoardIdentity(target).persistenceKey,
    );
    const blob = await db.loadAsset("asset:roundtrip");
    const image = await createImageBitmap(blob);
    return {
      width: image.width,
      records: Object.keys((await db.readDocument()).store),
      boards: (await loadCanvasBoardCatalog(target)).boards.length,
    };
  }, result.imported.boards[0].boardId);
  expect(loaded.width).toBe(32);
  expect(loaded.records).toContain("asset:roundtrip");
  expect(loaded.records).toContain("shape:reference");
  expect(loaded.boards).toBe(3);
});

test("failed import rolls back staged documents and leaves catalog unchanged", async ({
  page,
}) => {
  await page.addInitScript({ content: buildInitScript({ sessions: [] }) });
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const dynamic = (path: string) => import(/* @vite-ignore */ path);
    const { getCanvasPersistenceDatabase } = await dynamic(
      "/src/features/canvas/persistence.ts",
    );
    const { exportCanvasBundle, importCanvasBundle } = await dynamic(
      "/src/features/canvas/portableBundles.ts",
    );
    const { loadCanvasBoardCatalog } = await dynamic(
      "/src/features/canvas/boardCatalog.ts",
    );
    const target = {
      scope: "project",
      projectId: "rollback",
      sessionId: "rollback",
    };
    const bytes = await exportCanvasBundle({
      boards: [1, 2].map((i) => ({
        boardId: `board:${i}`,
        name: `Board ${i}`,
        persistenceKey: `rollback-source-${i}`,
      })),
    });
    const prototype = Object.getPrototypeOf(
      getCanvasPersistenceDatabase("rollback-source-1"),
    );
    const original = prototype.replaceDocumentAndAssets;
    const written: (typeof prototype)[] = [];
    prototype.replaceDocumentAndAssets = async function (...args: unknown[]) {
      written.push(this);
      if (written.length === 2) throw new Error("Injected storage failure");
      return original.apply(this, args);
    };
    let error = "";
    try {
      await importCanvasBundle(target, bytes);
    } catch (caught) {
      error = String(caught);
    } finally {
      prototype.replaceDocumentAndAssets = original;
    }
    return {
      error,
      documents: await Promise.all(written.map((db) => db.readDocument())),
      count: (await loadCanvasBoardCatalog(target)).boards.length,
    };
  });
  expect(result.error).toContain("Injected storage failure");
  expect(result.documents.every((document) => document === undefined)).toBe(
    true,
  );
  expect(result.count).toBe(1);
});

test("concurrent windows do not lose project catalog additions", async ({
  page,
  context,
}) => {
  await context.addInitScript({ content: buildInitScript({ sessions: [] }) });
  const other = await context.newPage();
  await Promise.all([page.goto("/"), other.goto("/")]);
  const add = (tab: typeof page) =>
    tab.evaluate(async () => {
      const path = "/src/features/canvas/boardCatalog.ts";
      const { createCanvasBoard } = await import(/* @vite-ignore */ path);
      await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          createCanvasBoard(
            { scope: "project", projectId: "concurrent", sessionId: "catalog" },
            `Board ${i}`,
          ),
        ),
      );
    });
  await Promise.all([add(page), add(other)]);
  const count = await page.evaluate(async () => {
    const path = "/src/features/canvas/boardCatalog.ts";
    const { loadCanvasBoardCatalog } = await import(/* @vite-ignore */ path);
    return (
      await loadCanvasBoardCatalog({
        scope: "project",
        projectId: "concurrent",
        sessionId: "other-chat",
      })
    ).boards.length;
  });
  expect(count).toBe(11);
});
