/**
 * Complete default surface of tldraw's Agent starter kit at v5.4.2.
 *
 * The starter's model worker and chat shell are intentionally supplied by
 * Berd's ACP session. This manifest records the host-native implementation of
 * every default prompt part and action so upgrades cannot silently narrow the
 * integration.
 */
export const TLDRAW_AGENT_KIT_VERSION = "5.4.2" as const;

export const TLDRAW_AGENT_ACTIONS = [
  "message",
  "think",
  "review",
  "add-detail",
  "update-todo-list",
  "setMyView",
  "create",
  "delete",
  "update",
  "label",
  "move",
  "place",
  "bringToFront",
  "sendToBack",
  "rotate",
  "resize",
  "align",
  "distribute",
  "stack",
  "clear",
  "pen",
  "countryInfo",
  "count",
  "unknown",
] as const;

export const TLDRAW_AGENT_PROMPT_PARTS = [
  "mode",
  "debug",
  "modelName",
  "messages",
  "data",
  "contextItems",
  "screenshot",
  "userViewportBounds",
  "agentViewportBounds",
  "blurryShapes",
  "peripheralShapes",
  "selectedShapes",
  "chatHistory",
  "userActionHistory",
  "todoList",
  "canvasLints",
  "time",
] as const;

export const TLDRAW_AGENT_ACTION_IMPLEMENTATION = {
  message: "Berd ACP streamed assistant messages",
  think: "Berd ACP streamed thinking",
  review: "berdctl canvas review",
  "add-detail": "berdctl canvas add-detail",
  "update-todo-list": "berdctl canvas agent-state",
  setMyView: "berdctl canvas viewport",
  create: "berdctl canvas add, line, arrow, and draw",
  delete: "berdctl canvas delete",
  update: "berdctl canvas update",
  label: "berdctl canvas update --text",
  move: "berdctl canvas move or update --x/--y",
  place: "berdctl canvas place",
  bringToFront: "berdctl canvas reorder --position front",
  sendToBack: "berdctl canvas reorder --position back",
  rotate: "berdctl canvas rotate",
  resize: "berdctl canvas resize",
  align: "berdctl canvas align",
  distribute: "berdctl canvas distribute",
  stack: "berdctl canvas stack",
  clear: "berdctl canvas clear",
  pen: "berdctl canvas draw",
  countryInfo: "berdctl canvas country-info",
  count: "berdctl canvas count",
  unknown: "berdctl schema validation and unknown-action rejection",
} as const satisfies Record<(typeof TLDRAW_AGENT_ACTIONS)[number], string>;

export const TLDRAW_AGENT_PROMPT_PART_IMPLEMENTATION = {
  mode: "persistent canvas agent state",
  debug: "Berd session diagnostics",
  modelName: "Berd ACP execution target",
  messages: "Berd ACP user and agent messages",
  data: "berdctl results and scheduled follow-up context",
  contextItems: "persistent shape, area, and point context",
  screenshot: "canvas image attachment",
  userViewportBounds: "canvas attachment viewport",
  agentViewportBounds: "berdctl canvas viewport and review bounds",
  blurryShapes: "bounded visible-shape summaries",
  peripheralShapes: "bounded offscreen shape clusters",
  selectedShapes: "focused selected-shape summaries",
  chatHistory: "Berd ACP transcript",
  userActionHistory: "bounded recent canvas record changes",
  todoList: "persistent canvas agent todos",
  canvasLints: "canvas overflow, overlap, and arrow lints",
  time: "localized timestamp and IANA time zone in canvas context",
} as const satisfies Record<(typeof TLDRAW_AGENT_PROMPT_PARTS)[number], string>;
