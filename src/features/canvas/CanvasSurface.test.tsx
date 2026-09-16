import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeCanvas, openCanvas } from "./canvasEvents";
import { CanvasSurface } from "./CanvasSurface";

vi.mock("./CanvasWorkspace", () => ({
  CanvasWorkspace: ({
    initialScope,
    onClose,
    visible,
  }: {
    initialScope: string;
    onClose: () => void;
    visible: boolean;
  }) => (
    <div
      data-testid="mock-canvas-workspace"
      data-scope={initialScope}
      data-visible={visible}
    >
      <button type="button" onClick={onClose}>
        Close mock canvas
      </button>
    </div>
  ),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CanvasSurface", () => {
  it("opens lazily from its toggle and closes back to the toggle", async () => {
    const onVisibilityChange = vi.fn();
    render(
      <CanvasSurface
        sessionId="session-1"
        projectId="project-1"
        onVisibilityChange={onVisibilityChange}
      />,
    );

    expect(screen.getByTestId("canvas-toggle")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-canvas-workspace")).toBeNull();

    fireEvent.click(screen.getByTestId("canvas-toggle"));

    await waitFor(() =>
      expect(screen.getByTestId("mock-canvas-workspace")).toHaveAttribute(
        "data-scope",
        "chat",
      ),
    );
    expect(onVisibilityChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "Close mock canvas" }));

    await waitFor(() =>
      expect(screen.getByTestId("canvas-toggle")).toBeInTheDocument(),
    );
    expect(onVisibilityChange).toHaveBeenLastCalledWith(false);
  });

  it("opens only for a matching session and preserves the requested scope", async () => {
    render(<CanvasSurface sessionId="session-1" projectId="project-1" />);

    openCanvas({
      sessionId: "other-session",
      projectId: "project-1",
      scope: "project",
    });
    expect(screen.queryByTestId("mock-canvas-workspace")).toBeNull();

    openCanvas({
      sessionId: "session-1",
      projectId: "project-1",
      scope: "project",
    });
    await waitFor(() =>
      expect(screen.getByTestId("mock-canvas-workspace")).toHaveAttribute(
        "data-scope",
        "project",
      ),
    );
  });

  it("closes only when the close event targets its session", async () => {
    render(<CanvasSurface sessionId="session-1" />);
    fireEvent.click(screen.getByTestId("canvas-toggle"));

    closeCanvas("other-session");
    expect(screen.getByTestId("mock-canvas-workspace")).toBeInTheDocument();

    closeCanvas("session-1");
    await waitFor(() =>
      expect(screen.getByTestId("canvas-toggle")).toBeInTheDocument(),
    );
  });
});
