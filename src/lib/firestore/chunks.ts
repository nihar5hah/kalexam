import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { getFirebaseDb } from "@/lib/firebase";
import { ParsedSourceChunk } from "@/lib/parsing/types";
import { StudySourceType } from "@/lib/firestore/sources";

export type IndexedChunk = ParsedSourceChunk & {
  sourceId: string;
};

type IndexedChunkStored = IndexedChunk & {
  _v?: number;
};

type IndexedChunkMeta = {
  activeVersion?: number;
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

function indexedChunkCollection(uid: string, strategyId: string) {
  const db = getFirebaseDb();
  return collection(db, "users", uid, "strategies", strategyId, "indexedChunks");
}

function indexedChunkMetaRef(uid: string, strategyId: string) {
  const db = getFirebaseDb();
  return doc(db, "users", uid, "strategies", strategyId, "indexedChunksMeta", "current");
}

async function getActiveChunkVersion(uid: string, strategyId: string): Promise<number | undefined> {
  const metaSnapshot = await getDoc(indexedChunkMetaRef(uid, strategyId));
  if (!metaSnapshot.exists()) {
    return undefined;
  }

  const meta = metaSnapshot.data() as IndexedChunkMeta;
  return typeof meta.activeVersion === "number" ? meta.activeVersion : undefined;
}

async function setActiveChunkVersion(
  uid: string,
  strategyId: string,
  activeVersion: number,
  chunkCount: number,
): Promise<void> {
  await setDoc(
    indexedChunkMetaRef(uid, strategyId),
    {
      activeVersion,
      chunkCount,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
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
  if (!chunks.length) {
    return;
  }

  const db = getFirebaseDb();
  const chunkCollection = indexedChunkCollection(uid, strategyId);
  const activeVersion = await getActiveChunkVersion(uid, strategyId);
  const nextVersion = (activeVersion ?? 0) + 1;

  const BATCH_LIMIT = 400;
  for (let index = 0; index < chunks.length; index += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const slice = chunks.slice(index, index + BATCH_LIMIT);
    for (const chunk of slice) {
      batch.set(doc(chunkCollection), { ...chunk, _v: nextVersion } satisfies IndexedChunkStored);
    }
    await batch.commit();
  }

  await setActiveChunkVersion(uid, strategyId, nextVersion, chunks.length);

  const existing = await getDocs(chunkCollection);
  const oldRefs = existing.docs.filter((item) => {
    const data = item.data() as IndexedChunkStored;
    return data._v !== nextVersion;
  });

  for (let index = 0; index < oldRefs.length; index += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const slice = oldRefs.slice(index, index + BATCH_LIMIT);
    for (const item of slice) {
      batch.delete(item.ref);
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

  const activeVersion = await getActiveChunkVersion(uid, strategyId);
  const chunkCollection = indexedChunkCollection(uid, strategyId);
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
    .map((item) => item.data() as IndexedChunkStored)
    .filter((chunk) => {
      const versionMatches =
        typeof activeVersion === "number"
          ? chunk._v === activeVersion
          : typeof chunk._v !== "number";
      return versionMatches && enabledSourceIds.has(chunk.sourceId);
    })
    .map((chunk) => ({
      sourceId: chunk.sourceId,
      text: chunk.text,
      sourceType: chunk.sourceType,
      sourceName: chunk.sourceName,
      sourceYear: chunk.sourceYear,
      section: chunk.section,
    }));

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
  const activeVersion = await getActiveChunkVersion(uid, strategyId);
  const chunkCollection = indexedChunkCollection(uid, strategyId);
  const BATCH_LIMIT = 400;
  for (let index = 0; index < chunks.length; index += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const slice = chunks.slice(index, index + BATCH_LIMIT);
    for (const chunk of slice) {
      if (typeof activeVersion === "number") {
        batch.set(doc(chunkCollection), { ...chunk, _v: activeVersion } satisfies IndexedChunkStored);
      } else {
        batch.set(doc(chunkCollection), chunk);
      }
    }
    await batch.commit();
  }
}
