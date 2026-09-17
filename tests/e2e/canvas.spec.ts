import { expect, test, type Page } from "@playwright/test";
import { buildInitScript } from "./fixtures/tauri-mock";

const sessionA = "canvas-test-a";
const sessionB = "canvas-test-b";
const projectId = "project-alpha";

test.beforeEach(async ({ page }) => {
  await page.addInitScript({
    content: buildInitScript({
      sessions: [
        {
          sessionId: sessionA,
          title: "Creative study",
          projectId,
          messageCount: 0,
        },
        {
          sessionId: sessionB,
          title: "Second study",
          projectId,
          messageCount: 0,
        },
      ],
    }),
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Home", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
});

async function command(page: Page, args: Record<string, unknown>) {
  return page.evaluate(async (args) => {
    // Exercise the real dispatcher/editor against a mocked transport.
    const path = "/src/features/berdctl/commands/registry.ts";
    const { dispatchCommand } = await import(/* @vite-ignore */ path);
    return dispatchCommand("canvas", args, {});
  }, args);
}
async function context(page: Page, session_id = sessionA, scope = "chat") {
  return command(page, {
    action: "context",
    session_id,
    scope,
    ...(scope === "project" ? { project_id: projectId } : {}),
  });
}
async function open(page: Page, session_id = sessionA, scope = "chat") {
  await command(page, {
    action: "open",
    session_id,
    scope,
    ...(scope === "project" ? { project_id: projectId } : {}),
  });
  await expect(page.locator(".tl-canvas")).toBeVisible();
}

test("agent edits are visible, undoable, persistent, exportable and blocked when closed", async ({
  page,
}, testInfo) => {
  await open(page);
  const created = await command(page, {
    action: "add",
    session_id: sessionA,
    kind: "rectangle",
    x: 80,
    y: 80,
    width: 280,
    height: 180,
    text: "Creative direction",
    color: "blue",
  });
  await expect.poll(async () => (await context(page)).shapeCount).toBe(1);
  await command(page, {
    action: "update",
    session_id: sessionA,
    shape_id: created.shape_id,
    text: "Updated direction",
  });
  expect((await context(page)).shapes[0].text).toBe("Updated direction");
  await page.getByRole("button", { name: /^Undo/ }).click();
  expect((await context(page)).shapes[0].text).toBe("Creative direction");
  const downloading = page.waitForEvent("download");
  await page.getByTestId("canvas-export").click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  await download.saveAs(testInfo.outputPath("creative-canvas.png"));
  await page.screenshot({ path: testInfo.outputPath("desktop.png") });
  const bounds = await page.getByTestId("canvas-workspace").boundingBox();
  expect(bounds?.height).toBeGreaterThan(600);
  await page.getByTestId("canvas-close").click();
  await expect(page.getByTestId("canvas-workspace")).toBeHidden();
  await expect(
    command(page, {
      action: "add",
      session_id: sessionA,
      kind: "note",
      x: 0,
      y: 0,
    }),
  ).rejects.toThrow(/open|visible|mounted/i);
  await page.reload();
  await open(page);
  await expect
    .poll(async () => (await context(page)).shapes[0]?.text)
    .toBe("Creative direction");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(
    command(page, {
      action: "add",
      session_id: sessionA,
      kind: "note",
      x: 0,
      y: 0,
    }),
  ).rejects.toThrow(/open|visible|mounted/i);
});

test("chat boards isolate while project boards share across chats", async ({
  page,
}) => {
  await open(page);
  await command(page, {
    action: "add",
    session_id: sessionA,
    kind: "note",
    x: 0,
    y: 0,
    text: "Private idea",
  });
  await open(page, sessionA, "project");
  await command(page, {
    action: "add",
    session_id: sessionA,
    project_id: projectId,
    scope: "project",
    kind: "text",
    x: 0,
    y: 0,
    text: "Shared direction",
  });
  await open(page, sessionB);
  expect((await context(page, sessionB)).shapeCount).toBe(0);
  await page.reload();
  await open(page, sessionB, "project");
  await expect
    .poll(
      async () => (await context(page, sessionB, "project")).shapes[0]?.text,
    )
    .toBe("Shared direction");
  await expect(
    command(page, {
      action: "add",
      session_id: sessionB,
      project_id: "project-beta",
      scope: "project",
      kind: "note",
      x: 0,
      y: 0,
    }),
  ).rejects.toThrow(/not attached/);
  await open(page, sessionA);
  expect((await context(page)).shapes[0].text).toBe("Private idea");
});

test("narrow desktop keeps canvas controls and chat usable", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 608, height: 600 });
  await open(page);
  await expect(page.getByTestId("canvas-close")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Canvas scope", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("textbox", { name: "Chat message input" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Canvas scope", exact: true })
    .selectOption("project");
  await expect(page.getByTestId("canvas-editor")).toHaveAttribute(
    "data-canvas-board-id",
    "project:project-alpha",
  );
  const bounds = await page.getByTestId("canvas-workspace").boundingBox();
  expect(bounds?.height).toBeGreaterThan(240);
  expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(600);
  await page.screenshot({ path: testInfo.outputPath("narrow.png") });
});

