import { CreativeWorkflow } from "./CreativeWorkflow";
import { onCanvasAction } from "./actions";
import {
  loadCanvasBoardCatalog,
  createCanvasBoard,
  renameCanvasBoard,
  type CanvasBoardSummary,
} from "./boardCatalog";
import { exportCanvasBundle, importCanvasBundle } from "./portableBundles";
import { getCanvasPersistenceDatabase } from "./persistence";
import {
  createCanvasAttachment,
  trackCanvasEdits,
  type CanvasContextMode,
} from "./contextAttachment";
import { attachCanvasToChat } from "./composerEvents";
import { getAssetUrls } from "@tldraw/assets/selfHosted";
import {
  IconChevronDown,
  IconDownload,
  IconFileExport,
  IconFileImport,
  IconLayoutSidebarLeftExpand,
  IconLoader2,
  IconMessageCirclePlus,
  IconPhoto,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  initialBoardId?: string | null;
  chatCollapsed?: boolean;
  onToggleChat?: () => void;
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
    const unregister = registerMountedEditor(identity, editor);
    const stopTracking = trackCanvasEdits(editor);
    return () => {
      stopTracking();
      unregister();
    };
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
  initialBoardId,
  chatCollapsed = false,
  onToggleChat,
}: CanvasWorkspaceProps) {
  const [scope, setScope] = useState<CanvasScope>(() =>
    initialScope === "project" && !projectId ? "chat" : initialScope,
  );
  const [mountedEditor, setMountedEditor] = useState<{
    persistenceKey: string;
    editor: Editor;
  } | null>(null);
  const [boardId, setBoardId] = useState<string | null>(initialBoardId ?? null);
  const [boards, setBoards] = useState<CanvasBoardSummary[]>([]);
  const [boardName, setBoardName] = useState("");
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [bundleBusy, setBundleBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const effectiveScope = scope === "project" && !projectId ? "chat" : scope;
  const identity = useMemo(
    () =>
      getCanvasBoardIdentity({
        sessionId,
        projectId,
        scope: effectiveScope,
        boardId,
      }),
    [effectiveScope, projectId, sessionId, boardId],
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
    setBoardId(initialBoardId ?? null);
  }, [initialScope, initialBoardId, projectId, requestVersion]);

  useEffect(
    () =>
      onCanvasAction((result) => {
        if (result.boardId === identity.boardId)
          setActionFeedback(result.message);
      }),
    [identity.boardId],
  );

  const handleScopeChange = useCallback((nextScope: CanvasScope) => {
    setExportError(null);
    setScope(nextScope);
    setBoardId(null);
  }, []);

  const target = useMemo(
    () => ({ sessionId, projectId, scope: effectiveScope }),
    [sessionId, projectId, effectiveScope],
  );
  useEffect(() => {
    let active = true;
    const loadBoards = () => {
      void loadCanvasBoardCatalog(target)
        .then((catalog) => {
          if (active) setBoards(catalog.boards);
        })
        .catch((error) => {
          if (active) setExportError(String(error));
        });
    };
    loadBoards();
    window.addEventListener("focus", loadBoards);
    return () => {
      active = false;
      window.removeEventListener("focus", loadBoards);
    };
  }, [target]);
  const refreshBoards = async () =>
    setBoards((await loadCanvasBoardCatalog(target)).boards);
  const attach = async (mode: CanvasContextMode, prompt?: string) => {
    if (!editor || attaching) return;
    setAttaching(true);
    setExportError(null);
    try {
      const attachment = await createCanvasAttachment(editor, identity, mode);
      attachCanvasToChat({ sessionId, attachment, prompt });
      if (chatCollapsed) onToggleChat?.();
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Could not attach canvas.",
      );
    } finally {
      setAttaching(false);
    }
  };
  const addBoard = async () => {
    try {
      const board = await createCanvasBoard(
        target,
        boardName || "Untitled board",
      );
      await refreshBoards();
      setBoardId(board.boardId);
      setBoardName("");
    } catch (error) {
      setExportError(String(error));
    }
  };
  const renameBoard = async () => {
    try {
      await renameCanvasBoard(target, identity.boardId, boardName);
      await refreshBoards();
      setBoardName("");
    } catch (error) {
      setExportError(String(error));
    }
  };
  const exportBundle = async () => {
    if (!editor || bundleBusy) return;
    setBundleBusy(true);
    setExportError(null);
    try {
      await getCanvasPersistenceDatabase(identity.persistenceKey).saveDocument(
        editor.store.getStoreSnapshot("document"),
      );
      const catalog = await loadCanvasBoardCatalog(target);
      const bytes = await exportCanvasBundle({
        boards: catalog.boards.map((board) => ({
          ...board,
          persistenceKey: getCanvasBoardIdentity({
            ...target,
            boardId: board.boardId,
          }).persistenceKey,
        })),
      });
      downloadBlob(
        new Blob([bytes as BlobPart], { type: "application/zip" }),
        `creative-${effectiveScope}.creative.zip`,
      );
      setActionFeedback(
        `Exported ${catalog.boards.length} editable ${catalog.boards.length === 1 ? "board" : "boards"}.`,
      );
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Could not export project.",
      );
    } finally {
      setBundleBusy(false);
    }
  };
  const importBundle = async (file?: File) => {
    if (!file || bundleBusy) return;
    setBundleBusy(true);
    setExportError(null);
    try {
      if (file.size > 100 * 1024 * 1024)
        throw new Error("Bundle exceeds the 100 MB limit.");
      const result = await importCanvasBundle(
        target,
        new Uint8Array(await file.arrayBuffer()),
      );
      await refreshBoards();
      if (result.boards[0]) setBoardId(result.boards[0].boardId);
      setActionFeedback(
        `Imported ${result.boards.length} editable ${result.boards.length === 1 ? "board" : "boards"} with ${result.assetCount} ${result.assetCount === 1 ? "asset" : "assets"}.`,
      );
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Could not import project.",
      );
    } finally {
      setBundleBusy(false);
      if (importRef.current) importRef.current.value = "";
    }
  };

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
          ? "flex h-full min-h-[250px] min-w-0 flex-1 flex-col overflow-hidden rounded-md bg-card"
          : "hidden"
      }
    >
      <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-2">
        <div className="min-w-0 flex-1">
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
          className="hidden items-center rounded-full bg-muted p-0.5 sm:flex"
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
        <select
          aria-label="Canvas scope"
          value={effectiveScope}
          onChange={(event) =>
            handleScopeChange(event.target.value as CanvasScope)
          }
          className="h-8 max-w-24 rounded-full border border-border bg-card px-2 text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-ring sm:hidden"
        >
          <option value="chat">Chat</option>
          {projectId ? <option value="project">Project</option> : null}
        </select>
        {onToggleChat && chatCollapsed ? (
          <button
            type="button"
            data-testid="canvas-show-chat"
            onClick={onToggleChat}
            aria-label="Show chat"
            title="Show chat"
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <IconLayoutSidebarLeftExpand
              className="size-4"
              aria-hidden="true"
            />
            <span className="hidden md:inline">Show chat</span>
          </button>
        ) : null}
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
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs">
        <div className="flex min-w-0 items-center gap-1 rounded-lg border border-border bg-background p-1">
          <select
            aria-label="Board"
            data-testid="canvas-board-select"
            value={identity.boardId}
            onChange={(event) => setBoardId(event.target.value)}
            className="h-7 max-w-32 truncate rounded-md bg-transparent px-2 font-medium outline-none focus:ring-2 focus:ring-ring sm:max-w-48"
          >
            {boards.length ? (
              boards.map((board) => (
                <option key={board.boardId} value={board.boardId}>
                  {board.name}
                </option>
              ))
            ) : (
              <option value={identity.boardId}>Main board</option>
            )}
          </select>
          <input
            aria-label="Board name"
            placeholder="Name a board"
            value={boardName}
            onChange={(event) => setBoardName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && boardName.trim()) void addBoard();
            }}
            maxLength={120}
            className="h-7 w-24 rounded-md border-l border-border bg-transparent px-2 outline-none focus:ring-2 focus:ring-ring sm:w-28"
          />
          <button
            type="button"
            aria-label="New board"
            title="New board"
            onClick={() => void addBoard()}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <IconPlus className="size-4" aria-hidden="true" />
          </button>
          {boardName.trim() ? (
            <button
              type="button"
              onClick={() => void renameBoard()}
              className="hidden h-7 rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground sm:inline-flex sm:items-center"
            >
              Rename
            </button>
          ) : (
            <span className="sr-only">
              Enter a name to create or rename a board
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Attach visible canvas"
            disabled={!editor || attaching}
            onClick={() => void attach("viewport")}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <IconPhoto className="size-4" aria-hidden="true" />
            <span className="hidden min-[760px]:inline">Attach view</span>
          </button>
          <button
            type="button"
            aria-label="Ask about selection"
            disabled={!editor || attaching}
            onClick={() =>
              void attach("selection", "Help me develop this canvas selection.")
            }
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3 font-medium text-background hover:opacity-90 disabled:opacity-40"
          >
            <IconMessageCirclePlus className="size-4" aria-hidden="true" />
            Ask selection
          </button>
          <details className="group relative">
            <summary className="flex h-8 cursor-pointer list-none items-center gap-1 rounded-full px-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              More
              <IconChevronDown
                className="size-3.5 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div className="absolute right-0 top-10 z-[410] w-52 rounded-lg border border-border bg-card p-1.5 shadow-lg">
              <button
                type="button"
                disabled={!editor || bundleBusy}
                onClick={() => void exportBundle()}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left hover:bg-muted disabled:opacity-40"
              >
                <IconFileExport className="size-4" aria-hidden="true" />
                Export editable bundle
              </button>
              <button
                type="button"
                disabled={bundleBusy}
                onClick={() => importRef.current?.click()}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left hover:bg-muted disabled:opacity-40"
              >
                <IconFileImport className="size-4" aria-hidden="true" />
                Import editable bundle
              </button>
            </div>
          </details>
          <input
            ref={importRef}
            type="file"
            accept=".zip"
            aria-label="Import editable canvas bundle"
            className="hidden"
            onChange={(event) => void importBundle(event.target.files?.[0])}
          />
          {onToggleChat && !chatCollapsed ? (
            <button
              type="button"
              aria-label="Hide chat"
              title="Hide chat"
              onClick={onToggleChat}
              className="inline-flex h-8 items-center rounded-full px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <span className="hidden min-[760px]:inline">Hide chat</span>
              <IconLayoutSidebarLeftExpand
                className="size-4 rotate-180 min-[760px]:ml-1.5"
                aria-hidden="true"
              />
            </button>
          ) : null}
          {attaching || bundleBusy ? (
            <span role="status">
              {attaching ? "Capturing canvas…" : "Preparing bundle…"}
            </span>
          ) : null}
        </div>
      </div>
      {editor ? (
        <CreativeWorkflow
          key={identity.persistenceKey}
          editor={editor}
          identity={identity}
          revealChat={() => {
            if (chatCollapsed) onToggleChat?.();
          }}
        />
      ) : null}
      {actionFeedback ? (
        <p
          role="status"
          className="border-b border-border px-3 py-1 text-xs text-muted-foreground"
        >
          {actionFeedback}
        </p>
      ) : null}
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
