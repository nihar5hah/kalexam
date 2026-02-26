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
import {
  isFallbackLikeChatPayload,
  isFallbackLikeLearnPayload,
  isFallbackLikeTopicPayload,
} from "@/lib/study/fallback-detection";

/**
 * Recursively replaces every `undefined` value with `null` so that Firestore
 * never rejects the payload with "Unsupported field value: undefined".
 */
function sanitizeForFirestore<T>(value: T): T {
  if (value === undefined) return null as unknown as T;
  if (value === null) return value;
  if (Array.isArray(value)) return value.map(sanitizeForFirestore) as unknown as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeForFirestore(v);
    }
    return out as T;
  }
  return value;
}

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
      usedVideoContext?: boolean;
      citations: Array<{
        sourceType: string;
        sourceName: string;
        sourceYear?: string;
        importanceLevel: string;
      }>;
    }
  >;
  studyAnswerCache: Record<
    string,
    {
      signature: string;
      schemaVersion: string;
      generatedAt: string;
      model: string;
      item: string;
      answer: {
        conceptExplanation: string;
        example: string;
        examTip: string;
        typicalExamQuestion: string;
        fullAnswer: string;
        confidence: "high" | "medium" | "low";
        citations: Array<{
          sourceType: string;
          sourceName: string;
          sourceYear?: string;
          importanceLevel: string;
        }>;
      };
    }
  >;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  progress: {
    completedTopics: number;
    totalTopics: number;
    percentage: number;
  };
  readinessScore: number;
  examReadinessTimeline: Array<{
    timestamp: string;
    score: number;
  }>;
  dashboardMetrics?: {
    todaysFocusTopic?: string | null;
    weakestTopic?: string | null;
    weakestChapter?: string | null;
    estimatedHoursRemaining: number;
    suggestedStudyPath: string[];
  };
  examDate?: string | null;
  topicProgress: Record<
    string,
    {
      status: "not_started" | "learning" | "completed";
      timeSpent: number;
      confidence: number;
      revisitCount: number;
      skippedCount: number;
      lastInteraction?: Timestamp;
      completedAt?: Timestamp;
    }
  >;
  lastOpenedAt?: Timestamp;
  deletedAt?: Timestamp;
  aiTelemetry?: {
    events: Array<{
      timestamp: string;
      taskType: string;
      modelUsed: string;
      latencyMs: number;
      cacheHit: boolean;
      fallbackTriggered: boolean;
      fallbackReason?: string;
      usedVideoContext?: boolean;
    }>;
    summary?: {
      totalCalls: number;
      cacheHits: number;
      fallbackCalls: number;
      averageLatencyMs: number;
    };
  };
};

export type AiTelemetryEvent = {
  taskType: string;
  modelUsed: string;
  latencyMs: number;
  cacheHit: boolean;
  fallbackTriggered: boolean;
  fallbackReason?: string;
  usedVideoContext?: boolean;
};

type CreateStudySessionInput = {
  userId: string;
  strategyId: string;
  subjectName: string;
  syllabusFiles: UploadedFile[];
  materialFiles: UploadedFile[];
  generatedStrategy: StrategyResult;
  examDate?: string | null;
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
      confidence: 0,
      revisitCount: 0,
      skippedCount: 0,
    };
    return accumulator;
  }, {});
}

function clamp(num: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, num));
}

function computeReadiness(topicProgress: StudySession["topicProgress"], totalTopics: number): number {
  const entries = Object.values(topicProgress);
  if (!entries.length || totalTopics <= 0) {
    return 0;
  }

  const completed = entries.filter((entry) => entry.status === "completed").length;
  const confidenceAvg = Math.round(
    entries.reduce((sum, entry) => sum + (entry.confidence ?? 0), 0) / entries.length,
  );
  const skippedPenalty = entries.reduce((sum, entry) => sum + (entry.skippedCount ?? 0), 0) * 2;
  const completionComponent = Math.round((completed / totalTopics) * 70);
  const confidenceComponent = Math.round((confidenceAvg / 100) * 30);

  return clamp(completionComponent + confidenceComponent - skippedPenalty, 0, 100);
}

