import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeCanvas,
  onCloseCanvas,
  onOpenCanvas,
  openCanvas,
} from "./canvasEvents";
import type { CanvasOpenRequest } from "./canvasEvents";

const request: CanvasOpenRequest = {
  scope: "chat",
  sessionId: "session-1",
  projectId: "project-1",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("canvas lifecycle events", () => {
  it("delivers an open request with its complete target", () => {
    const listener = vi.fn();
    const unsubscribe = onOpenCanvas(listener);

    openCanvas(request);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(request);
    unsubscribe();
  });

  it("delivers close events to active listeners", () => {
    const listener = vi.fn();
    const unsubscribe = onCloseCanvas(listener);

    closeCanvas("session-1");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("session-1");
    unsubscribe();
  });

  it("stops delivering events after unsubscribe", () => {
    const openListener = vi.fn();
    const closeListener = vi.fn();
    const unsubscribeOpen = onOpenCanvas(openListener);
    const unsubscribeClose = onCloseCanvas(closeListener);

    unsubscribeOpen();
    unsubscribeClose();
    openCanvas(request);
    closeCanvas(request.sessionId);

    expect(openListener).not.toHaveBeenCalled();
    expect(closeListener).not.toHaveBeenCalled();
  });

  it("supports multiple subscribers without coupling their cleanup", () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = onOpenCanvas(first);
    const unsubscribeSecond = onOpenCanvas(second);

    unsubscribeFirst();
    openCanvas(request);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(request);
    unsubscribeSecond();
  });
});
