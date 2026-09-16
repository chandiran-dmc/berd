import { IconBrush } from "@tabler/icons-react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { onCloseCanvas, onOpenCanvas } from "./canvasEvents";
import type { CanvasScope } from "./canvasIdentity";

const LazyCanvasWorkspace = lazy(() =>
  import("./CanvasWorkspace").then((module) => ({
    default: module.CanvasWorkspace,
  })),
);

interface CanvasSurfaceProps {
  sessionId: string;
  projectId?: string | null;
  onVisibilityChange?: (visible: boolean) => void;
  chatCollapsed?: boolean;
  onToggleChat?: () => void;
}

export function CanvasSurface({
  sessionId,
  projectId,
  onVisibilityChange,
  chatCollapsed,
  onToggleChat,
}: CanvasSurfaceProps) {
  const [state, setState] = useState<{
    hasOpened: boolean;
    visible: boolean;
    initialScope: CanvasScope;
    requestVersion: number;
    boardId?: string | null;
  }>({
    hasOpened: false,
    visible: false,
    initialScope: "chat",
    requestVersion: 0,
  });

  const open = useCallback(
    (scope: CanvasScope = "chat", boardId?: string | null) => {
      setState((current) => ({
        hasOpened: true,
        visible: true,
        initialScope: scope,
        boardId,
        requestVersion: current.requestVersion + 1,
      }));
      onVisibilityChange?.(true);
    },
    [onVisibilityChange],
  );
  const close = useCallback(() => {
    setState((current) => ({ ...current, visible: false }));
    if (chatCollapsed) onToggleChat?.();
    onVisibilityChange?.(false);
  }, [chatCollapsed, onToggleChat, onVisibilityChange]);

  useEffect(() => {
    const stopOpen = onOpenCanvas((request) => {
      if (request.sessionId !== sessionId) return;
      open(request.scope, request.boardId);
    });
    const stopClose = onCloseCanvas((targetSessionId) => {
      if (targetSessionId === sessionId) close();
    });
    return () => {
      stopOpen();
      stopClose();
    };
  }, [close, open, sessionId]);

  return (
    <>
      {!state.visible ? (
        <button
          type="button"
          data-testid="canvas-toggle"
          onClick={() => open(projectId ? "project" : "chat")}
          aria-label={
            projectId ? "Open project canvas" : "Open creative canvas"
          }
          title={projectId ? "Open project canvas" : "Open creative canvas"}
          className="absolute left-3 top-3 z-30 inline-flex h-8 items-center gap-1.5 rounded-full border border-border/80 bg-card/90 px-3 text-xs font-medium text-muted-foreground shadow-mini backdrop-blur transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <IconBrush className="size-4" aria-hidden="true" />
          {projectId ? "Project canvas" : "Canvas"}
        </button>
      ) : null}
      {state.hasOpened ? (
        <Suspense
          fallback={
            <div className="flex h-[55%] min-h-[250px] min-w-0 shrink-0 items-center justify-center rounded-md bg-card text-sm text-muted-foreground min-[1100px]:h-full min-[1100px]:min-w-[480px] min-[1100px]:flex-1">
              Opening canvas…
            </div>
          }
        >
          <LazyCanvasWorkspace
            sessionId={sessionId}
            projectId={projectId}
            initialScope={state.initialScope}
            initialBoardId={state.boardId}
            chatCollapsed={chatCollapsed}
            onToggleChat={onToggleChat}
            requestVersion={state.requestVersion}
            visible={state.visible}
            onClose={close}
          />
        </Suspense>
      ) : null}
    </>
  );
}
