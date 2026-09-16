import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AssetRecordType,
  createShapeId,
  type Editor,
  type TLImageAsset,
  renderPlaintextFromRichText,
  type TLImageShape,
} from "tldraw";
import { resizeImage } from "@/features/chat/lib/resizeImage";
import type { CanvasBoardIdentity } from "./canvasIdentity";
import { createCanvasAttachment } from "./contextAttachment";
import { attachCanvasToChat } from "./composerEvents";
import {
  generateCanvasImages,
  getCanvasGenerationStatus,
  type CanvasGenerationStatus,
} from "./generation";
import {
  broadcastCanvasRecords,
  getCanvasPersistenceDatabase,
} from "./persistence";
import {
  generatedPngDimensions,
  mergeGeneratedPlacements,
  type GeneratedCanvasPlacement,
} from "./generationCommit";

function blobFromImage(base64: string, mimeType: string) {
  if (base64.length > 35_000_000)
    throw new Error("Generated image exceeds the supported file size.");
  const bytes = Uint8Array.from(atob(base64), (character) =>
    character.charCodeAt(0),
  );
  if (bytes.length > 25 * 1024 * 1024)
    throw new Error("Generated image exceeds the supported file size.");
  generatedPngDimensions(bytes);
  return new Blob([bytes], { type: mimeType });
}

