import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
} from "firebase/firestore";

import { getFirebaseDb } from "@/lib/firebase";
import { ParsedSourceChunk } from "@/lib/parsing/types";
import { StudySourceType } from "@/lib/firestore/sources";

export type IndexedChunk = ParsedSourceChunk & {
  sourceId: string;
};

export type IndexedChunkBundle = {
  chunks: IndexedChunk[];
  sourceTypeMap: Map<string, StudySourceType>;
  enabledSourceIds: Set<string>;
  enabledSourceTitleToId: Map<string, string>;
};

export type EnabledSourceBundle = {
  enabledSourceIds: Set<string>;
  enabledSourceTitleToId: Map<string, string>;
  sourceTypeMap: Map<string, StudySourceType>;
};

function normalizeSourceTitle(value: string): string {
  return value.trim().toLowerCase();
}

function getEnabledSourceIds(
  sources: Array<{ id: string; enabled?: boolean }>,
): Set<string> {
  return new Set(
    sources
      .filter((source) => source.enabled !== false)
      .map((source) => source.id),
  );
}

export async function replaceIndexedChunks(
  uid: string,
  strategyId: string,
  chunks: IndexedChunk[],
): Promise<void> {
  const db = getFirebaseDb();
  const chunkCollection = collection(db, "users", uid, "strategies", strategyId, "indexedChunks");
  const existing = await getDocs(chunkCollection);

  const operations: Array<{ type: "delete"; ref: (typeof existing.docs)[number]["ref"] } | { type: "set"; data: IndexedChunk }> = [
    ...existing.docs.map((item) => ({ type: "delete" as const, ref: item.ref })),
    ...chunks.map((chunk) => ({ type: "set" as const, data: chunk })),
  ];

  const BATCH_LIMIT = 400;
  for (let index = 0; index < operations.length; index += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const slice = operations.slice(index, index + BATCH_LIMIT);
    for (const operation of slice) {
      if (operation.type === "delete") {
        batch.delete(operation.ref);
      } else {
        batch.set(doc(chunkCollection), operation.data);
      }
    }
    await batch.commit();
  }
}

export async function getIndexedChunks(
  uid: string,
  strategyId: string,
): Promise<IndexedChunkBundle> {
  const db = getFirebaseDb();
  const sourceCollection = collection(db, "users", uid, "strategies", strategyId, "sources");
  const sourcesSnapshot = await getDocs(sourceCollection);

  const sourceTypeMap = new Map<string, StudySourceType>();
  const enabledSourceTitleToId = new Map<string, string>();
  const sourceRecords: Array<{ id: string; enabled?: boolean }> = [];
  sourcesSnapshot.docs.forEach((item) => {
    const data = item.data() as { enabled?: boolean; type?: StudySourceType; title?: string };
    sourceRecords.push({ id: item.id, enabled: data.enabled });
    sourceTypeMap.set(item.id, data.type ?? "text");
    if (data.enabled !== false && data.title?.trim()) {
      enabledSourceTitleToId.set(normalizeSourceTitle(data.title), item.id);
    }
  });

  const enabledSourceIds = getEnabledSourceIds(sourceRecords);

  if (!enabledSourceIds.size) {
    return {
      chunks: [],
      sourceTypeMap,
      enabledSourceIds,
      enabledSourceTitleToId,
    };
  }

  const chunkCollection = collection(db, "users", uid, "strategies", strategyId, "indexedChunks");
  const chunkSnapshots = [];
  const enabledIdsList = [...enabledSourceIds];
  const FIRESTORE_IN_LIMIT = 10;
  for (let index = 0; index < enabledIdsList.length; index += FIRESTORE_IN_LIMIT) {
    const batchIds = enabledIdsList.slice(index, index + FIRESTORE_IN_LIMIT);
    chunkSnapshots.push(getDocs(query(chunkCollection, where("sourceId", "in", batchIds))));
  }

  const chunkResults = await Promise.all(chunkSnapshots);

  const chunks = chunkResults
    .flatMap((snapshot) => snapshot.docs)
    .map((item) => item.data() as IndexedChunk)
    .filter((chunk) => enabledSourceIds.has(chunk.sourceId));

  return {
    chunks,
    sourceTypeMap,
    enabledSourceIds,
    enabledSourceTitleToId,
  };
}

export async function getEnabledSourceBundle(
  uid: string,
  strategyId: string,
): Promise<EnabledSourceBundle> {
  const db = getFirebaseDb();
  const sourceCollection = collection(db, "users", uid, "strategies", strategyId, "sources");
  const sourcesSnapshot = await getDocs(sourceCollection);

  const sourceTypeMap = new Map<string, StudySourceType>();
  const enabledSourceIds = new Set<string>();
  const enabledSourceTitleToId = new Map<string, string>();

  sourcesSnapshot.docs.forEach((item) => {
    const data = item.data() as { enabled?: boolean; type?: StudySourceType; title?: string };
    sourceTypeMap.set(item.id, data.type ?? "text");
    if (data.enabled !== false) {
      enabledSourceIds.add(item.id);
      if (data.title?.trim()) {
        enabledSourceTitleToId.set(normalizeSourceTitle(data.title), item.id);
      }
    }
  });

  return {
    enabledSourceIds,
    enabledSourceTitleToId,
    sourceTypeMap,
  };
}

export async function appendIndexedChunks(
  uid: string,
  strategyId: string,
  chunks: IndexedChunk[],
): Promise<void> {
  if (!chunks.length) {
    return;
  }

  const db = getFirebaseDb();
  const chunkCollection = collection(db, "users", uid, "strategies", strategyId, "indexedChunks");
  const BATCH_LIMIT = 400;
  for (let index = 0; index < chunks.length; index += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const slice = chunks.slice(index, index + BATCH_LIMIT);
    for (const chunk of slice) {
      batch.set(doc(chunkCollection), chunk);
    }
    await batch.commit();
  }
}
