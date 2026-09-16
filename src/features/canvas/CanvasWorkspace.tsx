import { getAssetUrls } from "@tldraw/assets/selfHosted";
import { IconDownload, IconLoader2, IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import { getCanvasBoardIdentity, type CanvasScope } from "./canvasIdentity";
import {
  loadPersistentCanvasStore,
  type PersistentCanvasStore,
} from "./persistence";
import { registerMountedEditor } from "./runtime";

const TLDRAW_ASSET_URLS = getAssetUrls({ baseUrl: "/tldraw" });

interface CanvasWorkspaceProps {
  sessionId: string;
  projectId?: string | null;
  initialScope?: CanvasScope;
  visible: boolean;
  requestVersion?: number;
  onClose: () => void;
}

interface PersistentCanvasProps {
  identity: ReturnType<typeof getCanvasBoardIdentity>;
  visible: boolean;
  onEditorChange: (editor: Editor | null) => void;
}

function PersistentCanvas({
  identity,
  visible,
  onEditorChange,
}: PersistentCanvasProps) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [persistentStore, setPersistentStore] =
    useState<PersistentCanvasStore | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let loaded: PersistentCanvasStore | null = null;
    setPersistentStore(null);
    setPersistenceError(null);
    void loadPersistentCanvasStore(identity.persistenceKey, (error) => {
      if (disposed) return;
      setPersistenceError(
        error instanceof Error ? error.message : "Could not save this canvas.",
      );
    })
      .then((result) => {
        loaded = result;
        if (disposed) return result.dispose();
        setPersistentStore(result);
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setPersistenceError(
            error instanceof Error
              ? error.message
              : "Could not load this canvas.",
          );
        }
      });
    return () => {
      disposed = true;
      if (loaded) void loaded.dispose().catch(() => undefined);
    };
  }, [identity.persistenceKey]);

  useEffect(() => {
    onEditorChange(editor);
    if (!editor || !visible) return;
    return registerMountedEditor(identity, editor);
  }, [editor, identity, onEditorChange, visible]);

  if (persistenceError && !persistentStore) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-destructive">
        {persistenceError}
      </div>
    );
  }
  if (!persistentStore) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading canvas…
      </div>
    );
  }
  return (
    <>
      {persistenceError ? (
        <div className="absolute inset-x-3 top-3 z-[400] rounded-md bg-destructive px-3 py-2 text-xs text-destructive-foreground shadow-mini">
          Canvas changes could not be saved: {persistenceError}
        </div>
      ) : null}
      <Tldraw
        store={persistentStore.store}
        assetUrls={TLDRAW_ASSET_URLS}
        licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY}
        onMount={setEditor}
      />
    </>
  );
}

function sanitizeFileSegment(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function CanvasWorkspace({
  sessionId,
  projectId,
  initialScope = "chat",
  visible,
  requestVersion = 0,
  onClose,
}: CanvasWorkspaceProps) {
  const [scope, setScope] = useState<CanvasScope>(() =>
    initialScope === "project" && !projectId ? "chat" : initialScope,
  );
  const [mountedEditor, setMountedEditor] = useState<{
    persistenceKey: string;
    editor: Editor;
  } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const effectiveScope = scope === "project" && !projectId ? "chat" : scope;
  const identity = useMemo(
    () =>
      getCanvasBoardIdentity({ sessionId, projectId, scope: effectiveScope }),
    [effectiveScope, projectId, sessionId],
  );
  const editor =
    mountedEditor?.persistenceKey === identity.persistenceKey
      ? mountedEditor.editor
      : null;

  useEffect(() => {
    // Each explicit open request reapplies its requested board, even when the
    // requested scope string is unchanged from the previous request.
    void requestVersion;
    setScope(initialScope === "project" && !projectId ? "chat" : initialScope);
  }, [initialScope, projectId, requestVersion]);

  const handleScopeChange = useCallback((nextScope: CanvasScope) => {
    setExportError(null);
    setScope(nextScope);
  }, []);

  const handleEditorChange = useCallback(
    (nextEditor: Editor | null) => {
      if (!nextEditor) return;
      setMountedEditor({
        persistenceKey: identity.persistenceKey,
        editor: nextEditor,
      });
    },
    [identity.persistenceKey],
  );

  const handleExport = useCallback(async () => {
    if (!editor || isExporting) return;
    const shapes = editor.getCurrentPageShapes();
    if (shapes.length === 0) {
      setExportError("Add something to the canvas before exporting.");
      return;
    }

    setIsExporting(true);
    setExportError(null);
    try {
      const { blob } = await editor.toImage(shapes, {
        format: "png",
        background: true,
        padding: 32,
        scale: 2,
      });
      const owner =
        effectiveScope === "project" && projectId ? projectId : sessionId;
      downloadBlob(
        blob,
        `berd-${effectiveScope}-canvas-${sanitizeFileSegment(owner) || "board"}.png`,
      );
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "Could not export this canvas.",
      );
    } finally {
      setIsExporting(false);
    }
  }, [editor, effectiveScope, isExporting, projectId, sessionId]);

  return (
    <section
      aria-label="Creative canvas"
      aria-hidden={!visible}
      inert={!visible ? true : undefined}
      data-testid="canvas-workspace"
      className={
        visible
          ? "flex h-[55%] min-h-[250px] min-w-0 shrink-0 flex-col overflow-hidden rounded-md bg-card min-[1100px]:h-full min-[1100px]:min-w-[480px] min-[1100px]:flex-1"
          : "hidden"
      }
    >
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card px-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">
            Creative canvas
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {effectiveScope === "project"
              ? "Shared by every chat in this project"
              : "Private to this chat"}
          </p>
        </div>
        <fieldset
          className="ml-auto flex items-center rounded-full bg-muted p-0.5"
          aria-label="Canvas scope"
        >
          <button
            type="button"
            data-testid="canvas-scope-chat"
            onClick={() => handleScopeChange("chat")}
            aria-pressed={effectiveScope === "chat"}
            className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-colors aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-mini"
          >
            Chat
          </button>
          <button
            type="button"
            data-testid="canvas-scope-project"
            disabled={!projectId}
            onClick={() => handleScopeChange("project")}
            aria-pressed={effectiveScope === "project"}
            title={
              projectId
                ? "Use the shared project canvas"
                : "Add this chat to a project first"
            }
            className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-colors aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-mini disabled:cursor-not-allowed disabled:opacity-40"
          >
            Project
          </button>
        </fieldset>
        <button
          type="button"
          data-testid="canvas-export"
          onClick={() => void handleExport()}
          disabled={!editor || isExporting}
          aria-label="Export canvas as PNG"
          title="Export as PNG"
          className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          {isExporting ? (
            <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <IconDownload className="size-4" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          data-testid="canvas-close"
          onClick={onClose}
          aria-label="Close canvas"
          title="Close canvas"
          className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <IconX className="size-4" aria-hidden="true" />
        </button>
      </header>
      {exportError ? (
        <p className="shrink-0 border-b border-border bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {exportError}
        </p>
      ) : null}
      <div
        className="relative min-h-0 flex-1"
        data-testid="canvas-editor"
        data-canvas-board-id={identity.boardId}
      >
        <PersistentCanvas
          key={identity.persistenceKey}
          identity={identity}
          visible={visible}
          onEditorChange={handleEditorChange}
        />
      </div>
    </section>
  );
}
