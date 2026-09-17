/**
 * Source-level inventory for tldraw's Workflow starter kit at v5.4.2.
 *
 * Berd supplies its own application shell and persistent Tldraw instance, so
 * the upstream App/main entrypoints are represented by CanvasWorkspace and
 * WorkflowMode. Every functional starter module remains colocated here.
 */
export const TLDRAW_WORKFLOW_KIT_VERSION = "5.4.2" as const;

export const TLDRAW_WORKFLOW_SOURCE_MODULES = [
  "components/MathematicalToolbarItem.tsx",
  "components/OnCanvasComponentPicker.tsx",
  "components/WorkflowRegions.tsx",
  "components/WorkflowToolbar.tsx",
  "components/icons/AddIcon.tsx",
  "components/icons/ConditionalIcon.tsx",
  "components/icons/DivideIcon.tsx",
  "components/icons/EarthquakeIcon.tsx",
  "components/icons/MathematicalIcon.tsx",
  "components/icons/MultiplyIcon.tsx",
  "components/icons/PlayIcon.tsx",
  "components/icons/SliderIcon.tsx",
  "components/icons/StopIcon.tsx",
  "components/icons/SubtractIcon.tsx",
  "connection/ConnectionBindingUtil.tsx",
  "connection/ConnectionCenterHandleOverlayUtil.tsx",
  "connection/ConnectionShapeUtil.tsx",
  "connection/insertNodeWithinConnection.tsx",
  "connection/keepConnectionsAtBottom.tsx",
  "constants.tsx",
  "disableTransparency.tsx",
  "execution/ExecutionGraph.tsx",
  "execution/executionState.ts",
  "hooks/useDragToCreate.ts",
  "nodes/NodeShapeUtil.tsx",
  "nodes/nodePorts.tsx",
  "nodes/nodeTypes.tsx",
  "nodes/types/AddNode.tsx",
  "nodes/types/ConditionalNode.tsx",
  "nodes/types/DivideNode.tsx",
  "nodes/types/EarthquakeNode.tsx",
  "nodes/types/MultiplyNode.tsx",
  "nodes/types/SliderNode.tsx",
  "nodes/types/SubtractNode.tsx",
  "nodes/types/shared.tsx",
  "ports/PointingPort.tsx",
  "ports/Port.tsx",
  "ports/getPortAtPoint.tsx",
  "ports/portState.ts",
  "utils/sleep.ts",
  "utils.ts",
] as const;

export const TLDRAW_WORKFLOW_SHELL_REPLACEMENTS = {
  "App.tsx": "WorkflowMode.tsx and ../CanvasWorkspace.tsx",
  "index.css": "workflow.css",
  "main.tsx": "../CanvasWorkspace.tsx",
} as const;

export const TLDRAW_WORKFLOW_NODE_TYPES = [
  "add",
  "subtract",
  "multiply",
  "divide",
  "conditional",
  "slider",
  "earthquake",
] as const;