function computeDashboardMetrics(
  strategy: StrategyResult,
  topicProgress: StudySession["topicProgress"],
): NonNullable<StudySession["dashboardMetrics"]> {
  const topics = strategy.topics;
  const byWeakness = [...topics]
    .map((topic) => {
      const progress = topicProgress[topic.slug];
      const confidence = progress?.confidence ?? 0;
      const revisit = progress?.revisitCount ?? 0;
      const skipped = progress?.skippedCount ?? 0;
      const likelihood = topic.examLikelihoodScore ?? 0;
      const score = likelihood + (100 - confidence) + revisit * 6 + skipped * 8;
      return { topic, score };
    })
    .sort((a, b) => b.score - a.score);

  const weakest = byWeakness[0]?.topic;
  const todaysFocus = byWeakness.find((item) => (topicProgress[item.topic.slug]?.status ?? "not_started") !== "completed")?.topic;

  const weakestChapter = strategy.chapters
    .map((chapter) => {
      const chapterConfidence = chapter.topics.reduce((sum, chapterTopic) => {
        const confidence = topicProgress[chapterTopic.slug]?.confidence ?? 0;
        return sum + confidence;
      }, 0);
      const avgConfidence = chapter.topics.length ? chapterConfidence / chapter.topics.length : 0;
      return { title: chapter.chapterTitle, avgConfidence };
    })
    .sort((a, b) => a.avgConfidence - b.avgConfidence)[0]?.title;

  const incomplete = topics.filter((topic) => (topicProgress[topic.slug]?.status ?? "not_started") !== "completed");
  const estimatedHoursRemaining = Math.max(0, Math.round(incomplete.length * 0.75));

  return {
    todaysFocusTopic: todaysFocus?.title ?? null,
    weakestTopic: weakest?.title ?? null,
    weakestChapter: weakestChapter ?? null,
    estimatedHoursRemaining,
    suggestedStudyPath: incomplete.slice(0, 4).map((topic) => topic.title),
  };
}

function buildReadinessTimeline(
  current: StudySession["examReadinessTimeline"] | undefined,
  score: number,
): StudySession["examReadinessTimeline"] {
  const next = [...(current ?? []), { timestamp: new Date().toISOString(), score }];
  return next.slice(-30);
}

