export type CanvasScope = "chat" | "project";

export interface CanvasBoardTarget {
  sessionId: string;
  projectId?: string | null;
  scope: CanvasScope;
  /** A catalog-owned board id. Omit for the stable default board. */
  boardId?: string | null;
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
  const requestedBoardIdRaw = target.boardId?.trim() || null;

  if (target.scope === "project" && !projectId) {
    throw new Error("projectId is required for a project canvas");
  }

  const owner =
    target.scope === "project"
      ? `project:${encodeIdentifier(projectId as string)}`
      : `chat:${encodeIdentifier(sessionId)}`;
  const defaultBoardId = `${target.scope}:${owner.slice(owner.indexOf(":") + 1)}`;
  const requestedBoardId =
    requestedBoardIdRaw === defaultBoardId ? null : requestedBoardIdRaw;
  const boardId = requestedBoardId ?? defaultBoardId;
  if (
    requestedBoardId &&
    !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(requestedBoardId)
  ) {
    throw new Error("boardId contains unsupported characters");
  }

  return {
    boardId,
    persistenceKey: requestedBoardId
      ? `berd-canvas:${BOARD_ID_VERSION}:${owner}:board:${encodeIdentifier(requestedBoardId)}`
      : `berd-canvas:${BOARD_ID_VERSION}:${owner}`,
    scope: target.scope,
    sessionId,
    projectId,
  };
}
