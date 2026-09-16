export type CanvasScope = "chat" | "project";

export interface CanvasBoardTarget {
  sessionId: string;
  projectId?: string | null;
  scope: CanvasScope;
}

export interface CanvasBoardIdentity {
  boardId: string;
  persistenceKey: string;
  scope: CanvasScope;
  sessionId: string;
  projectId: string | null;
}

const BOARD_ID_VERSION = "v1";

function requireIdentifier(value: string | null | undefined, field: string) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${field} is required`);
  }
  return normalized;
}

function encodeIdentifier(value: string) {
  return encodeURIComponent(value);
}

export function getCanvasBoardIdentity(
  target: CanvasBoardTarget,
): CanvasBoardIdentity {
  const sessionId = requireIdentifier(target.sessionId, "sessionId");
  const projectId = target.projectId?.trim() || null;

  if (target.scope === "project" && !projectId) {
    throw new Error("projectId is required for a project canvas");
  }

  const owner =
    target.scope === "project"
      ? `project:${encodeIdentifier(projectId as string)}`
      : `chat:${encodeIdentifier(sessionId)}`;
  const boardId = `${target.scope}:${owner.slice(owner.indexOf(":") + 1)}`;

  return {
    boardId,
    persistenceKey: `berd-canvas:${BOARD_ID_VERSION}:${owner}`,
    scope: target.scope,
    sessionId,
    projectId,
  };
}
