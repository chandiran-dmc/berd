import { strToU8, zipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";

let validatePortableBundle: typeof import("./portableBundles").validatePortableBundle;
let createTLStore: typeof import("tldraw").createTLStore;
let AssetRecordType: typeof import("tldraw").AssetRecordType;
beforeAll(async () => {
  if (typeof CSS !== "undefined" && !CSS.supports)
    Object.assign(CSS, { supports: () => true });
  ({ validatePortableBundle } = await import("./portableBundles"));
  ({ createTLStore, AssetRecordType } = await import("tldraw"));
});
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
function snapshot(src = "asset:reference") {
  const store = createTLStore();
  store.put([
    AssetRecordType.create({
      id: AssetRecordType.createId("reference"),
      type: "image",
      props: {
        src,
        name: "reference.png",
        mimeType: "image/png",
        w: 10,
        h: 10,
        isAnimated: false,
      },
    }),
  ]);
  return store.getStoreSnapshot("document");
}
function archive(
  document: unknown,
  options: {
    path?: string;
    mime?: string;
    data?: Uint8Array;
    extra?: string;
    declared?: boolean;
  } = {},
) {
  const path = options.path ?? "assets/board-1/asset:reference";
  const data = options.data ?? png;
  const manifest = {
    format: "berd-creative-project",
    version: 1,
    exportedAt: new Date().toISOString(),
    boards: [
      {
        boardId: "board-1",
        name: "Board",
        snapshotPath: "boards/board-1.json",
        assets:
          options.declared === false
            ? []
            : [
                {
                  id: "asset:reference",
                  path,
                  mimeType: options.mime ?? "image/png",
                  size: data.length,
                },
              ],
      },
    ],
  };
  return zipSync({
    "manifest.json": strToU8(JSON.stringify(manifest)),
    "boards/board-1.json": strToU8(JSON.stringify(document)),
    [path]: data,
    ...(options.extra ? { [options.extra]: data } : {}),
  });
}
describe("portable bundle validation", () => {
  it("accepts genuine SDK snapshots", () =>
    expect(validatePortableBundle(archive(snapshot())).boards).toHaveLength(1));
  it("rejects superficially shaped invalid records", () =>
    expect(() =>
      validatePortableBundle(
        archive({
          store: {
            "asset:reference": { id: "asset:reference", typeName: "asset" },
          },
        }),
      ),
    ).toThrow(/snapshot/));
  it("rejects external media sources and missing declarations", () => {
    expect(() =>
      validatePortableBundle(archive(snapshot("https://example.com/a.png"))),
    ).toThrow(/external/);
    expect(() =>
      validatePortableBundle(archive(snapshot(), { declared: false })),
    ).toThrow(/not declared/);
  });
  it("rejects unsafe and unexpected paths", () => {
    expect(() =>
      validatePortableBundle(archive(snapshot(), { path: "assets/../secret" })),
    ).toThrow();
    expect(() =>
      validatePortableBundle(
        archive(snapshot(), { extra: "boards/extra.json" }),
      ),
    ).toThrow(/unexpected/);
  });
  it("rejects SVG and mislabeled bytes", () => {
    expect(() =>
      validatePortableBundle(
        archive(snapshot(), { mime: "image/svg+xml", data: strToU8("<svg/>") }),
      ),
    ).toThrow(/media/);
    expect(() =>
      validatePortableBundle(
        archive(snapshot(), { data: strToU8("not a png") }),
      ),
    ).toThrow(/signature/);
  });
  it("preserves null image assets and link-only bookmarks without media files", () => {
    const store = createTLStore();
    store.put([
      AssetRecordType.create({
        id: AssetRecordType.createId("empty"),
        type: "image",
        props: {
          src: null,
          name: "Empty",
          mimeType: "image/png",
          w: 10,
          h: 10,
          isAnimated: false,
        },
      }),
      AssetRecordType.create({
        id: AssetRecordType.createId("link"),
        type: "bookmark",
        props: {
          src: "https://example.com",
          title: "Reference",
          description: "",
          image: "",
          favicon: "",
        },
      }),
    ]);
    const manifest = {
      format: "berd-creative-project",
      version: 1,
      exportedAt: new Date().toISOString(),
      boards: [
        {
          boardId: "board-1",
          name: "Board",
          snapshotPath: "boards/board-1.json",
          assets: [],
        },
      ],
    };
    const bytes = zipSync({
      "manifest.json": strToU8(JSON.stringify(manifest)),
      "boards/board-1.json": strToU8(
        JSON.stringify(store.getStoreSnapshot("document")),
      ),
    });
    expect(validatePortableBundle(bytes).boards[0].assets).toEqual([]);
  });
  it("rejects ZIP expansion budgets before allocating the advertised output", () => {
    const bytes = archive(snapshot());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < bytes.length - 24; i++) {
      if (view.getUint32(i, true) === 0x02014b50) {
        view.setUint32(i + 24, 101 * 1024 * 1024, true);
        break;
      }
    }
    expect(() => validatePortableBundle(bytes)).toThrow(/archive/);
  });
  it("rejects invalid typed properties", () => {
    const data = structuredClone(snapshot());
    Object.assign(data.store["asset:reference" as keyof typeof data.store], {
      type: "nonexistent",
    });
    expect(() => validatePortableBundle(archive(data))).toThrow(/schema/);
  });
});
