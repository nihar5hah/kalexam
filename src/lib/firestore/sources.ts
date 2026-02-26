import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { getFirebaseDb } from "@/lib/firebase";

export type StudySourceType = "pdf" | "ppt" | "docx" | "text" | "url" | "youtube";
export type StudySourceStatus = "processing" | "indexed" | "error";

export type StudySourceRecord = {
  id: string;
  type: StudySourceType;
  title: string;
  status: StudySourceStatus;
  enabled: boolean;
  fileUrl?: string;
  youtubeUrl?: string;
  websiteUrl?: string;
  videoId?: string;
  aiGeneratedTranscript?: boolean;
  transcriptSource?: "captions" | "ai-reconstructed";
  videoLanguage?: "english" | "hindi" | "other";
  translatedToEnglish?: boolean;
  chunkCount: number;
  errorMessage?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type UpsertStudySourceInput = {
  id: string;
  type: StudySourceType;
  title: string;
  status: StudySourceStatus;
  enabled?: boolean;
  fileUrl?: string;
  youtubeUrl?: string;
  websiteUrl?: string;
  videoId?: string;
  aiGeneratedTranscript?: boolean;
  transcriptSource?: "captions" | "ai-reconstructed";
  videoLanguage?: "english" | "hindi" | "other";
  translatedToEnglish?: boolean;
  chunkCount?: number;
  errorMessage?: string;
};

function sourcesCollection(uid: string, strategyId: string) {
  const db = getFirebaseDb();
  return collection(db, "users", uid, "strategies", strategyId, "sources");
}

export async function upsertStudySource(
  uid: string,
  strategyId: string,
  source: UpsertStudySourceInput,
): Promise<void> {
  const db = getFirebaseDb();
  const sourceRef = doc(db, "users", uid, "strategies", strategyId, "sources", source.id);
  await setDoc(
    sourceRef,
    {
      type: source.type,
      title: source.title,
      status: source.status,
      enabled: source.enabled ?? true,
      fileUrl: source.fileUrl ?? null,
      youtubeUrl: source.youtubeUrl ?? null,
      websiteUrl: source.websiteUrl ?? null,
      videoId: source.videoId ?? null,
      aiGeneratedTranscript: source.aiGeneratedTranscript ?? false,
      transcriptSource: source.transcriptSource ?? null,
      videoLanguage: source.videoLanguage ?? null,
      translatedToEnglish: source.translatedToEnglish ?? false,
      chunkCount: source.chunkCount ?? 0,
      errorMessage: source.errorMessage ?? null,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function listStudySources(uid: string, strategyId: string): Promise<StudySourceRecord[]> {
  const snapshot = await getDocs(query(sourcesCollection(uid, strategyId), orderBy("createdAt", "asc")));
  return snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<StudySourceRecord, "id">) }));
}

export async function setStudySourceEnabled(
  uid: string,
  strategyId: string,
  sourceId: string,
  enabled: boolean,
): Promise<void> {
  const db = getFirebaseDb();
  const sourceRef = doc(db, "users", uid, "strategies", strategyId, "sources", sourceId);
  await updateDoc(sourceRef, {
    enabled,
    updatedAt: serverTimestamp(),
  });
}

export async function updateStudySourceChunkCount(
  uid: string,
  strategyId: string,
  sourceId: string,
  chunkCount: number,
): Promise<void> {
  const db = getFirebaseDb();
  const sourceRef = doc(db, "users", uid, "strategies", strategyId, "sources", sourceId);
  await updateDoc(sourceRef, {
    chunkCount,
    status: chunkCount > 0 ? "indexed" : "error",
    updatedAt: serverTimestamp(),
  });
}

export async function removeStudySource(uid: string, strategyId: string, sourceId: string): Promise<void> {
  const db = getFirebaseDb();
  const sourceRef = doc(db, "users", uid, "strategies", strategyId, "sources", sourceId);
  await deleteDoc(sourceRef);

  const chunksRef = collection(db, "users", uid, "strategies", strategyId, "indexedChunks");
  const chunksSnapshot = await getDocs(chunksRef);
  await Promise.all(
    chunksSnapshot.docs
      .filter((item) => (item.data() as { sourceId?: string }).sourceId === sourceId)
      .map((item) => deleteDoc(item.ref)),
  );
}