export function CreativeWorkflow({
  editor,
  identity,
  revealChat,
}: {
  editor: Editor;
  identity: CanvasBoardIdentity;
  revealChat: () => void;
}) {
  const [brief, setBrief] = useState(() =>
    String(editor.getDocumentSettings().meta.creativeBrief ?? ""),
  );
  const [status, setStatus] = useState<CanvasGenerationStatus | null>(null);
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const active = useRef(true);
  const currentEditor = useRef(editor);
  currentEditor.current = editor;
  const inFlight = useRef(false);
  useEffect(() => {
    active.current = true;
    void getCanvasGenerationStatus()
      .then((value) => {
        if (active.current) setStatus(value);
      })
      .catch(() => {
        if (active.current) setStatus(null);
      });
    return () => {
      active.current = false;
    };
  }, []);
  const saveBrief = (value: string) => {
    setBrief(value);
    editor.updateDocumentSettings({
      meta: { ...editor.getDocumentSettings().meta, creativeBrief: value },
    });
  };
  const draftBrief = async () => {
    setMessage(null);
    try {
      const mode = editor.getSelectedShapeIds().length
        ? "selection"
        : "viewport";
      const attachment = await createCanvasAttachment(editor, identity, mode);
      attachCanvasToChat({
        sessionId: identity.sessionId,
        attachment,
        prompt:
          "Use these reference images and canvas notes to write a concise creative brief: subject, audience, composition, palette, materials, and three distinct variation directions. Use the existing canvas commands to add the brief as a note on this board. Do not generate media yet.",
      });
      revealChat();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not attach references.",
      );
    }
  };
  const useSelectedText = () => {
    {
      const text = editor
        .getSelectedShapes()
        .map((shape) => {
          const props = shape.props as Record<string, unknown>;
          return props.richText
            ? renderPlaintextFromRichText(
                editor,
                props.richText as Parameters<
                  typeof renderPlaintextFromRichText
                >[1],
              )
            : "";
        })
        .filter(Boolean)
        .join("\n\n");
      if (text) saveBrief(text.slice(0, 4000));
      else setMessage("Select the brief note on the canvas first.");
    }
  };
  const generate = async () => {
    if (inFlight.current || !brief.trim() || !status?.configured) return;
    inFlight.current = true;
    const isCurrent = () =>
      active.current && currentEditor.current === editor && !editor.isDisposed;
    const pageId = editor.getCurrentPageId();
    const origin = editor.getViewportPageBounds().center;
    const defaults = editor
      .getShapeUtil<TLImageShape>("image")
      .getDefaultProps();
    const database = getCanvasPersistenceDatabase(identity.persistenceKey);
    setBusy(true);
    setMessage("Generating variations… this can take a few minutes.");
    try {
      const imageShapes = editor
        .getSelectedShapes()
        .filter((shape): shape is TLImageShape => shape.type === "image");
      if (imageShapes.length > 4)
        throw new Error("Select up to four reference images.");
      await database.saveDocument(editor.store.getStoreSnapshot("document"));
      const references = await Promise.all(
        imageShapes.map(async (shape) => {
          const asset = shape.props.assetId
            ? editor.getAsset(shape.props.assetId)
            : undefined;
          if (!asset || asset.type !== "image")
            throw new Error("A selected reference image is unavailable.");
          const source = await editor.resolveAssetUrl(asset.id, {
            screenScale: 1,
          });
          if (
            !source ||
            !(source.startsWith("blob:") || source.startsWith("data:image/"))
          )
            throw new Error(
              "Import reference images into this board before generating.",
            );
          const response = await fetch(source);
          const blob = await response.blob();
          const normalized = await resizeImage(
            new File([blob], asset.props.name, { type: blob.type }),
          );
          if (
            normalized.mimeType !== "image/png" &&
            normalized.mimeType !== "image/jpeg" &&
            normalized.mimeType !== "image/webp"
          )
            throw new Error("Reference images must be PNG, JPEG or WebP.");
          return {
            base64: normalized.base64,
            mimeType: normalized.mimeType as
              | "image/png"
              | "image/jpeg"
              | "image/webp",
          };
        }),
      );
      const images = await generateCanvasImages({
        prompt: brief,
        references,
        count,
      });
      const created: GeneratedCanvasPlacement[] = [];
      const blobs = new Map<string, Blob>();
      const rejected: string[] = [];
      for (const [index, image] of images.entries()) {
        try {
          const blob = blobFromImage(image.base64, image.mimeType);
          const bitmap = await createImageBitmap(blob);
          const width = bitmap.width;
          const height = bitmap.height;
          bitmap.close();
          const asset: TLImageAsset = {
            id: AssetRecordType.createId(),
            typeName: "asset",
            type: "image",
            props: {
              name: `Variation ${index + 1}`,
              src: null,
              mimeType: image.mimeType,
              w: width,
              h: height,
              isAnimated: false,
              fileSize: blob.size,
            },
            meta: { generatedBy: "OpenAI", model: status.model, prompt: brief },
          };
          blobs.set(asset.id, blob);
          asset.props.src = asset.id;
          created.push({
            asset,
            shape: {
              id: createShapeId(),
              type: "image" as const,
              x: origin.x + index * 360,
              y: origin.y,
              props: {
                ...defaults,
                assetId: asset.id,
                w: 320,
                h: (320 * height) / width,
              },
            },
          });
        } catch (error) {
          rejected.push(
            `Variation ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (!created.length)
        throw new Error(
          rejected.join(" ") || "No usable images were returned.",
        );
      let merged: ReturnType<typeof mergeGeneratedPlacements> | undefined;
      await database.updateDocumentAndAssets((snapshot) => {
        merged = mergeGeneratedPlacements(snapshot, pageId, created);
        return merged.snapshot;
      }, blobs);
      if (!merged) throw new Error("Could not save generated variations.");
      const committed = merged;
      if (isCurrent()) {
        editor.markHistoryStoppingPoint("Generate image variations");
        editor.run(() => editor.store.put(committed.records));
        if (editor.getCurrentPageId() === merged.pageId) {
          editor.select(...created.map((item) => item.shape.id));
          editor.zoomToSelection();
        }
        setMessage(
          `Saved ${created.length} generated variations to ${editor.getCurrentPageId() === merged.pageId ? "this page" : "the original board page"}. Arrange them, then export PNG or the editable project.${rejected.length ? ` ${rejected.join(" ")}` : ""}`,
        );
      } else {
        toast.success(
          `Saved ${created.length} generated variations to the original canvas board.`,
          { description: rejected.join(" ") || undefined },
        );
      }
      broadcastCanvasRecords(
        identity.persistenceKey,
        merged.records,
        isCurrent() ? editor.store.id : undefined,
      );
    } catch (error) {
      const description =
        error instanceof Error ? error.message : String(error);
      if (isCurrent()) setMessage(description);
      else toast.error("Could not save generated variations", { description });
    } finally {
      inFlight.current = false;
      if (isCurrent()) setBusy(false);
    }
  };
  return (
    <details
      className="shrink-0 border-b border-border text-xs"
      data-testid="creative-workflow"
    >
      <summary className="cursor-pointer px-3 py-2 font-medium">
        Creative workflow · references → brief → variations
      </summary>
      <div className="max-h-60 space-y-2 overflow-auto px-3 pb-3">
        <p className="text-muted-foreground">
          Import reference images with the canvas image tool. Select references,
          ask your chat agent for a brief, then select its note to use it here.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void draftBrief()}
            className="rounded border border-border px-2 py-1"
          >
            Draft brief in chat
          </button>
          <button
            type="button"
            onClick={useSelectedText}
            className="rounded border border-border px-2 py-1"
          >
            Use selected note as brief
          </button>
        </div>
        <textarea
          aria-label="Creative brief"
          maxLength={4000}
          rows={3}
          value={brief}
          disabled={busy}
          onChange={(event) => saveBrief(event.target.value)}
          placeholder="Describe the variation you want…"
          className="w-full resize-y rounded border border-border bg-card p-2"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Variation count"
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
            disabled={busy}
            className="rounded border border-border bg-card p-1"
          >
            {[1, 2, 3, 4].map((value) => (
              <option value={value} key={value}>
                {value} variation{value > 1 ? "s" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !brief.trim() || !status?.configured}
            onClick={() => void generate()}
            className="rounded bg-foreground px-3 py-1 text-background disabled:opacity-40"
          >
            {busy ? "Generating…" : "Generate variations"}
          </button>
          <span className="text-muted-foreground">
            {status?.configured
              ? `OpenAI · ${status.model} · paid API · up to 4 selected image references`
              : "Image API not configured"}
          </span>
        </div>
        {!status?.configured ? (
          <p className="text-muted-foreground">
            Launch the desktop app with CREATIVE_OPENAI_API_KEY configured
            locally. OpenAI API billing is separate from coding subscriptions.
            Your brief and selected references are sent only when you generate.
          </p>
        ) : null}
        {message ? (
          <p role="status" className="text-muted-foreground">
            {message}
          </p>
        ) : null}
      </div>
    </details>
  );
}
