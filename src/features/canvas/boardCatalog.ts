import {
  getCanvasBoardIdentity,
  type CanvasBoardTarget,
  type CanvasScope,
} from "./canvasIdentity";

export interface CanvasBoardSummary {
  boardId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface CanvasBoardCatalog {
  version: 1;
  scope: CanvasScope;
  sessionId: string;
  projectId: string | null;
  boards: CanvasBoardSummary[];
}

const DB_NAME = "berd-canvas-board-catalog:v1";
const STORE = "catalogs";
const DEFAULT_NAME = "Main board";

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

let database: Promise<IDBDatabase> | undefined;
const catalogLocks = new Map<string, Promise<void>>();
async function withCatalogLock<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(`berd-catalog:${key}`, operation);
  }
  const previous = catalogLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  catalogLocks.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (catalogLocks.get(key) === current) catalogLocks.delete(key);
  }
}
function openDatabase() {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}

function catalogKey(target: CanvasBoardTarget) {
  const identity = getCanvasBoardIdentity({ ...target, boardId: null });
  return identity.scope === "project"
    ? `project:${identity.projectId}`
    : `chat:${identity.sessionId}`;
}

function defaultBoard(target: CanvasBoardTarget): CanvasBoardSummary {
  const identity = getCanvasBoardIdentity({ ...target, boardId: null });
  const now = new Date().toISOString();
  return {
    boardId: identity.boardId,
    name: DEFAULT_NAME,
    createdAt: now,
    updatedAt: now,
  };
}

export async function loadCanvasBoardCatalog(
  target: CanvasBoardTarget,
): Promise<CanvasBoardCatalog> {
  const identity = getCanvasBoardIdentity({ ...target, boardId: null });
  const db = await openDatabase();
  const transaction = db.transaction(STORE, "readonly");
  const stored = await requestResult<CanvasBoardCatalog | undefined>(
    transaction.objectStore(STORE).get(catalogKey(target)),
  );
  await transactionDone(transaction);
  if (stored) {
    validateCanvasBoardCatalog(stored, target);
    return stored;
  }
  const catalog: CanvasBoardCatalog = {
    version: 1,
    scope: identity.scope,
    sessionId: identity.sessionId,
    projectId: identity.projectId,
    boards: [defaultBoard(target)],
  };
  return catalog;
}

export async function saveCanvasBoardCatalog(
  target: CanvasBoardTarget,
  catalog: CanvasBoardCatalog,
) {
  validateCanvasBoardCatalog(catalog, target);
  const db = await openDatabase();
  const transaction = db.transaction(STORE, "readwrite");
  transaction.objectStore(STORE).put(catalog, catalogKey(target));
  await transactionDone(transaction);
}

export async function createCanvasBoard(
  target: CanvasBoardTarget,
  name = "Untitled board",
) {
  return withCatalogLock(catalogKey(target), async () => {
    const catalog = await loadCanvasBoardCatalog(target);
    const now = new Date().toISOString();
    const board: CanvasBoardSummary = {
      boardId: `board:${crypto.randomUUID()}`,
      name: name.trim().slice(0, 120) || "Untitled board",
      createdAt: now,
      updatedAt: now,
    };
    catalog.boards.push(board);
    await saveCanvasBoardCatalog(target, catalog);
    return board;
  });
}

export async function renameCanvasBoard(
  target: CanvasBoardTarget,
  boardId: string,
  name: string,
) {
  return withCatalogLock(catalogKey(target), async () => {
    const catalog = await loadCanvasBoardCatalog(target);
    const board = catalog.boards.find((item) => item.boardId === boardId);
    if (!board) throw new Error("Board not found");
    const normalized = name.trim().slice(0, 120);
    if (!normalized) throw new Error("Board name is required");
    board.name = normalized;
    board.updatedAt = new Date().toISOString();
    await saveCanvasBoardCatalog(target, catalog);
    return board;
  });
}

export async function deleteCanvasBoard(
  target: CanvasBoardTarget,
  boardId: string,
) {
  return mutateCanvasBoardCatalog(target, (catalog) => {
    const identity = getCanvasBoardIdentity({ ...target, boardId: null });
    if (boardId === identity.boardId)
      throw new Error("The default board cannot be deleted");
    const index = catalog.boards.findIndex(
      (board) => board.boardId === boardId,
    );
    if (index < 0) throw new Error("Board not found");
    catalog.boards.splice(index, 1);
  });
}

export function validateCanvasBoardCatalog(
  catalog: unknown,
  target?: CanvasBoardTarget,
): asserts catalog is CanvasBoardCatalog {
  if (!catalog || typeof catalog !== "object")
    throw new Error("Invalid board catalog");
  const value = catalog as Partial<CanvasBoardCatalog>;
  if (
    value.version !== 1 ||
    !Array.isArray(value.boards) ||
    !["chat", "project"].includes(value.scope ?? "") ||
    typeof value.sessionId !== "string"
  )
    throw new Error("Invalid board catalog schema");
  if (
    target &&
    (value.scope !== target.scope ||
      (target.scope === "chat" &&
        value.sessionId !== target.sessionId.trim()) ||
      value.projectId !== (target.projectId?.trim() || null))
  ) {
    throw new Error("Board catalog scope does not match target");
  }
  const ids = new Set<string>();
  for (const board of value.boards) {
    if (
      !board ||
      typeof board !== "object" ||
      typeof board.boardId !== "string" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._:%-]{0,127}$/.test(board.boardId) ||
      ids.has(board.boardId)
    )
      throw new Error("Invalid or duplicate board id");
    if (
      typeof board.name !== "string" ||
      !board.name.trim() ||
      board.name.length > 120
    )
      throw new Error("Invalid board name");
    if (
      typeof board.createdAt !== "string" ||
      typeof board.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(board.createdAt)) ||
      !Number.isFinite(Date.parse(board.updatedAt))
    )
      throw new Error("Invalid board timestamps");
    ids.add(board.boardId);
  }
  if (
    value.boards.length === 0 ||
    (target &&
      !ids.has(getCanvasBoardIdentity({ ...target, boardId: null }).boardId))
  )
    throw new Error("Board catalog must contain a default board");
}

/** Serializes read/modify/write operations across application windows. */
export async function mutateCanvasBoardCatalog<T>(
  target: CanvasBoardTarget,
  operation: (catalog: CanvasBoardCatalog) => T | Promise<T>,
): Promise<T> {
  return withCatalogLock(catalogKey(target), async () => {
    const catalog = await loadCanvasBoardCatalog(target);
    const result = await operation(catalog);
    await saveCanvasBoardCatalog(target, catalog);
    return result;
  });
}
