/**
 * Server-side (Admin SDK) versions of indexed-chunk readers.
 *
 * These bypass Firestore security rules and are safe to call from
 * Next.js API routes where the client SDK has no auth context.
 */

import { getAdminFirestore } from "@/lib/firebase-admin";
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

export async function getIndexedChunksAdmin(
  uid: string,
  strategyId: string,
): Promise<IndexedChunkBundle> {
  const db = getAdminFirestore();
  const sourcesRef = db
    .collection("users")
    .doc(uid)
    .collection("strategies")
    .doc(strategyId)
    .collection("sources");

  const sourcesSnapshot = await sourcesRef.get();

  const sourceTypeMap = new Map<string, StudySourceType>();
  const enabledSourceTitleToId = new Map<string, string>();
  const enabledSourceIds = new Set<string>();

  sourcesSnapshot.docs.forEach((item) => {
    const data = item.data() as {
      enabled?: boolean;
      type?: StudySourceType;
      title?: string;
    };
    sourceTypeMap.set(item.id, data.type ?? "text");
    if (data.enabled !== false) {
      enabledSourceIds.add(item.id);
      if (data.title?.trim()) {
        enabledSourceTitleToId.set(normalizeSourceTitle(data.title), item.id);
      }
    }
  });

  if (!enabledSourceIds.size) {
    return {
      chunks: [],
      sourceTypeMap,
      enabledSourceIds,
      enabledSourceTitleToId,
    };
  }

  const chunksRef = db
    .collection("users")
    .doc(uid)
    .collection("strategies")
    .doc(strategyId)
    .collection("indexedChunks");

  // Firestore `in` queries support max 30 items per query (Admin SDK)
  const FIRESTORE_IN_LIMIT = 30;
  const enabledIdsList = [...enabledSourceIds];
  const chunkPromises: Promise<FirebaseFirestore.QuerySnapshot>[] = [];

  for (let index = 0; index < enabledIdsList.length; index += FIRESTORE_IN_LIMIT) {
    const batchIds = enabledIdsList.slice(index, index + FIRESTORE_IN_LIMIT);
    chunkPromises.push(chunksRef.where("sourceId", "in", batchIds).get());
  }

  const chunkResults = await Promise.all(chunkPromises);

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

export async function getEnabledSourceBundleAdmin(
  uid: string,
  strategyId: string,
): Promise<EnabledSourceBundle> {
  const db = getAdminFirestore();
  const sourcesRef = db
    .collection("users")
    .doc(uid)
    .collection("strategies")
    .doc(strategyId)
    .collection("sources");

  const sourcesSnapshot = await sourcesRef.get();

  const sourceTypeMap = new Map<string, StudySourceType>();
  const enabledSourceIds = new Set<string>();
  const enabledSourceTitleToId = new Map<string, string>();

  sourcesSnapshot.docs.forEach((item) => {
    const data = item.data() as {
      enabled?: boolean;
      type?: StudySourceType;
      title?: string;
    };
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
