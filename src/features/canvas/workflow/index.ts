import type { Editor, TldrawOptions } from "tldraw";
import { OnCanvasComponentPicker } from "./components/OnCanvasComponentPicker";
import { WorkflowRegions } from "./components/WorkflowRegions";
import { overrides, WorkflowToolbar } from "./components/WorkflowToolbar";
import { ConnectionBindingUtil } from "./connection/ConnectionBindingUtil";
import { ConnectionCenterHandleOverlayUtil } from "./connection/ConnectionCenterHandleOverlayUtil";
import { ConnectionShapeUtil } from "./connection/ConnectionShapeUtil";
import { keepConnectionsAtBottom } from "./connection/keepConnectionsAtBottom";
import { disableTransparency } from "./disableTransparency";
import { NodeShapeUtil } from "./nodes/NodeShapeUtil";
import { PointingPort } from "./ports/PointingPort";

export const workflowShapeUtils = [NodeShapeUtil, ConnectionShapeUtil] as const;
export const workflowBindingUtils = [ConnectionBindingUtil] as const;
export const workflowOverlayUtils = [
  ConnectionCenterHandleOverlayUtil,
] as const;
export const workflowOverrides = overrides;
export const workflowOptions: Partial<TldrawOptions> = {
  actionShortcutsLocation: "menu",
  maxPages: 1,
};

const mountedEditors = new WeakSet<Editor>();
export function mountWorkflowEditor(editor: Editor) {
  if (mountedEditors.has(editor)) return;
  mountedEditors.add(editor);
  editor.user.updateUserPreferences({ isSnapMode: true });
  editor.getStateDescendant("select")?.addChild(PointingPort);
  keepConnectionsAtBottom(editor);
  disableTransparency(editor, ["node", "connection"]);
}

export { createNodeShape } from "./components/WorkflowToolbar";
export { startExecution, stopExecution } from "./execution/executionState";
export { getNodeDefinitions } from "./nodes/nodeTypes";
export { OnCanvasComponentPicker, WorkflowRegions, WorkflowToolbar };