test("imported image assets survive reopening the chat", async ({ page }) => {
  await open(page);
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.fillStyle = "#36a9e1";
    context.fillRect(0, 0, 64, 64);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const choosing = page.waitForEvent("filechooser");
  await page.getByTestId("tools.asset").click();
  await (await choosing).setFiles({
    name: "reference.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect
    .poll(
      async () =>
        (await context(page)).shapes.filter(
          (shape: { type: string }) => shape.type === "image",
        ).length,
    )
    .toBe(1);
  await expect(page.locator("img.tl-image").first()).toBeVisible();
  await page.reload();
  await open(page);
  await expect
    .poll(
      async () =>
        (await context(page)).shapes.filter(
          (shape: { type: string }) => shape.type === "image",
        ).length,
    )
    .toBe(1);
  await expect
    .poll(
      async () =>
        page
          .locator("img.tl-image")
          .first()
          .evaluate(
            (image: HTMLImageElement) =>
              image.complete && image.naturalWidth > 0,
          ),
      { timeout: 15_000 },
    )
    .toBe(true);
});

test("selection attachment carries screenshot and bounded structure through the existing agent queue", async ({
  page,
}) => {
  await page.addInitScript({
    content: buildInitScript({
      sessions: [
        {
          sessionId: sessionA,
          title: "Creative study",
          projectId,
          messageCount: 0,
        },
      ],
    }).replace(
      'case "session/prompt": {',
      'case "session/prompt": { window.__canvasPrompts = [...(window.__canvasPrompts || []), message.params];',
    ),
  });
  await page.reload();
  await open(page);
  const created = await command(page, {
    action: "add",
    session_id: sessionA,
    kind: "rectangle",
    x: 10,
    y: 10,
    text: "Reference direction",
  });
  await page
    .getByRole("button", { name: "Ask about selection", exact: true })
    .click();
  await expect(page.getByTestId("canvas-context-attachment")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Chat message input" }),
  ).toHaveValue(/Help me develop/);
  await page
    .getByTestId("canvas-context-attachment")
    .locator("summary")
    .click();
  await expect(page.getByTestId("canvas-context-attachment")).toContainText(
    created.shape_id,
  );
  await page
    .getByRole("textbox", { name: "Chat message input" })
    .press("Enter");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __canvasPrompts?: unknown[] }).__canvasPrompts
            ?.length ?? 0,
      ),
    )
    .toBeGreaterThan(0);
  const request = await page.evaluate(
    () =>
      (
        window as unknown as {
          __canvasPrompts: {
            sessionId: string;
            prompt: { type: string; text?: string; data?: string }[];
          }[];
        }
      ).__canvasPrompts[0],
  );
  expect(request.sessionId).toBe(sessionA);
  expect(
    request.prompt.some(
      (block) => block.type === "image" && (block.data?.length ?? 0) > 100,
    ),
  ).toBe(true);
  const text = request.prompt.map((block) => block.text ?? "").join("\n");
  expect(text).toContain('"selectedShapeIds"');
  expect(text).toContain('"camera"');
  expect(text).toContain(created.shape_id);
});

