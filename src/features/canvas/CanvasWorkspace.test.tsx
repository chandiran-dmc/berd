import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasWorkspace } from "./CanvasWorkspace";

const mocks = vi.hoisted(() => ({
  editor: {
    getCurrentPageShapes: vi.fn(() => []),
    getSelectedShapeIds: vi.fn(() => []),
    getSnapshot: vi.fn(() => ({ document: { store: {}, schema: {} } })),
    loadSnapshot: vi.fn(),
    store: { listen: vi.fn(() => vi.fn()) },
  },
}));

vi.mock("@tldraw/assets/selfHosted", () => ({
  getAssetUrls: () => ({}),
}));

vi.mock("./persistence", () => ({
  loadPersistentCanvasStore: async () => ({
    store: {},
    dispose: vi.fn(async () => undefined),
  }),
}));

vi.mock("tldraw", async () => {
  const React = await import("react");
  return {
    Tldraw: ({
      onMount,
    }: {
      onMount?: (editor: typeof mocks.editor) => void;
    }) => {
      React.useEffect(() => onMount?.(mocks.editor), [onMount]);
      return <div data-testid="mock-tldraw" />;
    },
    createShapeId: () => "shape:test",
    renderPlaintextFromRichText: () => "",
    toRichText: (text: string) => ({ text }),
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderWorkspace(
  overrides: Partial<React.ComponentProps<typeof CanvasWorkspace>> = {},
) {
  return render(
    <CanvasWorkspace
      sessionId="session-1"
      projectId="project-1"
      visible
      onClose={vi.fn()}
      {...overrides}
    />,
  );
}

describe("CanvasWorkspace", () => {
  it("keeps chat and project persistence keys separate while switching scope", async () => {
    renderWorkspace();

    await screen.findByTestId("mock-tldraw");
    expect(screen.getByTestId("canvas-editor")).toHaveAttribute(
      "data-canvas-board-id",
      "chat:session-1",
    );
    expect(screen.getByText("Private to this chat")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("canvas-scope-project"));

    await waitFor(() =>
      expect(screen.getByTestId("canvas-editor")).toHaveAttribute(
        "data-canvas-board-id",
        "project:project-1",
      ),
    );
    expect(
      screen.getByText("Shared by every chat in this project"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("canvas-editor")).toHaveAttribute(
      "data-canvas-board-id",
      "project:project-1",
    );
  });

  it("disables the project scope when the chat has no project", () => {
    renderWorkspace({ projectId: null, initialScope: "project" });

    const projectScope = screen.getByTestId("canvas-scope-project");
    expect(projectScope).toBeDisabled();
    expect(projectScope).toHaveAttribute(
      "title",
      "Add this chat to a project first",
    );
    expect(screen.getByText("Private to this chat")).toBeInTheDocument();
  });

  it("reports an actionable error when exporting an empty canvas", async () => {
    renderWorkspace();

    const exportButton = screen.getByTestId("canvas-export");
    await waitFor(() => expect(exportButton).toBeEnabled());
    fireEvent.click(exportButton);

    expect(
      await screen.findByText("Add something to the canvas before exporting."),
    ).toBeInTheDocument();
  });

  it("keeps the mounted editor when the same board is opened again", async () => {
    const { rerender } = renderWorkspace({ requestVersion: 1 });
    const exportButton = screen.getByTestId("canvas-export");
    await waitFor(() => expect(exportButton).toBeEnabled());

    rerender(
      <CanvasWorkspace
        sessionId="session-1"
        projectId="project-1"
        initialScope="chat"
        requestVersion={2}
        visible
        onClose={vi.fn()}
      />,
    );

    expect(exportButton).toBeEnabled();
  });

  it("restores the requested board after a manual scope change", async () => {
    const { rerender } = renderWorkspace({ requestVersion: 1 });
    fireEvent.click(screen.getByTestId("canvas-scope-project"));
    await waitFor(() =>
      expect(screen.getByTestId("canvas-editor")).toHaveAttribute(
        "data-canvas-board-id",
        "project:project-1",
      ),
    );

    rerender(
      <CanvasWorkspace
        sessionId="session-1"
        projectId="project-1"
        initialScope="chat"
        requestVersion={2}
        visible
        onClose={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("canvas-editor")).toHaveAttribute(
        "data-canvas-board-id",
        "chat:session-1",
      ),
    );
  });

  it("forwards close requests and hides when visibility is false", () => {
    const onClose = vi.fn();
    const { rerender } = renderWorkspace({ onClose });

    fireEvent.click(screen.getByTestId("canvas-close"));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <CanvasWorkspace
        sessionId="session-1"
        projectId="project-1"
        visible={false}
        onClose={onClose}
      />,
    );
    expect(screen.getByTestId("canvas-workspace")).toHaveClass("hidden");
    expect(screen.getByTestId("canvas-workspace")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
