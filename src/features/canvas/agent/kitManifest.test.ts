import { describe, expect, it } from "vitest";

import { ALL_TOOL_GROUPS } from "@/features/berdctl/commands/registry";
import {
  TLDRAW_AGENT_ACTION_IMPLEMENTATION,
  TLDRAW_AGENT_ACTIONS,
  TLDRAW_AGENT_KIT_VERSION,
  TLDRAW_AGENT_PROMPT_PART_IMPLEMENTATION,
  TLDRAW_AGENT_PROMPT_PARTS,
} from "./kitManifest";

describe("complete tldraw Agent starter kit mapping", () => {
  it("pins and maps every v5.4.2 default action and prompt part", () => {
    expect(TLDRAW_AGENT_KIT_VERSION).toBe("5.4.2");
    expect(Object.keys(TLDRAW_AGENT_ACTION_IMPLEMENTATION).sort()).toEqual(
      [...TLDRAW_AGENT_ACTIONS].sort(),
    );
    expect(Object.keys(TLDRAW_AGENT_PROMPT_PART_IMPLEMENTATION).sort()).toEqual(
      [...TLDRAW_AGENT_PROMPT_PARTS].sort(),
    );
    expect(
      Object.values(TLDRAW_AGENT_ACTION_IMPLEMENTATION).every(Boolean),
    ).toBe(true);
    expect(
      Object.values(TLDRAW_AGENT_PROMPT_PART_IMPLEMENTATION).every(Boolean),
    ).toBe(true);
  });

  it("exposes every canvas command used by the action mapping", () => {
    expect(Object.keys(ALL_TOOL_GROUPS.canvas.actions)).toEqual(
      expect.arrayContaining([
        "add",
        "line",
        "arrow",
        "draw",
        "update",
        "delete",
        "place",
        "move",
        "reorder",
        "rotate",
        "resize",
        "align",
        "distribute",
        "stack",
        "clear",
        "viewport",
        "agent_state",
        "agent_context",
        "review",
        "add_detail",
        "country_info",
        "count",
      ]),
    );
  });
});