test("project boards can be named, switched and canvas fills the workspace when chat collapses", async ({
  page,
}, testInfo) => {
  await open(page, sessionA, "project");
  await page
    .getByRole("textbox", { name: "Board name", exact: true })
    .fill("Explorations");
  await page.getByRole("button", { name: "New board", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Board", exact: true }),
  ).toContainText("Explorations");
  const board = await page
    .getByRole("combobox", { name: "Board", exact: true })
    .inputValue();
  expect(board).toMatch(/^board:/);
  await page.getByRole("button", { name: "Hide chat", exact: true }).click();
  await expect(page.locator("[data-chat-column]")).toBeHidden();
  const workspace = await page.getByTestId("canvas-workspace").boundingBox();
  expect(workspace?.width).toBeGreaterThan(1000);
  await page.screenshot({ path: testInfo.outputPath("project-desktop.png") });
  await page.setViewportSize({ width: 608, height: 600 });
  await expect(
    page.getByRole("button", { name: "Show chat", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("project-narrow.png") });
  await page.getByRole("button", { name: "Show chat", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Chat message input" }),
  ).toBeVisible();
  await page.reload();
  await open(page, sessionB, "project");
  await expect(
    page.getByRole("combobox", { name: "Board", exact: true }),
  ).toContainText("Explorations");
  await page
    .getByRole("combobox", { name: "Board", exact: true })
    .selectOption(board);
  await expect(page.getByTestId("canvas-editor")).toHaveAttribute(
    "data-canvas-board-id",
    board,
  );
});

test("typed agent actions bind arrows, arrange groups and undo logical operations", async ({
  page,
}) => {
  await open(page);
  const ids: string[] = [];
  for (let index = 0; index < 3; index++) {
    const result = await command(page, {
      action: "add",
      session_id: sessionA,
      kind: "rectangle",
      x: index * 350,
      y: index * 60,
      text: `Direction ${index + 1}`,
    });
    ids.push(result.shape_id);
  }
  await command(page, {
    action: "connect",
    session_id: sessionA,
    from_shape_id: ids[0],
    to_shape_id: ids[1],
    text: "Explore",
  });
  expect(
    (await context(page)).shapes.some(
      (shape: { type: string }) => shape.type === "arrow",
    ),
  ).toBe(true);
  const bindings = await page.evaluate(async () => {
    const path = "/src/features/canvas/runtime.ts";
    const { getMountedEditor } = await import(/* @vite-ignore */ path);
    return getMountedEditor()
      .store.allRecords()
      .filter((record: { typeName: string }) => record.typeName === "binding")
      .length;
  });
  expect(bindings).toBe(2);
  await command(page, {
    action: "align",
    session_id: sessionA,
    shape_ids: ids,
    alignment: "top",
  });
  await command(page, {
    action: "distribute",
    session_id: sessionA,
    shape_ids: ids,
    axis: "horizontal",
  });
  await command(page, {
    action: "group",
    session_id: sessionA,
    shape_ids: ids,
  });
  const group = (await context(page)).shapes.find(
    (shape: { type: string }) => shape.type === "group",
  );
  expect(group).toBeTruthy();
  await command(page, {
    action: "ungroup",
    session_id: sessionA,
    group_ids: [group.id],
  });
  expect(
    (await context(page)).shapes.some(
      (shape: { type: string }) => shape.type === "group",
    ),
  ).toBe(false);
  await command(page, {
    action: "delete",
    session_id: sessionA,
    confirm: true,
    shape_ids: ids,
  });
  expect(
    (await context(page)).shapes.filter(
      (shape: { type: string }) => shape.type === "rectangle",
    ),
  ).toHaveLength(0);
  await command(page, { action: "undo", session_id: sessionA, steps: 1 });
  expect(
    (await context(page)).shapes.filter(
      (shape: { type: string }) => shape.type === "rectangle",
    ),
  ).toHaveLength(3);
});

test("agent kit mode, task list, and prompt context persist with the board", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Canvas agent controls").click();
  await page.getByRole("button", { name: "reviewing" }).click();
  await page
    .getByRole("textbox", { name: "New canvas agent task" })
    .fill("Review visual hierarchy");
  await page.getByRole("button", { name: "Add canvas agent task" }).click();
  await page.getByRole("button", { name: "Area", exact: true }).click();
  await page.getByRole("button", { name: "Point", exact: true }).click();
  await expect(
    page.getByText("Review visual hierarchy", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/^Area \d+×\d+$/)).toBeVisible();
  await expect(page.getByText(/^Point -?\d+, -?\d+$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "reviewing" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.reload();
  await open(page);
  await page.getByLabel("Canvas agent controls").click();
  await expect(
    page.getByText("Review visual hierarchy", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/^Area \d+×\d+$/)).toBeVisible();
  await expect(page.getByText(/^Point -?\d+, -?\d+$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "reviewing" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "Review with agent" }),
  ).toBeVisible();
});

test("workflow kit creates connected nodes, executes data flow, and persists the graph", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Hide chat" }).click();
  await page.getByTestId("canvas-mode-workflow").click();
  await expect(page.locator(".NodeShape")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Slider" })).toBeVisible();

  const graph = await page.evaluate(async () => {
    const runtimePath = "/src/features/canvas/runtime.ts";
    const workflowPath = "/src/features/canvas/workflow/index.ts";
    const bindingPath =
      "/src/features/canvas/workflow/connection/ConnectionBindingUtil.tsx";
    const portsPath = "/src/features/canvas/workflow/nodes/nodePorts.tsx";
    const { getMountedEditor } = await import(/* @vite-ignore */ runtimePath);
    const { getNodeDefinitions } = await import(
      /* @vite-ignore */ workflowPath
    );
    const { createOrUpdateConnectionBinding } = await import(
      /* @vite-ignore */ bindingPath
    );
    const { getNodePorts } = await import(/* @vite-ignore */ portsPath);
    const editor = getMountedEditor();
    const add = editor
      .getCurrentPageShapes()
      .find(
        (shape: { type: string; props: { node?: { type?: string } } }) =>
          shape.type === "node" && shape.props.node?.type === "add",
      );
    const sliderId = `shape:workflow-slider-${Date.now()}`;
    const connectionId = `shape:workflow-connection-${Date.now()}`;
    editor.createShape({
      id: sliderId,
      type: "node",
      x: add.x - 420,
      y: add.y,
      props: { node: getNodeDefinitions(editor).slider.getDefault() },
    });
    editor.createShape({ id: connectionId, type: "connection" });
    const input = Object.values(getNodePorts(editor, add.id)).find(
      (port: { terminal: string }) => port.terminal === "end",
    );
    createOrUpdateConnectionBinding(editor, connectionId, sliderId, {
      portId: "output",
      terminal: "start",
    });
    createOrUpdateConnectionBinding(editor, connectionId, add.id, {
      portId: input.id,
      terminal: "end",
    });
    editor.zoomToFit({ animation: { duration: 0 } });
    return { addId: add.id, sliderId };
  });

  await expect(page.locator(".NodeShape")).toHaveCount(2);
  await page.getByRole("button", { name: "Run workflow" }).click();
  await expect
    .poll(() =>
      page.evaluate(async (addId) => {
        const path = "/src/features/canvas/runtime.ts";
        const { getMountedEditor } = await import(/* @vite-ignore */ path);
        return getMountedEditor().getShape(addId)?.props.node.lastResult;
      }, graph.addId),
    )
    .toBe(50);

  await page.reload();
  await open(page);
  await expect(page.getByTestId("canvas-mode-workflow")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".NodeShape")).toHaveCount(2);

  const portableGraph = await page.evaluate(async (sessionId) => {
    const dynamic = (path: string) => import(/* @vite-ignore */ path);
    const { exportCanvasBundle, importCanvasBundle } = await dynamic(
      "/src/features/canvas/portableBundles.ts",
    );
    const { getCanvasBoardIdentity } = await dynamic(
      "/src/features/canvas/canvasIdentity.ts",
    );
    const { getCanvasPersistenceDatabase } = await dynamic(
      "/src/features/canvas/persistence.ts",
    );
    const boardId = document
      .querySelector("[data-canvas-board-id]")
      ?.getAttribute("data-canvas-board-id");
    if (!boardId) throw new Error("Canvas board id is unavailable");
    const target = { scope: "chat" as const, sessionId };
    const identity = getCanvasBoardIdentity({ ...target, boardId });
    const bytes = await exportCanvasBundle({
      boards: [
        {
          boardId,
          name: "Workflow round trip",
          persistenceKey: identity.persistenceKey,
        },
      ],
    });
    const imported = await importCanvasBundle(target, bytes);
    const importedIdentity = getCanvasBoardIdentity({
      ...target,
      boardId: imported.boards[0].boardId,
    });
    const snapshot = await getCanvasPersistenceDatabase(
      importedIdentity.persistenceKey,
    ).readDocument();
    const records = Object.values(snapshot?.store ?? {}) as Array<{
      typeName: string;
      type?: string;
    }>;
    return {
      nodes: records.filter(
        (record) => record.typeName === "shape" && record.type === "node",
      ).length,
      connections: records.filter(
        (record) => record.typeName === "shape" && record.type === "connection",
      ).length,
      bindings: records.filter(
        (record) =>
          record.typeName === "binding" && record.type === "connection",
      ).length,
    };
  }, sessionA);
  expect(portableGraph).toEqual({ nodes: 2, connections: 1, bindings: 2 });
});

test("creative workflow places provider images as persistent assets (mock provider, real editor)", async ({
  page,
}) => {
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 80;
    canvas.height = 60;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ca6c48";
    ctx.fillRect(0, 0, 80, 60);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const init = buildInitScript({
    sessions: [
      {
        sessionId: sessionA,
        title: "Creative study",
        projectId,
        messageCount: 0,
      },
    ],
  }).replace(
    "switch (cmd) {",
    `switch (cmd) {
    case "get_canvas_generation_status": return Promise.resolve({configured:true,provider:"OpenAI",model:"gpt-image-2",supportsReferences:true});
    case "generate_canvas_images": window.__generationRequest = args.request; return new Promise(resolve => { const complete = () => resolve({model:"gpt-image-2",images:Array.from({length:args.request.count},()=>({data:${JSON.stringify(png)},mimeType:"image/png"}))}); if(window.__holdGeneration) window.__finishGeneration = complete; else complete(); });`,
  );
  await page.addInitScript({ content: init });
  await page.reload();
  await open(page);
  await command(page, {
    action: "image",
    session_id: sessionA,
    src: `data:image/png;base64,${png}`,
    mime_type: "image/png",
    name: "Reference.png",
    x: 0,
    y: 0,
    width: 80,
    height: 60,
  });
  await page.getByTestId("creative-workflow").locator("summary").click();
  await page
    .getByRole("textbox", { name: "Creative brief", exact: true })
    .fill(
      "A terracotta poster inspired by the selected reference, bold typography and warm natural light.",
    );
  await page
    .getByRole("button", { name: "Generate variations", exact: true })
    .click();
  await expect(page.getByTestId("creative-workflow")).toContainText(
    "Saved 2 generated variations",
  );
  const request = await page.evaluate(
    () =>
      (
        window as unknown as {
          __generationRequest: {
            prompt: string;
            references: unknown[];
            count: number;
          };
        }
      ).__generationRequest,
  );
  expect(request.references).toHaveLength(1);
  expect(request.count).toBe(2);
  expect(request.prompt).toContain("terracotta");
  expect(
    (await context(page)).shapes.filter(
      (shape: { type: string }) => shape.type === "image",
    ),
  ).toHaveLength(3);
  await page.reload();
  await open(page);
  await expect.poll(async () => (await context(page)).shapeCount).toBe(3);
  await expect
    .poll(() =>
      page
        .locator("img.tl-image")
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  await page.getByTestId("creative-workflow").locator("summary").click();
  await expect(
    page.getByRole("textbox", { name: "Creative brief", exact: true }),
  ).toHaveValue(/terracotta/);
  await page.evaluate(() => {
    (window as unknown as { __holdGeneration: boolean }).__holdGeneration =
      true;
  });
  await page
    .getByRole("button", { name: "Generate variations", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          typeof (window as unknown as { __finishGeneration?: () => void })
            .__finishGeneration,
      ),
    )
    .toBe("function");
  await page.getByRole("button", { name: "New board", exact: true }).click();
  await expect
    .poll(async () =>
      page.getByRole("combobox", { name: "Board", exact: true }).inputValue(),
    )
    .not.toBe(`chat:${sessionA}`);
  await page.evaluate(() =>
    (
      window as unknown as { __finishGeneration: () => void }
    ).__finishGeneration(),
  );
  await expect(
    page.getByText(/Saved 2 generated variations to the original canvas board/),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Board", exact: true })
    .selectOption(`chat:${sessionA}`);
  await expect.poll(async () => (await context(page)).shapeCount).toBe(5);
});
