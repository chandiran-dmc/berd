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
  await expect(page.getByTestId("canvas-scope-project")).toBeEnabled();
  await expect(
    page.getByRole("textbox", { name: "Chat message input" }),
  ).toBeVisible();
  await page.getByTestId("canvas-scope-project").click();
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
    .poll(async () =>
      page
        .locator("img.tl-image")
        .first()
        .evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
        ),
    )
    .toBe(true);
});
