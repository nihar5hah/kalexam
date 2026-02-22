import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { StrategyResult, UploadedFile } from "@/lib/ai/types";
import { getFirebaseDb } from "@/lib/firebase";

export type StudySession = {
  userId: string;
  strategyId: string;
  subjectName: string;
  syllabusFiles: UploadedFile[];
  materialFiles: UploadedFile[];
  generatedStrategy: StrategyResult;
  studyContent: Record<
    string,
    {
      signature: string;
      schemaVersion: string;
      generatedAt: string;
      model: string;
      content: unknown;
    }
  >;
  chatCache: Record<
    string,
    {
      signature: string;
      schemaVersion: string;
      generatedAt: string;
      model: string;
      answer: string;
      confidence: "high" | "medium" | "low";
      citations: Array<{
        sourceType: string;
        sourceName: string;
        sourceYear?: string;
        importanceLevel: string;
      }>;
    }
  >;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  progress: {
    completedTopics: number;
    totalTopics: number;
    percentage: number;
  };
  topicProgress: Record<
    string,
    {
      status: "not_started" | "learning" | "completed";
      timeSpent: number;
      lastOpened?: Timestamp;
      confidenceScore: number;
      completedAt?: Timestamp;
    }
  >;
  lastOpenedAt?: Timestamp;
  deletedAt?: Timestamp;
};

type CreateStudySessionInput = {
  userId: string;
  strategyId: string;
  subjectName: string;
  syllabusFiles: UploadedFile[];
  materialFiles: UploadedFile[];
  generatedStrategy: StrategyResult;
};

function toProgress(strategy: StrategyResult): StudySession["progress"] {
  const totalTopics = strategy.topics.length;
  return {
    completedTopics: 0,
    totalTopics,
    percentage: totalTopics ? 0 : 0,
  };
}

function toInitialTopicProgress(strategy: StrategyResult): StudySession["topicProgress"] {
  return strategy.topics.reduce<StudySession["topicProgress"]>((accumulator, topic) => {
    accumulator[topic.slug] = {
      status: "not_started",
      timeSpent: 0,
      confidenceScore: 0,
    };
    return accumulator;
  }, {});
}

