import { z } from "zod/v4";

import { canvasTargetFields } from "./canvasCommandHelpers";
import { resolveCanvasTarget } from "./canvasTarget";
import { defineCommand } from "../types";

const schema = z
  .object({
    ...canvasTargetFields,
    code: z
      .string()
      .trim()
      .regex(/^[a-zA-Z]{2,3}$/, "Use a two- or three-letter country code.")
      .describe("ISO 3166-1 alpha-2 or alpha-3 country code."),
  })
  .strict();

export const getCanvasCountryInfoCommand = defineCommand({
  effect: "read",
  visibility: "discoverable",
  destructive: false,
  summary: "Fetch the Agent starter kit country-data example",
  description:
    "Call the same REST Countries integration demonstrated by the complete Agent starter kit.",
  helpFooter: `Example:\n  berdctl canvas country-info --session-id <session-id> --code de\n\nResult:\n  {"country":{...}} — the REST Countries response is returned to the agent.`,
  schema,
  bridgeTimeoutMs: 20_000,
  execute: async (args, ctx) => {
    const target = await resolveCanvasTarget(args);
    if (ctx.deadlineMs !== undefined && Date.now() >= ctx.deadlineMs)
      throw new Error("Canvas command timed out before country lookup.");
    const response = await fetch(
      `https://restcountries.com/v3.1/alpha/${encodeURIComponent(args.code.toLowerCase())}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) {
      throw new Error(
        `Country API returned status ${response.status} ${response.statusText}`,
      );
    }
    const json: unknown = await response.json();
    const country = Array.isArray(json) ? json[0] : json;
    return { board_id: target.boardId, country };
  },
});