export async function createStudySession(input: CreateStudySessionInput): Promise<string> {
  const db = getFirebaseDb();
  const initialTopicProgress = toInitialTopicProgress(input.generatedStrategy);
  const initialReadiness = computeReadiness(initialTopicProgress, input.generatedStrategy.topics.length);
  const sessionRef = await addDoc(collection(db, "users", input.userId, "studySessions"), {
    userId: input.userId,
    strategyId: input.strategyId,
    subjectName: input.subjectName,
    syllabusFiles: input.syllabusFiles,
    materialFiles: input.materialFiles,
    generatedStrategy: input.generatedStrategy,
    studyContent: {},
    chatCache: {},
    studyAnswerCache: {},
    progress: toProgress(input.generatedStrategy),
    readinessScore: initialReadiness,
    examReadinessTimeline: [{ timestamp: new Date().toISOString(), score: initialReadiness }],
    dashboardMetrics: computeDashboardMetrics(input.generatedStrategy, initialTopicProgress),
    examDate: input.examDate ?? null,
    topicProgress: initialTopicProgress,
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

export async function getStudySessionByStrategyId(userId: string, strategyId: string): Promise<{ id: string; data: StudySession } | null> {
  const db = getFirebaseDb();
  const sessionsRef = collection(db, "users", userId, "studySessions");
  const sessionQuery = query(sessionsRef, where("strategyId", "==", strategyId), limit(1));
  const snapshot = await getDocs(sessionQuery);
  const docSnap = snapshot.docs[0];
  if (!docSnap) {
    return null;
  }

  return {
    id: docSnap.id,
    data: docSnap.data() as StudySession,
  };
}

export async function markTopicLearningInSession(userId: string, strategyId: string, topicSlug: string) {
  const sessionRef = await getSessionRefByStrategyId(userId, strategyId);
  if (!sessionRef) {
    return;
  }

  const sessionDoc = await getDoc(sessionRef);
  const data = sessionDoc.data() as StudySession | undefined;
  if (!data) {
    return;
  }

  const topicProgress = (data.topicProgress ?? {}) as StudySession["topicProgress"];
  const existing = topicProgress[topicSlug];
  const nextRevisitCount = (existing?.revisitCount ?? 0) + (existing?.lastInteraction ? 1 : 0);
  const nextTopicProgress: StudySession["topicProgress"] = {
    ...topicProgress,
    [topicSlug]: {
      status: existing?.status === "completed" ? "completed" : "learning",
      timeSpent: existing?.timeSpent ?? 0,
      confidence: existing?.confidence ?? 0,
      revisitCount: nextRevisitCount,
      skippedCount: existing?.skippedCount ?? 0,
    },
  };

  const totalTopics = data.progress.totalTopics || data.generatedStrategy.topics.length || 0;
  const readiness = computeReadiness(nextTopicProgress, totalTopics);
  const timeline = buildReadinessTimeline(data.examReadinessTimeline, readiness);
  const dashboardMetrics = computeDashboardMetrics(data.generatedStrategy, nextTopicProgress);

  await updateDoc(sessionRef, {
    [`topicProgress.${topicSlug}.status`]: existing?.status === "completed" ? "completed" : "learning",
    [`topicProgress.${topicSlug}.revisitCount`]: nextRevisitCount,
    [`topicProgress.${topicSlug}.lastInteraction`]: serverTimestamp(),
    lastOpenedAt: serverTimestamp(),
    readinessScore: readiness,
    examReadinessTimeline: timeline,
    dashboardMetrics: sanitizeForFirestore(dashboardMetrics),
    updatedAt: serverTimestamp(),
  });
}

export async function markTopicSkippedInSession(userId: string, strategyId: string, topicSlug: string) {
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
  const existing = topicProgress[topicSlug] ?? {
    status: "not_started" as const,
    timeSpent: 0,
    confidence: 0,
    revisitCount: 0,
    skippedCount: 0,
  };

  const nextTopicProgress: StudySession["topicProgress"] = {
    ...topicProgress,
    [topicSlug]: {
      ...existing,
      skippedCount: (existing.skippedCount ?? 0) + 1,
    },
  };

  const totalTopics = data.progress.totalTopics || data.generatedStrategy.topics.length || 0;
  const readiness = computeReadiness(nextTopicProgress, totalTopics);
  const timeline = buildReadinessTimeline(data.examReadinessTimeline, readiness);

  await updateDoc(sessionRef, {
    [`topicProgress.${topicSlug}.skippedCount`]: (existing.skippedCount ?? 0) + 1,
    [`topicProgress.${topicSlug}.lastInteraction`]: serverTimestamp(),
    readinessScore: readiness,
    examReadinessTimeline: timeline,
    dashboardMetrics: sanitizeForFirestore(computeDashboardMetrics(data.generatedStrategy, nextTopicProgress)),
    updatedAt: serverTimestamp(),
  });
}

export async function markTopicCompletedInSession(
  userId: string,
  strategyId: string,
  topicSlug: string,
  learningDurationSeconds = 0,
  confidence = 75,
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
      confidence,
      revisitCount: current?.revisitCount ?? 0,
      skippedCount: current?.skippedCount ?? 0,
    },
  };

  const totalTopics = data.progress.totalTopics || data.generatedStrategy.topics.length || 0;
  const completedTopics = Object.values(nextTopicProgress).filter((entry) => entry.status === "completed").length;
  const percentage = totalTopics ? Math.round((completedTopics / totalTopics) * 100) : 0;
  const readiness = computeReadiness(nextTopicProgress, totalTopics);
  const timeline = buildReadinessTimeline(data.examReadinessTimeline, readiness);

  await updateDoc(sessionRef, {
    [`topicProgress.${topicSlug}.status`]: "completed",
    [`topicProgress.${topicSlug}.timeSpent`]: nextTimeSpent,
    [`topicProgress.${topicSlug}.confidence`]: confidence,
    [`topicProgress.${topicSlug}.completedAt`]: serverTimestamp(),
    [`topicProgress.${topicSlug}.lastInteraction`]: serverTimestamp(),
    lastOpenedAt: serverTimestamp(),
    "progress.completedTopics": completedTopics,
    "progress.totalTopics": totalTopics,
    "progress.percentage": percentage,
    readinessScore: readiness,
    examReadinessTimeline: timeline,
    dashboardMetrics: sanitizeForFirestore(computeDashboardMetrics(data.generatedStrategy, nextTopicProgress)),
    updatedAt: serverTimestamp(),
  });
}

export async function recordQuizAttemptInSession(
  userId: string,
  strategyId: string,
  topicSlug: string,
  payload: {
    score: number;
    durationSeconds?: number;
  },
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
  const existing = topicProgress[topicSlug] ?? {
    status: "not_started" as const,
    timeSpent: 0,
    confidence: 0,
    revisitCount: 0,
    skippedCount: 0,
  };

  const nextConfidence = clamp(Math.round(((existing.confidence ?? 0) * 0.6) + (payload.score * 0.4)), 0, 100);
  const nextTimeSpent = existing.timeSpent + Math.max(0, Math.round(payload.durationSeconds ?? 0));
  const nextStatus = existing.status === "completed" ? "completed" : "learning";

  const nextTopicProgress: StudySession["topicProgress"] = {
    ...topicProgress,
    [topicSlug]: {
      ...existing,
      status: nextStatus,
      confidence: nextConfidence,
      timeSpent: nextTimeSpent,
    },
  };

  const totalTopics = data.progress.totalTopics || data.generatedStrategy.topics.length || 0;
  const readiness = computeReadiness(nextTopicProgress, totalTopics);
  const timeline = buildReadinessTimeline(data.examReadinessTimeline, readiness);

  await updateDoc(sessionRef, {
    [`topicProgress.${topicSlug}.status`]: nextStatus,
    [`topicProgress.${topicSlug}.confidence`]: nextConfidence,
    [`topicProgress.${topicSlug}.timeSpent`]: nextTimeSpent,
    [`topicProgress.${topicSlug}.lastInteraction`]: serverTimestamp(),
    readinessScore: readiness,
    examReadinessTimeline: timeline,
    dashboardMetrics: sanitizeForFirestore(computeDashboardMetrics(data.generatedStrategy, nextTopicProgress)),
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
  if (isFallbackLikeTopicPayload(payload.content)) {
    return;
  }

  const sessionRef = await getSessionRefByStrategyId(userId, strategyId);
  if (!sessionRef) {
    return;
  }

  await updateDoc(sessionRef, {
    [`studyContent.${topicSlug}`]: sanitizeForFirestore({
      signature: payload.signature,
      schemaVersion: payload.schemaVersion,
      generatedAt: new Date().toISOString(),
      model: payload.model,
      content: payload.content,
    }),
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
    usedVideoContext: entry.usedVideoContext,
    citations: entry.citations,
    model: entry.model,
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
    usedVideoContext?: boolean;
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
    [`chatCache.${key}`]: sanitizeForFirestore({
      signature: payload.signature,
      schemaVersion: payload.schemaVersion,
      generatedAt: new Date().toISOString(),
      model: payload.model,
      answer: payload.answer,
      confidence: payload.confidence,
      usedVideoContext: payload.usedVideoContext ?? false,
      citations: payload.citations,
    }),
    updatedAt: serverTimestamp(),
  });
}

export async function getStudyAnswerCacheFromSession(
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
  const entry = data?.studyAnswerCache?.[key];

  if (!entry) {
    return null;
  }

  if (entry.signature !== signature || entry.schemaVersion !== schemaVersion) {
    return null;
  }

  return {
    ...entry.answer,
    model: entry.model,
  };
}

export async function saveStudyAnswerCacheToSession(
  userId: string,
  strategyId: string,
  cacheKey: string,
  payload: {
    signature: string;
    schemaVersion: string;
    model: string;
    item: string;
    answer: {
      conceptExplanation: string;
      example: string;
      examTip: string;
      typicalExamQuestion: string;
      fullAnswer: string;
      confidence: "high" | "medium" | "low";
      citations: Array<{
        sourceType: string;
        sourceName: string;
        sourceYear?: string;
        importanceLevel: string;
      }>;
    };
  },
) {
  if (isFallbackLikeChatPayload({ answer: payload.answer })) {
    return;
  }

  if (isFallbackLikeLearnPayload(payload.answer)) {
    return;
  }

  const sessionRef = await getSessionRefByStrategyId(userId, strategyId);
  if (!sessionRef) {
    return;
  }

  const key = normalizeCacheKey(cacheKey);
  await updateDoc(sessionRef, {
    [`studyAnswerCache.${key}`]: sanitizeForFirestore({
      signature: payload.signature,
      schemaVersion: payload.schemaVersion,
      generatedAt: new Date().toISOString(),
      model: payload.model,
      item: payload.item,
      answer: payload.answer,
    }),
    updatedAt: serverTimestamp(),
  });
}

export async function recordAiTelemetryInSession(
  userId: string,
  strategyId: string,
  event: AiTelemetryEvent,
) {
  const sessionRef = await getSessionRefByStrategyId(userId, strategyId);
  if (!sessionRef) {
    return;
  }

  const sessionDoc = await getDoc(sessionRef);
  const data = sessionDoc.data() as StudySession | undefined;
  const existingEvents = data?.aiTelemetry?.events ?? [];

  const nextEvents = [
    ...existingEvents,
    {
      timestamp: new Date().toISOString(),
      taskType: event.taskType,
      modelUsed: event.modelUsed,
      latencyMs: Math.max(0, Math.round(event.latencyMs)),
      cacheHit: Boolean(event.cacheHit),
      fallbackTriggered: Boolean(event.fallbackTriggered),
      fallbackReason: event.fallbackReason,
      usedVideoContext: event.usedVideoContext,
    },
  ].slice(-150);

  const totalCalls = nextEvents.length;
  const cacheHits = nextEvents.filter((item) => item.cacheHit).length;
  const fallbackCalls = nextEvents.filter((item) => item.fallbackTriggered).length;
  const averageLatencyMs = totalCalls
    ? Math.round(nextEvents.reduce((sum, item) => sum + (item.latencyMs || 0), 0) / totalCalls)
    : 0;

  await updateDoc(sessionRef, {
    aiTelemetry: sanitizeForFirestore({
      events: nextEvents,
      summary: {
        totalCalls,
        cacheHits,
        fallbackCalls,
        averageLatencyMs,
      },
    }),
    updatedAt: serverTimestamp(),
  });
}