export async function createStudySession(input: CreateStudySessionInput): Promise<string> {
  const db = getFirebaseDb();
  const sessionRef = await addDoc(collection(db, "users", input.userId, "studySessions"), {
    userId: input.userId,
    strategyId: input.strategyId,
    subjectName: input.subjectName,
    syllabusFiles: input.syllabusFiles,
    materialFiles: input.materialFiles,
    generatedStrategy: input.generatedStrategy,
    studyContent: {},
    chatCache: {},
    progress: toProgress(input.generatedStrategy),
    topicProgress: toInitialTopicProgress(input.generatedStrategy),
    lastOpenedAt: null,
    deletedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return sessionRef.id;
}

export async function listStudySessions(userId: string, maxItems = 20): Promise<Array<{ id: string; data: StudySession }>> {
  const db = getFirebaseDb();
  const sessionCollection = collection(db, "users", userId, "studySessions");
  const sessionsQuery = query(sessionCollection, orderBy("updatedAt", "desc"), limit(maxItems));

  const snapshot = await getDocs(sessionsQuery);
  return snapshot.docs
    .map((item) => ({
      id: item.id,
      data: item.data() as StudySession,
    }))
    .filter((item) => !item.data.deletedAt);
}

export async function renameStudySession(userId: string, sessionId: string, subjectName: string) {
  const db = getFirebaseDb();
  const sessionRef = doc(db, "users", userId, "studySessions", sessionId);
  await updateDoc(sessionRef, {
    subjectName,
    updatedAt: serverTimestamp(),
  });
}

export async function softDeleteStudySession(userId: string, sessionId: string) {
  const db = getFirebaseDb();
  const sessionRef = doc(db, "users", userId, "studySessions", sessionId);
  await updateDoc(sessionRef, {
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

async function getSessionRefByStrategyId(userId: string, strategyId: string) {
  const db = getFirebaseDb();
  const sessionsRef = collection(db, "users", userId, "studySessions");
  const sessionQuery = query(sessionsRef, where("strategyId", "==", strategyId), limit(1));
  const snapshot = await getDocs(sessionQuery);
  return snapshot.docs[0]?.ref ?? null;
}

export async function markTopicLearningInSession(userId: string, strategyId: string, topicSlug: string) {
  const sessionRef = await getSessionRefByStrategyId(userId, strategyId);
  if (!sessionRef) {
    return;
  }

  const sessionDoc = await getDoc(sessionRef);
  const topicProgress = (sessionDoc.data()?.topicProgress ?? {}) as StudySession["topicProgress"];
  const existing = topicProgress[topicSlug];

  await updateDoc(sessionRef, {
    [`topicProgress.${topicSlug}.status`]: existing?.status === "completed" ? "completed" : "learning",
    [`topicProgress.${topicSlug}.lastOpened`]: serverTimestamp(),
    lastOpenedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function markTopicCompletedInSession(
  userId: string,
  strategyId: string,
  topicSlug: string,
  learningDurationSeconds = 0,
  confidenceScore = 75,
) {
  const sessionRef = await getSessionRefByStrategyId(userId, strategyId);
  if (!sessionRef) {
    return;
  }

  const sessionDoc = await getDoc(sessionRef);
  const data = sessionDoc.data() as StudySession | undefined;
  if (!data) {
    return;
  }

  const topicProgress = data.topicProgress ?? {};
  const current = topicProgress[topicSlug];
  const nextTimeSpent = (current?.timeSpent ?? 0) + Math.max(0, Math.round(learningDurationSeconds));

  const nextTopicProgress: StudySession["topicProgress"] = {
    ...topicProgress,
    [topicSlug]: {
      status: "completed",
      timeSpent: nextTimeSpent,
      confidenceScore,
      lastOpened: current?.lastOpened,
    },
  };

  const totalTopics = data.progress.totalTopics || data.generatedStrategy.topics.length || 0;
  const completedTopics = Object.values(nextTopicProgress).filter((entry) => entry.status === "completed").length;
  const percentage = totalTopics ? Math.round((completedTopics / totalTopics) * 100) : 0;

  await updateDoc(sessionRef, {
    [`topicProgress.${topicSlug}.status`]: "completed",
    [`topicProgress.${topicSlug}.timeSpent`]: nextTimeSpent,
    [`topicProgress.${topicSlug}.confidenceScore`]: confidenceScore,
    [`topicProgress.${topicSlug}.completedAt`]: serverTimestamp(),
    [`topicProgress.${topicSlug}.lastOpened`]: serverTimestamp(),
    lastOpenedAt: serverTimestamp(),
    "progress.completedTopics": completedTopics,
    "progress.totalTopics": totalTopics,
    "progress.percentage": percentage,
    updatedAt: serverTimestamp(),
  });
}

export async function getTopicCacheFromSession(
  userId: string,
  strategyId: string,
  topicSlug: string,
  signature: string,
  schemaVersion: string,
) {
  const sessionRef = await getSessionRefByStrategyId(userId, strategyId);
  if (!sessionRef) {
    return null;
  }

  const sessionDoc = await getDoc(sessionRef);
  const data = sessionDoc.data() as StudySession | undefined;
  const entry = data?.studyContent?.[topicSlug];

  if (!entry) {
    return null;
  }

  if (entry.signature !== signature || entry.schemaVersion !== schemaVersion) {
    return null;
  }

  return entry.content;
}

export async function saveTopicCacheToSession(
  userId: string,
  strategyId: string,
  topicSlug: string,
  payload: {
    signature: string;
    schemaVersion: string;
    model: string;
    content: unknown;
  },
) {
  const sessionRef = await getSessionRefByStrategyId(userId, strategyId);
  if (!sessionRef) {
    return;
  }

  await updateDoc(sessionRef, {
    [`studyContent.${topicSlug}`]: {
      signature: payload.signature,
      schemaVersion: payload.schemaVersion,
      generatedAt: new Date().toISOString(),
      model: payload.model,
      content: payload.content,
    },
    updatedAt: serverTimestamp(),
  });
}

function normalizeCacheKey(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180);
}

export async function getChatCacheFromSession(
  userId: string,
  strategyId: string,
  cacheKey: string,
  signature: string,
  schemaVersion: string,
) {
  const sessionRef = await getSessionRefByStrategyId(userId, strategyId);
  if (!sessionRef) {
    return null;
  }

  const sessionDoc = await getDoc(sessionRef);
  const data = sessionDoc.data() as StudySession | undefined;
  const key = normalizeCacheKey(cacheKey);
  const entry = data?.chatCache?.[key];

  if (!entry) {
    return null;
  }

  if (entry.signature !== signature || entry.schemaVersion !== schemaVersion) {
    return null;
  }

  return {
    answer: entry.answer,
    confidence: entry.confidence,
    citations: entry.citations,
  };
}

export async function saveChatCacheToSession(
  userId: string,
  strategyId: string,
  cacheKey: string,
  payload: {
    signature: string;
    schemaVersion: string;
    model: string;
    answer: string;
    confidence: "high" | "medium" | "low";
    citations: Array<{
      sourceType: string;
      sourceName: string;
      sourceYear?: string;
      importanceLevel: string;
    }>;
  },
) {
  const sessionRef = await getSessionRefByStrategyId(userId, strategyId);
  if (!sessionRef) {
    return;
  }

  const key = normalizeCacheKey(cacheKey);

  await updateDoc(sessionRef, {
    [`chatCache.${key}`]: {
      signature: payload.signature,
      schemaVersion: payload.schemaVersion,
      generatedAt: new Date().toISOString(),
      model: payload.model,
      answer: payload.answer,
      confidence: payload.confidence,
      citations: payload.citations,
    },
    updatedAt: serverTimestamp(),
  });
}
