import type { CanvasBoardTarget } from "./canvasIdentity";

const OPEN_CANVAS_EVENT = "berd:canvas-open";
const CLOSE_CANVAS_EVENT = "berd:canvas-close";

export interface CanvasOpenRequest extends CanvasBoardTarget {}

export function openCanvas(target: CanvasOpenRequest): void {
  window.dispatchEvent(
    new CustomEvent<CanvasOpenRequest>(OPEN_CANVAS_EVENT, { detail: target }),
  );
}

export function closeCanvas(sessionId: string): void {
  window.dispatchEvent(
    new CustomEvent<string>(CLOSE_CANVAS_EVENT, { detail: sessionId }),
  );
}

export function onOpenCanvas(
  listener: (request: CanvasOpenRequest) => void,
): () => void {
  const handleOpen = (event: Event) => {
    listener((event as CustomEvent<CanvasOpenRequest>).detail);
  };
  window.addEventListener(OPEN_CANVAS_EVENT, handleOpen);
  return () => window.removeEventListener(OPEN_CANVAS_EVENT, handleOpen);
}

export function onCloseCanvas(
  listener: (sessionId: string) => void,
): () => void {
  const handleClose = (event: Event) => {
    listener((event as CustomEvent<string>).detail);
  };
  window.addEventListener(CLOSE_CANVAS_EVENT, handleClose);
  return () => window.removeEventListener(CLOSE_CANVAS_EVENT, handleClose);
}
