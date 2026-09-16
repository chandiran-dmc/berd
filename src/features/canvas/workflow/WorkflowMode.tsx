import { createContext, useContext, type ReactNode } from "react";
import { DefaultToolbar, type TLComponents } from "tldraw";
import { OnCanvasComponentPicker, WorkflowRegions, WorkflowToolbar } from ".";

const WorkflowModeContext = createContext(false);

export function WorkflowModeProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return (
    <WorkflowModeContext.Provider value={enabled}>
      {children}
    </WorkflowModeContext.Provider>
  );
}

function WorkflowOverlays() {
  if (!useContext(WorkflowModeContext)) return null;
  return (
    <>
      <OnCanvasComponentPicker />
      <WorkflowRegions />
    </>
  );
}

function ModeToolbar() {
  return useContext(WorkflowModeContext) ? (
    <WorkflowToolbar />
  ) : (
    <DefaultToolbar />
  );
}

export const workflowAwareComponents: TLComponents = {
  InFrontOfTheCanvas: WorkflowOverlays,
  Toolbar: ModeToolbar,
};
