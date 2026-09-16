import {
  createTLStore,
  defaultBindingUtils,
  defaultShapeUtils,
  loadSnapshot,
  type TLAssetId,
  type TLAssetStore,
  type TLStore,
  type TLStoreSnapshot,
  type TLRecord,
} from "tldraw";
import { workflowBindingUtils, workflowShapeUtils } from "./workflow";

const DOCUMENT_STORE = "document";
const ASSET_STORE = "assets";

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

class CanvasDatabase {
  private readonly database: Promise<IDBDatabase>;
  private readonly pendingWrites = new Set<Promise<void>>();

  constructor(persistenceKey: string) {
    this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open(`berd-canvas:v1:${persistenceKey}`, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(DOCUMENT_STORE);
        request.result.createObjectStore(ASSET_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async loadDocument(): Promise<TLStoreSnapshot | undefined> {
    await Promise.allSettled(this.pendingWrites);
    const database = await this.database;
    const transaction = database.transaction(DOCUMENT_STORE, "readonly");
    const snapshot = await requestResult<TLStoreSnapshot | undefined>(
      transaction.objectStore(DOCUMENT_STORE).get("current"),
    );
    await transactionDone(transaction);
    return snapshot;
  }

  saveDocument(snapshot: TLStoreSnapshot) {
    const write = (async () => {
      const database = await this.database;
      const transaction = database.transaction(DOCUMENT_STORE, "readwrite");
      transaction.objectStore(DOCUMENT_STORE).put(snapshot, "current");
      await transactionDone(transaction);
    })();
    this.pendingWrites.add(write);
    void write.then(
      () => this.pendingWrites.delete(write),
      () => this.pendingWrites.delete(write),
    );
    return write;
  }

  async storeAsset(assetId: string, file: File) {
    const database = await this.database;
    const transaction = database.transaction(ASSET_STORE, "readwrite");
    transaction.objectStore(ASSET_STORE).put(file, assetId);
    await transactionDone(transaction);
  }

  async loadAsset(assetId: string) {
    const database = await this.database;
    const transaction = database.transaction(ASSET_STORE, "readonly");
    const blob = await requestResult<Blob | undefined>(
      transaction.objectStore(ASSET_STORE).get(assetId),
    );
    await transactionDone(transaction);
    return blob ?? null;
  }

  async removeAssets(assetIds: string[]) {
    const database = await this.database;
    const transaction = database.transaction(ASSET_STORE, "readwrite");
    for (const assetId of assetIds) {
      transaction.objectStore(ASSET_STORE).delete(assetId);
    }
    await transactionDone(transaction);
  }

  async readAssets(assetIds: string[]) {
    const database = await this.database;
    const transaction = database.transaction(ASSET_STORE, "readonly");
    const values = await Promise.all(
      assetIds.map((id) =>
        requestResult<Blob | undefined>(
          transaction.objectStore(ASSET_STORE).get(id),
        ),
      ),
    );
    await transactionDone(transaction);
    return new Map(assetIds.map((id, index) => [id, values[index] ?? null]));
  }

  async readDocument() {
    return this.loadDocument();
  }

  async writeDocument(snapshot: TLStoreSnapshot) {
    return this.saveDocument(snapshot);
  }

  /** Keep the read/merge/write and new media in one IndexedDB transaction. */
  async updateDocumentAndAssets(
    update: (snapshot: TLStoreSnapshot | undefined) => TLStoreSnapshot,
    assets: Map<string, Blob>,
  ) {
    const database = await this.database;
    const transaction = database.transaction(
      [DOCUMENT_STORE, ASSET_STORE],
      "readwrite",
    );
    const done = transactionDone(transaction);
    let result: TLStoreSnapshot | undefined;
    let failure: unknown;
    const request = transaction.objectStore(DOCUMENT_STORE).get("current");
    request.onsuccess = () => {
      try {
        result = update(request.result);
        transaction.objectStore(DOCUMENT_STORE).put(result, "current");
        for (const [id, blob] of assets)
          transaction.objectStore(ASSET_STORE).put(blob, id);
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
    try {
      await done;
    } catch (error) {
      throw failure ?? error;
    }
    if (!result) throw new Error("Document update did not complete");
    return result;
  }

  async replaceDocumentAndAssets(
    snapshot: TLStoreSnapshot,
    assets: Map<string, Blob>,
  ) {
    const database = await this.database;
    const transaction = database.transaction(
      [DOCUMENT_STORE, ASSET_STORE],
      "readwrite",
    );
    const done = transactionDone(transaction);
    transaction.objectStore(DOCUMENT_STORE).put(snapshot, "current");
    for (const [id, blob] of assets)
      transaction.objectStore(ASSET_STORE).put(blob, id);
    await done;
  }

  async clear() {
    const database = await this.database;
    const transaction = database.transaction(
      [DOCUMENT_STORE, ASSET_STORE],
      "readwrite",
    );
    const done = transactionDone(transaction);
    transaction.objectStore(DOCUMENT_STORE).clear();
    transaction.objectStore(ASSET_STORE).clear();
    await done;
  }

  async deleteDocument() {
    const database = await this.database;
    const transaction = database.transaction(DOCUMENT_STORE, "readwrite");
    transaction.objectStore(DOCUMENT_STORE).delete("current");
    await transactionDone(transaction);
  }
}

const databases = new Map<string, CanvasDatabase>();

function getDatabase(persistenceKey: string) {
  let database = databases.get(persistenceKey);
  if (!database) {
    database = new CanvasDatabase(persistenceKey);
    databases.set(persistenceKey, database);
  }
  return database;
}

/** Low-level access used by the editable project bundle importer/exporter. */
export function getCanvasPersistenceDatabase(persistenceKey: string) {
  return getDatabase(persistenceKey);
}

export interface PersistentCanvasStore {
  store: TLStore;
  dispose: () => Promise<void>;
}

export async function loadPersistentCanvasStore(
  persistenceKey: string,
  onError: (error: unknown) => void,
): Promise<PersistentCanvasStore> {
  const database = getDatabase(persistenceKey);
  const snapshot = await database.loadDocument();
  const objectUrls = new Map<string, string>();
  const assets: TLAssetStore = {
    async upload(asset, file) {
      await database.storeAsset(asset.id, file);
      return { src: asset.id };
    },
    resolve(asset) {
      if (!asset.props.src?.startsWith("asset:")) return asset.props.src;
      const cached = objectUrls.get(asset.id);
      if (cached) return cached;
      return database.loadAsset(asset.id).then((blob) => {
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        objectUrls.set(asset.id, url);
        return url;
      });
    },
    remove(assetIds: TLAssetId[]) {
      return database.removeAssets(assetIds);
    },
  };
  const store = createTLStore({
    assets,
    snapshot,
    shapeUtils: [...defaultShapeUtils, ...workflowShapeUtils],
    bindingUtils: [...defaultBindingUtils, ...workflowBindingUtils],
  });
  const channel = new BroadcastChannel(`berd-canvas:${persistenceKey}`);
  channel.onmessage = (
    event: MessageEvent<
      | TLStoreSnapshot
      | { kind: "records"; records: TLRecord[]; excludeStoreId?: string }
    >,
  ) => {
    try {
      if ("kind" in event.data && event.data.kind === "records") {
        const message = event.data;
        if (message.excludeStoreId !== store.id)
          store.mergeRemoteChanges(() => store.put(message.records));
      } else {
        store.mergeRemoteChanges(() =>
          loadSnapshot(store, event.data as TLStoreSnapshot),
        );
      }
    } catch (error) {
      onError(error);
    }
  };
  const stopListening = store.listen(
    () => {
      const document = store.getStoreSnapshot("document");
      channel.postMessage(document);
      void database.saveDocument(document).catch(onError);
    },
    { source: "user", scope: "document" },
  );
  const flush = () => database.saveDocument(store.getStoreSnapshot("document"));
  const flushOnPageHide = () => void flush().catch(onError);
  window.addEventListener("pagehide", flushOnPageHide);
  if (!snapshot) await flush();

  return {
    store,
    async dispose() {
      stopListening();
      window.removeEventListener("pagehide", flushOnPageHide);
      channel.close();
      await flush();
      for (const url of objectUrls.values()) URL.revokeObjectURL(url);
      objectUrls.clear();
    },
  };
}

export function broadcastCanvasRecords(
  persistenceKey: string,
  records: TLRecord[],
  excludeStoreId?: string,
) {
  const channel = new BroadcastChannel(`berd-canvas:${persistenceKey}`);
  channel.postMessage({ kind: "records", records, excludeStoreId });
  channel.close();
}
