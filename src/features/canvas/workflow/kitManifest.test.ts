import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  TLDRAW_WORKFLOW_KIT_VERSION,
  TLDRAW_WORKFLOW_NODE_TYPES,
  TLDRAW_WORKFLOW_SHELL_REPLACEMENTS,
  TLDRAW_WORKFLOW_SOURCE_MODULES,
} from "./kitManifest";

const workflowDirectory = resolve(
  process.cwd(),
  "src/features/canvas/workflow",
);

describe("complete tldraw Workflow starter kit mapping", () => {
  it("keeps every v5.4.2 functional source module and host shell replacement", () => {
    expect(TLDRAW_WORKFLOW_KIT_VERSION).toBe("5.4.2");
    for (const module of TLDRAW_WORKFLOW_SOURCE_MODULES) {
      expect(existsSync(resolve(workflowDirectory, module)), module).toBe(true);
    }
    expect(Object.keys(TLDRAW_WORKFLOW_SHELL_REPLACEMENTS)).toEqual([
      "App.tsx",
      "index.css",
      "main.tsx",
    ]);
    expect(existsSync(resolve(workflowDirectory, "WorkflowMode.tsx"))).toBe(
      true,
    );
    expect(existsSync(resolve(workflowDirectory, "workflow.css"))).toBe(true);
    expect(
      existsSync(resolve(workflowDirectory, "../CanvasWorkspace.tsx")),
    ).toBe(true);
  });

  it("registers every starter node type", () => {
    const source = readFileSync(
      resolve(workflowDirectory, "nodes/nodeTypes.tsx"),
      "utf8",
    );
    for (const nodeType of TLDRAW_WORKFLOW_NODE_TYPES) {
      expect(source, nodeType).toContain(`${nodeType}:`);
    }
  });
});
