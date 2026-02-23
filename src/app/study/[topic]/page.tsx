"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";

import { AuthenticatedNavBar } from "@/components/AuthenticatedNavBar";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { RequireAuth } from "@/components/RequireAuth";
import { StrategyRecoveryView } from "@/components/StrategyRecoveryView";
import { AIInputWithLoading } from "@/components/ui/ai-input-with-loading";
import { AnimatedGlowingBorder } from "@/components/ui/animated-glowing-search-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TextShimmerWave } from "@/components/ui/text-shimmer-wave";
import { useAuth } from "@/components/AuthProvider";
import {
  SourceCitation,
  StrategyResult,
  StudyQuestionCard,
  StudyTopic,
  TopicConfidence,
  UploadedFile,
  normalizeStrategyResult,
} from "@/lib/ai/types";
import {
  getStrategyById,
  listRecentStrategies,
  markTopicCompleted,
  saveStudyTopicCache,
} from "@/lib/firestore/strategies";
import {
  getStudyAnswerCacheFromSession,
  getStudySessionByStrategyId,
  getChatCacheFromSession,
  markTopicCompletedInSession,
  markTopicLearningInSession,
  markTopicSkippedInSession,
  recordAiTelemetryInSession,
  recordQuizAttemptInSession,
  saveStudyAnswerCacheToSession,
  saveChatCacheToSession,
} from "@/lib/firestore/study-sessions";
import { FALLBACK_MESSAGE } from "@/lib/study/constants";

type StudyModelPayload =
  | {
      modelType: "gemini";
      modelConfig?: undefined;
    }
  | {
      modelType: "custom";
      modelConfig: {
        baseUrl: string;
        apiKey: string;
        modelName: string;
      };
    };

type TopicStudyApiResponse = {
  whatToLearn: string[];
  explanation: {
    concept: string;
    simpleExplanation: string;
    example: string;
    examTip: string;
  };
  keyDefinitions?: string[];
  differences?: Array<{
    conceptA: string;
    conceptB: string;
    definition: string;
    role: string;
    example: string;
    examImportance: string;
  }>;
  examplesFromMaterial?: string[];
  examTips?: string[];
  typicalExamQuestions?: StudyQuestionCard[];
  keyExamPoints: string[];
  confidence: TopicConfidence;
  estimatedTime: string;
  examLikelihoodScore?: number;
  examLikelihoodLabel?: "VERY LIKELY" | "HIGH" | "MEDIUM" | "LOW";
  sourceRefs?: SourceCitation[];
  materialCoverage?: number;
  lowMaterialConfidence?: boolean;
  routingMeta?: {
    taskType: string;
    modelUsed: string;
    fallbackTriggered: boolean;
    fallbackReason?: string;
    latencyMs: number;
  };
};

type TopicAskApiResponse = {
  answer: string;
  confidence: TopicConfidence;
  citations?: SourceCitation[];
  routingMeta?: {
    taskType: string;
    modelUsed: string;
    fallbackTriggered: boolean;
    fallbackReason?: string;
    latencyMs: number;
  };
};

type LearnItemApiResponse = {
  conceptExplanation: string;
  example: string;
  examTip: string;
  typicalExamQuestion: string;
  fullAnswer: string;
  confidence: TopicConfidence;
  citations: SourceCitation[];
  routingMeta?: {
    taskType: string;
    modelUsed: string;
    fallbackTriggered: boolean;
    fallbackReason?: string;
    latencyMs: number;
  };
};

type MicroQuizQuestion = {
  question: string;
  answer: string;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
};

type MicroQuizApiResponse = {
  questions: MicroQuizQuestion[];
  citations: SourceCitation[];
  routingMeta?: {
    taskType: string;
    modelUsed: string;
    fallbackTriggered: boolean;
    fallbackReason?: string;
    latencyMs: number;
  };
};

type ExamModeApiResponse = {
  likelyQuestions: Array<{
    question: string;
    expectedAnswer: string;
    difficulty: "easy" | "medium" | "hard";
    timeLimitMinutes: number;
  }>;
  readinessScore: number;
  confidence: TopicConfidence;
  weakAreas: string[];
  examTip: string;
  citations: SourceCitation[];
  routingMeta?: {
    taskType: string;
    modelUsed: string;
    fallbackTriggered: boolean;
    fallbackReason?: string;
    latencyMs: number;
  };
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  confidence?: TopicConfidence;
  citations?: SourceCitation[];
};

type QuickActionKey = "difference" | "example" | "examQuestion" | "explainSimply";

type QuickActionState = Record<
  QuickActionKey,
  {
    loading: boolean;
    content: string;
    confidence?: TopicConfidence;
  }
>;

type TopicSignal = {
  confidence: number;
  revisitCount: number;
  skippedCount: number;
};

const STUDY_CACHE_SCHEMA_VERSION = "v2";

function getModelCacheKey(payload: StudyModelPayload): string {
  if (payload.modelType === "custom") {
    return `custom:${payload.modelConfig.modelName || "custom-model"}`;
  }

  return "gemini";
}

function confidenceClass(confidence: TopicConfidence): string {
  if (confidence === "high") return "bg-emerald-500/20 text-emerald-300";
  if (confidence === "medium") return "bg-amber-500/20 text-amber-300";
  return "bg-red-500/20 text-red-300";
}

function getSessionModel(strategyId: string, fallbackModelType: "gemini" | "custom"): StudyModelPayload {
  if (fallbackModelType === "gemini") {
    return { modelType: "gemini" };
  }

  if (typeof window === "undefined") {
    return { modelType: "gemini" };
  }

  const raw = sessionStorage.getItem(`study-model:${strategyId}`);
  if (!raw) {
    return { modelType: "gemini" };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StudyModelPayload>;
    if (
      parsed.modelType === "custom" &&
      parsed.modelConfig?.baseUrl &&
      parsed.modelConfig.apiKey &&
      parsed.modelConfig.modelName
    ) {
      return {
        modelType: "custom",
        modelConfig: {
          baseUrl: parsed.modelConfig.baseUrl,
          apiKey: parsed.modelConfig.apiKey,
          modelName: parsed.modelConfig.modelName,
        },
      };
    }
  } catch {
    return { modelType: "gemini" };
  }

  return { modelType: "gemini" };
}

function formatExamTimeRemaining(examDate: string | null, fallbackHours: number | undefined): string {
  if (examDate) {
    const examAt = new Date(examDate).getTime();
    if (!Number.isNaN(examAt)) {
      const hours = Math.max(0, Math.round((examAt - Date.now()) / (1000 * 60 * 60)));
      if (hours <= 48) {
        return `${hours}h`;
      }
      return `${Math.round(hours / 24)}d`;
    }
  }

  if (typeof fallbackHours === "number" && Number.isFinite(fallbackHours)) {
    return `${Math.max(0, Math.round(fallbackHours))}h`;
  }

  return "unknown";
}

export default function StudyTopicPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
          <TextShimmerWave className="text-sm [--base-color:#a3a3a3] [--base-gradient-color:#ffffff]" duration={1}>
            Loading study mode...
          </TextShimmerWave>
        </div>
      }
    >
      <StudyTopicPageContent />
    </Suspense>
  );
}

function StudyTopicPageContent() {
  const params = useParams<{ topic: string }>();
  const searchParams = useSearchParams();
  const strategyId = searchParams.get("id");
  const topicSlug = decodeURIComponent(params.topic);
  const redirectTo = strategyId ? `/study/${topicSlug}?id=${strategyId}` : `/study/${topicSlug}`;

  return (
    <RequireAuth redirectTo={redirectTo}>
      <StudyTopicContent topicSlug={topicSlug} />
    </RequireAuth>
  );
}

function StudyTopicContent({ topicSlug }: { topicSlug: string }) {
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const strategyId = searchParams.get("id");

  const [strategy, setStrategy] = useState<StrategyResult | null>(null);
  const [topic, setTopic] = useState<StudyTopic | null>(null);
  const [studyData, setStudyData] = useState<TopicStudyApiResponse | null>(null);
  const [modelPayload, setModelPayload] = useState<StudyModelPayload>({ modelType: "gemini" });
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [recentStrategies, setRecentStrategies] = useState<Array<{ id: string; createdAt?: string; topicCount?: number; coverage?: string }>>([]);
  const [contextFiles, setContextFiles] = useState<UploadedFile[]>([]);
  const topicOpenedAtRef = useRef<number | null>(null);
  const [topicStatuses, setTopicStatuses] = useState<Record<string, boolean>>({});
  const [topicSignals, setTopicSignals] = useState<Record<string, TopicSignal>>({});
  const [sessionExamDate, setSessionExamDate] = useState<string | null>(null);

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [asking, setAsking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [quickActions, setQuickActions] = useState<QuickActionState>({
    difference: { loading: false, content: "" },
    example: { loading: false, content: "" },
    examQuestion: { loading: false, content: "" },
    explainSimply: { loading: false, content: "" },
  });
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const [expandedOriginalQuestions, setExpandedOriginalQuestions] = useState<Record<string, boolean>>({});
  const [learnedItems, setLearnedItems] = useState<Record<string, { loading: boolean; content?: LearnItemApiResponse; error?: string }>>({});
  const [microQuizzes, setMicroQuizzes] = useState<Record<string, { loading: boolean; questions?: MicroQuizQuestion[]; citations?: SourceCitation[]; error?: string; attempted?: boolean; score?: number }>>({});
  const [examMode, setExamMode] = useState<ExamModeApiResponse | null>(null);
  const [examModeLoading, setExamModeLoading] = useState(false);

  function mapRecentStrategies(items: Awaited<ReturnType<typeof listRecentStrategies>>) {
    return items.map((item) => {
      const created = item.data.createdAt?.toDate?.();
      return {
        id: item.id,
        createdAt: created ? created.toLocaleDateString() : undefined,
        topicCount: "topics" in item.data.strategy ? item.data.strategy.topics.length : undefined,
        coverage:
          "strategySummary" in item.data.strategy
            ? item.data.strategy.strategySummary.estimatedCoverage
            : item.data.strategy.estimatedCoverage,
      };
    });
  }

  useEffect(() => {
    async function load() {
      if (!user) {
        return;
      }

      if (!strategyId) {
        const recent = await listRecentStrategies(user.uid, 5);
        setRecentStrategies(mapRecentStrategies(recent));
        setRecoveryMessage("Study context is missing. Open a recent session or create a new one.");
        setLoading(false);
        return;
      }

      const stored = await getStrategyById(user.uid, strategyId);
      if (!stored) {
        const recent = await listRecentStrategies(user.uid, 5);
        setRecentStrategies(mapRecentStrategies(recent));
        setRecoveryMessage("This session could not be found. Open a recent session or create a new one.");
        setLoading(false);
        return;
      }

      const modelLabel = stored.modelType === "custom" ? "Custom Model" : "Gemini";
      const normalized = normalizeStrategyResult(stored.strategy, stored.hoursLeft, modelLabel);
      const selectedTopic = normalized.topics.find((item) => item.slug === topicSlug);

      if (!selectedTopic) {
        const recent = await listRecentStrategies(user.uid, 5);
        setRecentStrategies(mapRecentStrategies(recent));
        setRecoveryMessage("This topic is not available in the selected session.");
        setLoading(false);
        return;
      }

      const resolvedModel = getSessionModel(strategyId, stored.modelType);
      setModelPayload(resolvedModel);
      setStrategy(normalized);
      setTopic(selectedTopic);
      setCompleted(Boolean(stored.studyProgress?.[topicSlug]?.completed));
      setTopicStatuses(
        Object.entries(stored.studyProgress ?? {}).reduce<Record<string, boolean>>(
          (accumulator, [slug, progress]) => {
            accumulator[slug] = Boolean(progress.completed);
            return accumulator;
          },
          {},
        ),
      );
      setRecoveryMessage(null);

      const session = await getStudySessionByStrategyId(user.uid, strategyId);
      if (session) {
        const signals = Object.entries(session.data.topicProgress ?? {}).reduce<Record<string, TopicSignal>>(
          (accumulator, [slug, progress]) => {
            accumulator[slug] = {
              confidence: progress.confidence ?? 0,
              revisitCount: progress.revisitCount ?? 0,
              skippedCount: progress.skippedCount ?? 0,
            };
            return accumulator;
          },
          {},
        );
        setTopicSignals(signals);
        setSessionExamDate(session.data.examDate ?? null);
      }

      const allFiles = [
        ...stored.syllabusFiles,
        ...stored.studyMaterialFiles,
        ...stored.previousPaperFiles,
      ];
      setContextFiles(allFiles);

      const cacheEntry = stored.studyCache?.[topicSlug];
      const expectedSignature = `${STUDY_CACHE_SCHEMA_VERSION}:${selectedTopic.slug}:${allFiles.map((file) => file.url).join("|")}`;
      const cached =
        cacheEntry &&
        cacheEntry.signature === expectedSignature &&
        cacheEntry.schemaVersion === STUDY_CACHE_SCHEMA_VERSION
          ? cacheEntry.content
          : null;

      if (cached) {
        setStudyData(cached);
        void recordAiTelemetryInSession(user.uid, strategyId, {
          taskType: "topic_description",
          modelUsed: "cache",
          latencyMs: 0,
          cacheHit: true,
          fallbackTriggered: false,
        });
        setLoading(false);
        return;
      }

      const strategyHoursLeft =
        "strategySummary" in stored.strategy
          ? stored.strategy.strategySummary?.hoursLeft
          : undefined;
      const examTimeRemaining = formatExamTimeRemaining(
        session?.data.examDate ?? null,
        strategyHoursLeft,
      );

      const response = await fetch("/api/study/topic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: selectedTopic.title,
          priority: selectedTopic.priority,
          outlineOnly: false,
          files: allFiles,
          currentChapter: selectedTopic.chapterTitle,
          examTimeRemaining,
          studyMode: "learn",
          examMode: false,
          userIntent: "topic overview and exam-focused summary",
          ...resolvedModel,
        }),
      });

      if (!response.ok) {
        setStudyData({
          whatToLearn: [],
          explanation: {
            concept: selectedTopic.title,
            simpleExplanation: FALLBACK_MESSAGE,
            example: "No matching example found.",
            examTip: "Upload more topic-relevant material.",
          },
          keyExamPoints: [],
          confidence: "low",
          estimatedTime: selectedTopic.estimatedTime,
          sourceRefs: [],
          materialCoverage: 0,
          lowMaterialConfidence: true,
        });
        setLoading(false);
        return;
      }

      const apiData = (await response.json()) as TopicStudyApiResponse;
      setStudyData(apiData);
      if (apiData.routingMeta) {
        void recordAiTelemetryInSession(user.uid, strategyId, {
          taskType: apiData.routingMeta.taskType,
          modelUsed: apiData.routingMeta.modelUsed,
          latencyMs: apiData.routingMeta.latencyMs,
          cacheHit: false,
          fallbackTriggered: apiData.routingMeta.fallbackTriggered,
          fallbackReason: apiData.routingMeta.fallbackReason,
        });
      }
      setLoading(false);

      try {
        await saveStudyTopicCache(user.uid, strategyId, topicSlug, {
          signature: expectedSignature,
          schemaVersion: STUDY_CACHE_SCHEMA_VERSION,
          generatedAt: new Date().toISOString(),
          content: apiData,
        });
      } catch {
        // best-effort cache
      }
    }

    void load();
  }, [strategyId, topicSlug, user]);

  useEffect(() => {
    if (!user || !strategyId || !topic) {
      return;
    }

    topicOpenedAtRef.current = Date.now();
    void markTopicLearningInSession(user.uid, strategyId, topic.slug);
  }, [topic, strategyId, user]);

  useEffect(() => {
    return () => {
      if (!user || !strategyId || !topic || completed) {
        return;
      }

      const openedAt = topicOpenedAtRef.current;
      if (!openedAt) {
        return;
      }

      const elapsedSeconds = Math.max(0, Math.round((Date.now() - openedAt) / 1000));
      if (elapsedSeconds <= 40) {
        void markTopicSkippedInSession(user.uid, strategyId, topic.slug);
      }
    };
  }, [completed, strategyId, topic, user]);

  const activeChapter = useMemo(() => {
    if (!strategy || !topic) {
      return null;
    }

    return (
      strategy.chapters.find((chapter) =>
        chapter.topics.some((chapterTopic) => chapterTopic.slug === topic.slug)
      ) ?? null
    );
  }, [strategy, topic]);

  const nextFlow = useMemo(() => {
    if (!strategy || !topic || !activeChapter) {
      return {
        nextTopicInChapter: null as StudyTopic | null,
        nextChapterStart: null as StudyTopic | null,
        recommendedNextTopic: null as StudyTopic | null,
        recommendedReason: "",
      };
    }

    const parseWeightage = (weightage?: string): number => {
      if (!weightage) {
        return 0;
      }

      const match = weightage.match(/(\d+(?:\.\d+)?)/);
      return match ? Number.parseFloat(match[1]) : 0;
    };

    const priorityScore = (priority: StudyTopic["priority"]): number => {
      if (priority === "high") return 35;
      if (priority === "medium") return 22;
      return 10;
    };

    const hoursLeft = strategy.strategySummary?.hoursLeft ?? 6;
    const timeRemainingFactor = (priority: StudyTopic["priority"]) => {
      if (hoursLeft <= 6) {
        return priority === "high" ? 20 : priority === "medium" ? 12 : 6;
      }

      if (hoursLeft <= 12) {
        return priority === "high" ? 14 : priority === "medium" ? 9 : 5;
      }

      return priority === "high" ? 10 : priority === "medium" ? 7 : 4;
    };

    const chapterByNumber = new Map(strategy.chapters.map((chapter) => [chapter.chapterNumber, chapter]));

    const examDateFactor = (() => {
      if (!sessionExamDate) {
        return 0;
      }

      const examAt = new Date(sessionExamDate).getTime();
      if (Number.isNaN(examAt)) {
        return 0;
      }

      const days = Math.max(0, Math.round((examAt - Date.now()) / (1000 * 60 * 60 * 24)));
      if (days <= 3) return 22;
      if (days <= 7) return 14;
      if (days <= 14) return 8;
      return 4;
    })();

    const ranked = strategy.topics
      .filter((candidate) => candidate.slug !== topic.slug)
      .filter((candidate) => !topicStatuses[candidate.slug])
      .map((candidate) => {
        const chapter = candidate.chapterNumber ? chapterByNumber.get(candidate.chapterNumber) : undefined;
        const signal = topicSignals[candidate.slug];
        const examLikelihood = candidate.examLikelihoodScore ?? 0;
        const chapterWeightage = parseWeightage(chapter?.weightage);
        const unfinishedStatus = topicStatuses[candidate.slug] ? 0 : 18;
        const lowConfidenceBoost = Math.max(0, 100 - (signal?.confidence ?? 0)) * 0.28;
        const revisitBoost = (signal?.revisitCount ?? 0) * 5;
        const skippedBoost = (signal?.skippedCount ?? 0) * 6;
        const score =
          examLikelihood +
          chapterWeightage +
          unfinishedStatus +
          priorityScore(candidate.priority) +
          timeRemainingFactor(candidate.priority) +
          lowConfidenceBoost +
          revisitBoost +
          skippedBoost +
          examDateFactor;

        const reasons: string[] = [];
        if (examLikelihood >= 70) reasons.push("high exam probability");
        if ((signal?.confidence ?? 0) <= 45) reasons.push("low confidence");
        if ((signal?.revisitCount ?? 0) >= 1) reasons.push("needs revisit");
        if ((signal?.skippedCount ?? 0) >= 1) reasons.push("recently skipped");
        return {
          candidate,
          score,
          reason: reasons.length ? reasons.slice(0, 2).join(" + ") : "highest blended score",
        };
      })
      .sort((a, b) => b.score - a.score);

    const recommended = ranked[0] ?? null;
    const recommendedNextTopic = recommended?.candidate ?? null;
    const recommendedReason = recommended ? `Reason: ${recommended.reason}` : "";

    const chapterTopics = activeChapter.topics;
    const topicIndex = chapterTopics.findIndex((item) => item.slug === topic.slug);
    const nextTopicInChapter = topicIndex >= 0 ? chapterTopics[topicIndex + 1] ?? null : null;

    const sortedChapters = [...strategy.chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);
    const currentChapterIndex = sortedChapters.findIndex((item) => item.chapterNumber === activeChapter.chapterNumber);
    const nextChapterStart =
      currentChapterIndex >= 0
        ? sortedChapters
            .slice(currentChapterIndex + 1)
            .find((chapter) => chapter.topics.length > 0)
            ?.topics[0] ?? null
        : null;

    return { nextTopicInChapter, nextChapterStart, recommendedNextTopic, recommendedReason };
  }, [activeChapter, sessionExamDate, strategy, topic, topicSignals, topicStatuses]);

  const topicProgressLabel = useMemo(() => {
    if (!activeChapter || !topic) {
      return null;
    }

    const chapterTopics = activeChapter.topics;
    const index = chapterTopics.findIndex((item) => item.slug === topic.slug);
    if (index < 0) {
      return null;
    }

    return `Topic ${index + 1} / ${chapterTopics.length}`;
  }, [activeChapter, topic]);

  const globalProgress = useMemo(() => {
    if (!strategy) return { completed: 0, total: 0, percent: 0 };
    const total = strategy.topics.length;
    const completed = Object.values(topicStatuses).filter(Boolean).length;
    return { completed, total, percent: total ? Math.round((completed / total) * 100) : 0 };
  }, [strategy, topicStatuses]);

  async function runQuickAction(action: QuickActionKey) {
    if (!strategyId || !topic || !user) {
      return;
    }

    const actionPrompt: Record<QuickActionKey, string> = {
      difference: `What is the most exam-relevant difference in ${topic.title}?`,
      example: `Give one concise example for ${topic.title} that helps in exams.`,
      examQuestion: `Generate one likely exam question from ${topic.title} with a short ideal answer outline.`,
      explainSimply: `Explain ${topic.title} in very simple revision-note style for last-minute prep.`,
    };

    setQuickActions((current) => ({
      ...current,
      [action]: {
        ...current[action],
        loading: true,
      },
    }));

    const stored = await getStrategyById(user.uid, strategyId);
    if (!stored) {
      setQuickActions((current) => ({
        ...current,
        [action]: { ...current[action], loading: false, content: FALLBACK_MESSAGE, confidence: "low" },
      }));
      return;
    }

    try {
      const examTimeRemaining = formatExamTimeRemaining(sessionExamDate, strategy?.strategySummary?.hoursLeft);
      const response = await fetch("/api/study/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.title,
          question: actionPrompt[action],
          files: [...stored.syllabusFiles, ...stored.studyMaterialFiles, ...stored.previousPaperFiles],
          history: [],
          currentChapter: activeChapter?.chapterTitle ?? topic.chapterTitle,
          examTimeRemaining,
          studyMode: "quick_action",
          examMode: false,
          userIntent: action,
          ...modelPayload,
        }),
      });

      if (!response.ok) {
        setQuickActions((current) => ({
          ...current,
          [action]: { ...current[action], loading: false, content: FALLBACK_MESSAGE, confidence: "low" },
        }));
        return;
      }

      const data = (await response.json()) as TopicAskApiResponse;
      if (data.routingMeta) {
        void recordAiTelemetryInSession(user.uid, strategyId, {
          taskType: data.routingMeta.taskType,
          modelUsed: data.routingMeta.modelUsed,
          latencyMs: data.routingMeta.latencyMs,
          cacheHit: false,
          fallbackTriggered: data.routingMeta.fallbackTriggered,
          fallbackReason: data.routingMeta.fallbackReason,
        });
      }
      setQuickActions((current) => ({
        ...current,
        [action]: {
          loading: false,
          content: data.answer,
          confidence: data.confidence,
        },
      }));
    } catch {
      setQuickActions((current) => ({
        ...current,
        [action]: { ...current[action], loading: false, content: FALLBACK_MESSAGE, confidence: "low" },
      }));
    }
  }

  async function handleAsk(overrideQuestion?: string) {
    const resolvedQuestion = (overrideQuestion ?? "").trim();

    if (!strategyId || !topic || !resolvedQuestion || !user) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      content: resolvedQuestion,
    };

    setChatHistory((current) => [...current, userMessage]);
    setAsking(true);

    const stored = await getStrategyById(user.uid, strategyId);
    if (!stored) {
      setAsking(false);
      return;
    }

    const fileSignature = `${STUDY_CACHE_SCHEMA_VERSION}:${[
      ...stored.syllabusFiles,
      ...stored.studyMaterialFiles,
      ...stored.previousPaperFiles,
    ]
      .map((file) => file.url)
      .join("|")}`;

    const modelKey = getModelCacheKey(modelPayload);
    const cacheKey = `${topic.slug}:${resolvedQuestion}:${modelKey}`;

    const cachedChat = await getChatCacheFromSession(
      user.uid,
      strategyId,
      cacheKey,
      fileSignature,
      STUDY_CACHE_SCHEMA_VERSION,
    );

    if (cachedChat) {
      setChatHistory((current) => [
        ...current,
        {
          id: `${Date.now()}-assistant`,
          role: "assistant",
          content: cachedChat.answer,
          confidence: cachedChat.confidence,
          citations: cachedChat.citations as SourceCitation[],
        },
      ]);
      void recordAiTelemetryInSession(user.uid, strategyId, {
        taskType: "chat_follow_up",
        modelUsed: cachedChat.model ?? "cache",
        latencyMs: 0,
        cacheHit: true,
        fallbackTriggered: false,
      });
      setAsking(false);
      return;
    }

    try {
      const examTimeRemaining = formatExamTimeRemaining(sessionExamDate, strategy?.strategySummary?.hoursLeft);
      const response = await fetch("/api/study/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.title,
          question: resolvedQuestion,
          files: [...stored.syllabusFiles, ...stored.studyMaterialFiles, ...stored.previousPaperFiles],
          history: [...chatHistory, userMessage]
            .slice(-8)
            .map((message) => ({ role: message.role, content: message.content })),
          currentChapter: activeChapter?.chapterTitle ?? topic.chapterTitle,
          examTimeRemaining,
          studyMode: "chat",
          examMode: false,
          userIntent: resolvedQuestion,
          ...modelPayload,
        }),
      });

      if (!response.ok) {
        setChatHistory((current) => [
          ...current,
          { id: `${Date.now()}-assistant`, role: "assistant", content: FALLBACK_MESSAGE, confidence: "low" },
        ]);
        return;
      }

      const data = (await response.json()) as TopicAskApiResponse;
      if (data.routingMeta) {
        void recordAiTelemetryInSession(user.uid, strategyId, {
          taskType: data.routingMeta.taskType,
          modelUsed: data.routingMeta.modelUsed,
          latencyMs: data.routingMeta.latencyMs,
          cacheHit: false,
          fallbackTriggered: data.routingMeta.fallbackTriggered,
          fallbackReason: data.routingMeta.fallbackReason,
        });
      }

      void saveChatCacheToSession(user.uid, strategyId, cacheKey, {
        signature: fileSignature,
        schemaVersion: STUDY_CACHE_SCHEMA_VERSION,
        model: modelKey,
        answer: data.answer,
        confidence: data.confidence,
        citations: (data.citations ?? []).map((citation) => ({
          sourceType: citation.sourceType,
          sourceName: citation.sourceName,
          sourceYear: citation.sourceYear,
          importanceLevel: citation.importanceLevel,
        })),
      });

      const fullAnswer = data.answer?.trim() ? data.answer : FALLBACK_MESSAGE;
      const assistantId = `${Date.now()}-assistant`;

      setChatHistory((current) => [
        ...current,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          confidence: data.confidence,
          citations: data.citations ?? [],
        },
      ]);

      const chunkSize = Math.max(8, Math.min(28, Math.ceil(fullAnswer.length / 22)));
      for (let cursor = chunkSize; cursor < fullAnswer.length; cursor += chunkSize) {
        await new Promise<void>((resolve) => {
          setTimeout(() => resolve(), 14);
        });

        const partial = fullAnswer.slice(0, cursor);
        setChatHistory((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: partial,
                }
              : message,
          ),
        );
      }

      setChatHistory((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: fullAnswer,
              }
            : message,
        ),
      );
    } finally {
      setAsking(false);
    }
  }

  async function handleMarkCompleted() {
    if (!user || !strategyId || !topic) return;

    try {
      const openedAt = topicOpenedAtRef.current ?? Date.now();
      const elapsedSeconds = Math.max(0, Math.round((Date.now() - openedAt) / 1000));

      await Promise.all([
        markTopicCompleted(user.uid, strategyId, topic.slug),
        markTopicCompletedInSession(user.uid, strategyId, topic.slug, elapsedSeconds, 80),
      ]);

      setTopicSignals((current) => ({
        ...current,
        [topic.slug]: {
          confidence: 80,
          revisitCount: current[topic.slug]?.revisitCount ?? 0,
          skippedCount: current[topic.slug]?.skippedCount ?? 0,
        },
      }));

      setTopicStatuses((current) => ({
        ...current,
        [topic.slug]: true,
      }));

      setCompleted(true);
    } catch {
      // no-op fallback
    }
  }

  async function handleLearnNow(item: string, index: number) {
    if (!topic || !contextFiles.length || !user || !strategyId) {
      return;
    }

    const key = `${item}-${index}`;
    if (learnedItems[key]?.content) {
      return;
    }

    setLearnedItems((current) => ({
      ...current,
      [key]: { loading: true },
    }));

    try {
      const signature = `${STUDY_CACHE_SCHEMA_VERSION}:${contextFiles.map((file) => file.url).join("|")}`;
      const answerCacheKey = `${topic.slug}:${item}`;
      const cachedLearnAnswer = await getStudyAnswerCacheFromSession(
        user.uid,
        strategyId,
        answerCacheKey,
        signature,
        STUDY_CACHE_SCHEMA_VERSION,
      );

      if (cachedLearnAnswer) {
        setLearnedItems((current) => ({
          ...current,
          [key]: {
            loading: false,
            content: {
              conceptExplanation: cachedLearnAnswer.conceptExplanation,
              example: cachedLearnAnswer.example,
              examTip: cachedLearnAnswer.examTip,
              typicalExamQuestion: cachedLearnAnswer.typicalExamQuestion,
              fullAnswer: cachedLearnAnswer.fullAnswer,
              confidence: cachedLearnAnswer.confidence,
              citations: cachedLearnAnswer.citations as SourceCitation[],
            },
          },
        }));
        void recordAiTelemetryInSession(user.uid, strategyId, {
          taskType: "learn_now_answer",
          modelUsed: cachedLearnAnswer.model ?? "cache",
          latencyMs: 0,
          cacheHit: true,
          fallbackTriggered: false,
        });
        return;
      }

      const examTimeRemaining = formatExamTimeRemaining(sessionExamDate, strategy?.strategySummary?.hoursLeft);
      const response = await fetch("/api/study/learn-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.title,
          item,
          files: contextFiles,
          currentChapter: activeChapter?.chapterTitle ?? topic.chapterTitle,
          examTimeRemaining,
          studyMode: "learn_now",
          examMode: false,
          userIntent: item,
          ...modelPayload,
        }),
      });

      if (!response.ok) {
        setLearnedItems((current) => ({
          ...current,
          [key]: { loading: false, error: "Unable to generate this learning block." },
        }));
        return;
      }

      const content = (await response.json()) as LearnItemApiResponse;
      void saveStudyAnswerCacheToSession(user.uid, strategyId, answerCacheKey, {
        signature,
        schemaVersion: STUDY_CACHE_SCHEMA_VERSION,
        model: content.routingMeta?.modelUsed ?? getModelCacheKey(modelPayload),
        item,
        answer: {
          conceptExplanation: content.conceptExplanation,
          example: content.example,
          examTip: content.examTip,
          typicalExamQuestion: content.typicalExamQuestion,
          fullAnswer: content.fullAnswer,
          confidence: content.confidence,
          citations: (content.citations ?? []).map((citation) => ({
            sourceType: citation.sourceType,
            sourceName: citation.sourceName,
            sourceYear: citation.sourceYear,
            importanceLevel: citation.importanceLevel,
          })),
        },
      });
      if (content.routingMeta && user && strategyId) {
        void recordAiTelemetryInSession(user.uid, strategyId, {
          taskType: content.routingMeta.taskType,
          modelUsed: content.routingMeta.modelUsed,
          latencyMs: content.routingMeta.latencyMs,
          cacheHit: false,
          fallbackTriggered: content.routingMeta.fallbackTriggered,
          fallbackReason: content.routingMeta.fallbackReason,
        });
      }
      setLearnedItems((current) => ({
        ...current,
        [key]: { loading: false, content },
      }));
    } catch {
      setLearnedItems((current) => ({
        ...current,
        [key]: { loading: false, error: "Unable to generate this learning block." },
      }));
    }
  }

  async function handleExamMode() {
    if (!topic || !contextFiles.length) {
      return;
    }

    setExamModeLoading(true);

    try {
      const examTimeRemaining = formatExamTimeRemaining(sessionExamDate, strategy?.strategySummary?.hoursLeft);
      const response = await fetch("/api/study/exam-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.title,
          files: contextFiles,
          currentChapter: activeChapter?.chapterTitle ?? topic.chapterTitle,
          examTimeRemaining,
          studyMode: "exam_mode",
          examMode: true,
          userIntent: "generate likely exam questions",
          ...modelPayload,
        }),
      });

      if (!response.ok) {
        setExamMode(null);
        return;
      }

      const data = (await response.json()) as ExamModeApiResponse;
      setExamMode(data);
      if (data.routingMeta && user && strategyId) {
        void recordAiTelemetryInSession(user.uid, strategyId, {
          taskType: data.routingMeta.taskType,
          modelUsed: data.routingMeta.modelUsed,
          latencyMs: data.routingMeta.latencyMs,
          cacheHit: false,
          fallbackTriggered: data.routingMeta.fallbackTriggered,
          fallbackReason: data.routingMeta.fallbackReason,
        });
      }

      if (user && strategyId && topic) {
        await recordQuizAttemptInSession(user.uid, strategyId, topic.slug, {
          score: data.readinessScore,
          durationSeconds: 120,
        });

        setTopicSignals((current) => ({
          ...current,
          [topic.slug]: {
            confidence: data.readinessScore,
            revisitCount: current[topic.slug]?.revisitCount ?? 0,
            skippedCount: current[topic.slug]?.skippedCount ?? 0,
          },
        }));
      }
    } finally {
      setExamModeLoading(false);
    }
  }

  async function handleGenerateMicroQuiz(key: string) {
    if (!topic || !contextFiles.length) {
      return;
    }

    setMicroQuizzes((current) => ({
      ...current,
      [key]: { loading: true },
    }));

    try {
      const examTimeRemaining = formatExamTimeRemaining(sessionExamDate, strategy?.strategySummary?.hoursLeft);
      const response = await fetch("/api/study/micro-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.title,
          files: contextFiles,
          count: 4,
          currentChapter: activeChapter?.chapterTitle ?? topic.chapterTitle,
          examTimeRemaining,
          studyMode: "micro_quiz",
          examMode: false,
          userIntent: "generate short quiz",
          ...modelPayload,
        }),
      });

      if (!response.ok) {
        setMicroQuizzes((current) => ({
          ...current,
          [key]: { loading: false, error: "Unable to generate quiz from uploaded material." },
        }));
        return;
      }

      const data = (await response.json()) as MicroQuizApiResponse;
      if (data.routingMeta && user && strategyId) {
        void recordAiTelemetryInSession(user.uid, strategyId, {
          taskType: data.routingMeta.taskType,
          modelUsed: data.routingMeta.modelUsed,
          latencyMs: data.routingMeta.latencyMs,
          cacheHit: false,
          fallbackTriggered: data.routingMeta.fallbackTriggered,
          fallbackReason: data.routingMeta.fallbackReason,
        });
      }
      setMicroQuizzes((current) => ({
        ...current,
        [key]: {
          loading: false,
          questions: data.questions,
          citations: data.citations,
        },
      }));
    } catch {
      setMicroQuizzes((current) => ({
        ...current,
        [key]: { loading: false, error: "Unable to generate quiz from uploaded material." },
      }));
    }
  }

  async function handleQuizSelfAssessment(key: string, score: number) {
    if (!user || !strategyId || !topic) {
      return;
    }

    await recordQuizAttemptInSession(user.uid, strategyId, topic.slug, {
      score,
      durationSeconds: 180,
    });

    setMicroQuizzes((current) => ({
      ...current,
      [key]: {
        ...current[key],
        attempted: true,
        score,
      },
    }));

    setTopicSignals((current) => ({
      ...current,
      [topic.slug]: {
        confidence: score,
        revisitCount: current[topic.slug]?.revisitCount ?? 0,
        skippedCount: current[topic.slug]?.skippedCount ?? 0,
      },
    }));
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
        <TextShimmerWave className="text-sm [--base-color:#a3a3a3] [--base-gradient-color:#ffffff]" duration={1}>
          Loading topic...
        </TextShimmerWave>
      </div>
    );
  }

  if (!topic || !studyData || !strategy) {
    return (
      <div className="min-h-screen bg-[#050505] text-white selection:bg-indigo-500/30 overflow-hidden relative">
        <AuthenticatedNavBar strategyId={strategyId} topicSlug={topicSlug} />
        <div className="relative z-10 pt-20">
          <StrategyRecoveryView
            title="Study context missing"
            message={recoveryMessage ?? "Open a recent session or create a new one to continue studying."}
            recentStrategies={recentStrategies}
            mode="study"
          />
        </div>
      </div>
    );
  }

  const nextHref = nextFlow.recommendedNextTopic
    ? `/study/${nextFlow.recommendedNextTopic.slug}?id=${strategyId}`
    : nextFlow.nextTopicInChapter
    ? `/study/${nextFlow.nextTopicInChapter.slug}?id=${strategyId}`
    : nextFlow.nextChapterStart
      ? `/study/${nextFlow.nextChapterStart.slug}?id=${strategyId}`
      : `/dashboard?id=${strategyId}`;
  const nextLabel = nextFlow.recommendedNextTopic
    ? "🔥 Recommended Next Topic"
    : nextFlow.nextTopicInChapter
    ? "Continue Chapter"
    : nextFlow.nextChapterStart
      ? "Start Next Chapter"
      : "Back to Dashboard";
  const hasNextStep = Boolean(nextFlow.recommendedNextTopic || nextFlow.nextTopicInChapter || nextFlow.nextChapterStart);
  const nextReason = nextFlow.recommendedReason;

  return (
    <div className="h-screen bg-[#050505] text-white selection:bg-orange-500/20 overflow-hidden flex flex-col relative">
      <AuthenticatedNavBar strategyId={strategyId} topicSlug={topicSlug} />
      <div className="h-20 flex-shrink-0 pointer-events-none" aria-hidden="true" />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.15, 0.3, 0.15] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-[10%] -left-[10%] w-[60%] h-[60%] rounded-full blur-[120px]"
          style={{ background: "radial-gradient(ellipse at center, rgba(249,115,22,0.15) 0%, transparent 70%)" }}
        />
      </div>

      <div className="relative z-10 flex-1 flex min-h-0 overflow-hidden">
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto min-w-0 px-4 md:px-8 pt-6 pb-28 space-y-5">
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  {activeChapter ? (
                    <p className="text-sm text-indigo-200/90">
                      Chapter {activeChapter.chapterNumber}: {activeChapter.chapterTitle}
                    </p>
                  ) : null}
                  <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white mt-1">Topic: {topic.title}</h1>
                  <p className="text-neutral-400 mt-2">Structured notes from your uploaded material.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge className="bg-indigo-500/20 text-indigo-200 border-none capitalize">{topic.priority} priority</Badge>
                  <Badge className="bg-white/10 text-white border-none">{studyData.estimatedTime}</Badge>
                  {typeof studyData.materialCoverage === "number" ? (
                    <Badge className="bg-blue-500/20 text-blue-200 border-none">Coverage: {studyData.materialCoverage}%</Badge>
                  ) : null}
                  {typeof studyData.examLikelihoodScore === "number" ? (
                    <Badge className="bg-fuchsia-500/20 text-fuchsia-200 border-none">
                      🔥 Exam Likelihood: {studyData.examLikelihoodScore}% {studyData.examLikelihoodLabel ? `(${studyData.examLikelihoodLabel})` : ""}
                    </Badge>
                  ) : null}
                  <Badge className={`${confidenceClass(studyData.confidence)} border-none capitalize`}>
                    Confidence: {studyData.confidence}
                  </Badge>
                  {studyData.lowMaterialConfidence ? (
                    <Badge className="bg-amber-500/20 text-amber-200 border-none">
                      Low material confidence — upload more notes.
                    </Badge>
                  ) : null}
                  {completed ? <Badge className="bg-emerald-500/20 text-emerald-200 border-none">Completed</Badge> : null}
                </div>
              </div>
            </div>

            <Card className="bg-white/5 border border-white/10 backdrop-blur-xl shadow-2xl rounded-3xl">
              <CardHeader>
                <CardTitle className="text-white text-xl">What to Learn</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {studyData.whatToLearn.length ? (
                  <ul className="space-y-2 text-neutral-200 text-sm leading-7">
                    {studyData.whatToLearn.map((item, index) => {
                      const key = `${item}-${index}`;
                      const learned = learnedItems[key];
                      const quiz = microQuizzes[key];

                      return (
                        <li key={key} className="rounded-xl bg-black/25 border border-white/10 px-3 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>{item}</span>
                            <Button
                              type="button"
                              variant="outline"
                              className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10"
                              disabled={Boolean(learned?.loading)}
                              onClick={() => void handleLearnNow(item, index)}
                            >
                              {learned?.content ? "Loaded" : learned?.loading ? "Loading..." : "Learn Now →"}
                            </Button>
                          </div>

                          {learned?.error ? <p className="mt-2 text-xs text-red-300">{learned.error}</p> : null}

                          {learned?.content ? (
                            <div className="mt-3 rounded-xl bg-black/35 border border-white/10 p-3 space-y-3">
                              <div>
                                <p className="text-xs uppercase tracking-wide text-indigo-200/80">Concept Explanation</p>
                                <MarkdownRenderer content={learned.content.conceptExplanation} />
                              </div>
                              <div>
                                <p className="text-xs uppercase tracking-wide text-indigo-200/80">Example</p>
                                <MarkdownRenderer content={learned.content.example} />
                              </div>
                              <div>
                                <p className="text-xs uppercase tracking-wide text-indigo-200/80">Exam Tip</p>
                                <MarkdownRenderer content={learned.content.examTip} />
                              </div>
                              <div>
                                <p className="text-xs uppercase tracking-wide text-indigo-200/80">Typical Exam Question</p>
                                <MarkdownRenderer content={learned.content.typicalExamQuestion} />
                              </div>
                              <div>
                                <p className="text-xs uppercase tracking-wide text-indigo-200/80">Full Answer (Exam-ready)</p>
                                <MarkdownRenderer content={learned.content.fullAnswer} />
                              </div>

                              {learned.content.citations.length ? (
                                <div className="flex flex-wrap gap-2 pt-1">
                                  {learned.content.citations.slice(0, 3).map((source, sourceIndex) => (
                                    <Badge key={`${source.sourceName}-${sourceIndex}`} className="bg-white/10 text-white border-none text-[11px]">
                                      {source.sourceType} — {source.sourceName}
                                      {source.sourceYear ? ` (${source.sourceYear})` : ""}
                                    </Badge>
                                  ))}
                                </div>
                              ) : null}

                              <div className="pt-2 border-t border-white/10">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs uppercase tracking-wide text-indigo-200/80">Micro Quiz</p>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10"
                                    disabled={Boolean(quiz?.loading)}
                                    onClick={() => void handleGenerateMicroQuiz(key)}
                                  >
                                    {quiz?.questions?.length ? "Regenerate Quiz" : quiz?.loading ? "Generating..." : "Generate 3-5 Questions"}
                                  </Button>
                                </div>

                                {quiz?.error ? <p className="mt-2 text-xs text-red-300">{quiz.error}</p> : null}

                                {quiz?.questions?.length ? (
                                  <div className="mt-3 space-y-2">
                                    {quiz.questions.map((question, questionIndex) => (
                                      <div key={`${question.question}-${questionIndex}`} className="rounded-lg bg-black/35 border border-white/10 p-3">
                                        <p className="text-sm text-white">Q{questionIndex + 1}. {question.question}</p>
                                        <p className="text-xs text-indigo-200 mt-2">Answer:</p>
                                        <MarkdownRenderer content={question.answer} />
                                        <p className="text-xs text-indigo-200 mt-2">Explanation:</p>
                                        <MarkdownRenderer content={question.explanation} />
                                      </div>
                                    ))}

                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="rounded-full border-red-400/20 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                                        onClick={() => void handleQuizSelfAssessment(key, 45)}
                                      >
                                        I struggled
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="rounded-full border-emerald-400/20 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                                        onClick={() => void handleQuizSelfAssessment(key, 80)}
                                      >
                                        I did well
                                      </Button>
                                      {quiz.attempted ? (
                                        <Badge className="bg-indigo-500/20 text-indigo-200 border-none">
                                          Quiz recorded: {quiz.score}%
                                        </Badge>
                                      ) : null}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-neutral-300 text-sm">{FALLBACK_MESSAGE}</p>
                )}

                {studyData.typicalExamQuestions?.length ? (
                  <div className="rounded-2xl bg-black/25 border border-white/10 p-4 space-y-3">
                    <p className="text-xs uppercase tracking-wide text-indigo-200/80">Typical Exam Questions + Full Answers</p>
                    {studyData.typicalExamQuestions.map((question, index) => (
                      <div key={`${question.question}-${index}`} className="rounded-xl bg-black/30 border border-white/10 p-3 space-y-2">
                        <p className="text-sm text-white font-medium">Q: {question.question}</p>
                        <Badge className="bg-fuchsia-500/20 text-fuchsia-200 border-none">
                          🔥 Exam Likelihood: {question.examLikelihoodScore}% ({question.examLikelihoodLabel})
                        </Badge>
                        {question.askedIn ? <p className="text-xs text-indigo-200">Asked in: {question.askedIn}</p> : null}
                        {question.originalQuestion ? (
                          <div>
                            <Button
                              type="button"
                              variant="outline"
                              className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10"
                              onClick={() => {
                                const key = `${question.question}-${index}`;
                                setExpandedOriginalQuestions((current) => ({
                                  ...current,
                                  [key]: !current[key],
                                }));
                              }}
                            >
                              View Original Question
                            </Button>
                            {expandedOriginalQuestions[`${question.question}-${index}`] ? (
                              <p className="mt-2 text-sm text-neutral-300 rounded-lg bg-black/35 border border-white/10 p-2">
                                {question.originalQuestion}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                        <p className="text-sm"><span className="text-indigo-200">Answer:</span></p>
                        <MarkdownRenderer content={question.answer} />
                        <p className="text-sm"><span className="text-indigo-200">Simple explanation:</span></p>
                        <MarkdownRenderer content={question.simpleExplanation} />
                        <p className="text-sm"><span className="text-indigo-200">Example:</span></p>
                        <MarkdownRenderer content={question.example} />
                        <p className="text-sm"><span className="text-indigo-200">Exam tip:</span></p>
                        <MarkdownRenderer content={question.examTip} />
                        {question.sources.length ? (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {question.sources.slice(0, 3).map((source, sourceIndex) => (
                              <Badge key={`${source.sourceName}-${sourceIndex}`} className="bg-white/10 text-white border-none text-[11px]">
                                {source.sourceType} — {source.sourceName}
                                {source.sourceYear ? ` (${source.sourceYear})` : ""}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {studyData.sourceRefs?.length ? (
                  <div className="rounded-2xl bg-black/25 border border-white/10 p-4">
                    <p className="text-xs uppercase tracking-wide text-indigo-200/80">Source Transparency</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {studyData.sourceRefs.slice(0, 6).map((source, index) => (
                        <Badge key={`${source.sourceName}-${index}`} className="bg-white/10 text-white border-none text-[11px]">
                          {source.sourceType} — {source.sourceName}
                          {source.sourceYear ? ` (${source.sourceYear})` : ""}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="pt-2">
                  <p className="text-xs uppercase tracking-wide text-indigo-200/80 mb-2">Interactive Learning Blocks</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10"
                      onClick={() => void runQuickAction("difference")}
                      disabled={quickActions.difference.loading}
                    >
                      {quickActions.difference.loading ? "Loading..." : "Difference"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10"
                      onClick={() => void runQuickAction("example")}
                      disabled={quickActions.example.loading}
                    >
                      {quickActions.example.loading ? "Loading..." : "Example"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10"
                      onClick={() => void runQuickAction("examQuestion")}
                      disabled={quickActions.examQuestion.loading}
                    >
                      {quickActions.examQuestion.loading ? "Loading..." : "Exam Question"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10"
                      onClick={() => void runQuickAction("explainSimply")}
                      disabled={quickActions.explainSimply.loading}
                    >
                      {quickActions.explainSimply.loading ? "Loading..." : "Explain Simply"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10"
                      onClick={() => void handleExamMode()}
                      disabled={examModeLoading}
                    >
                      {examModeLoading ? "Loading..." : "Exam Mode"}
                    </Button>
                  </div>
                </div>

                {(
                  [
                    { key: "difference" as const, title: "Difference" },
                    { key: "example" as const, title: "Example" },
                    { key: "examQuestion" as const, title: "Exam Question" },
                    { key: "explainSimply" as const, title: "Explain Simply" },
                  ]
                )
                  .filter((item) => quickActions[item.key].content)
                  .map((item) => (
                    <div key={item.key} className="rounded-2xl bg-black/25 border border-white/10 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs uppercase tracking-wide text-indigo-200/80">{item.title}</p>
                        {quickActions[item.key].confidence ? (
                          <Badge className={`${confidenceClass(quickActions[item.key].confidence as TopicConfidence)} border-none capitalize`}>
                            {quickActions[item.key].confidence}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-2">{quickActions[item.key].content}</p>
                    </div>
                  ))}
              </CardContent>
            </Card>

            <Card className="bg-white/5 border border-white/10 backdrop-blur-xl shadow-2xl rounded-3xl">
              <CardHeader>
                <CardTitle className="text-white text-xl">Key Exam Points</CardTitle>
              </CardHeader>
              <CardContent>
                {studyData.keyExamPoints.length ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {studyData.keyExamPoints.map((item, index) => (
                      <div key={`${item}-${index}`} className="rounded-xl bg-indigo-500/10 border border-indigo-400/20 px-3 py-3 text-sm text-indigo-50 leading-6">
                        {item}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-neutral-300 text-sm">{FALLBACK_MESSAGE}</p>
                )}

                {examMode ? (
                  <div className="mt-5 space-y-3 rounded-2xl bg-black/25 border border-white/10 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-white">Exam Mode Snapshot</p>
                      <Badge className={`${confidenceClass(examMode.confidence)} border-none capitalize`}>
                        Readiness: {examMode.readinessScore}/100
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      {examMode.likelyQuestions.map((question, index) => (
                        <div key={`${question.question}-${index}`} className="rounded-xl border border-white/10 bg-white/5 p-3">
                          <p className="text-sm text-white font-medium">Q{index + 1}. {question.question}</p>
                          <p className="mt-1 text-xs text-neutral-300">Expected: {question.expectedAnswer}</p>
                          <p className="mt-1 text-[11px] text-neutral-400">
                            Difficulty: {question.difficulty} • Time: {question.timeLimitMinutes} min
                          </p>
                        </div>
                      ))}
                    </div>

                    {examMode.weakAreas.length ? (
                      <div>
                        <p className="text-xs uppercase tracking-wide text-indigo-200/80 mb-2">Weak Areas</p>
                        <ul className="list-disc pl-5 space-y-1 text-xs text-neutral-300">
                          {examMode.weakAreas.map((item, index) => (
                            <li key={`${item}-${index}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <p className="text-xs text-indigo-100">Tip: {examMode.examTip}</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div className="hidden lg:flex w-[380px] xl:w-[420px] flex-shrink-0 flex-col px-4 pt-4 pb-[68px]">
            <Card className="flex-1 flex flex-col min-h-0 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl overflow-hidden">
              <CardHeader className="px-5 pt-5 pb-3 flex-shrink-0 border-b border-white/[0.07]">
                <CardTitle className="text-white text-base font-semibold tracking-tight">Ask about this topic</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden px-4 py-4">
                <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
                  {chatHistory.length ? (
                    chatHistory.map((message) => (
                      <div
                        key={message.id}
                        className={`rounded-xl px-3 py-2 text-sm leading-6 border ${
                          message.role === "user"
                            ? "bg-orange-500/15 border-orange-400/25 text-orange-50"
                            : "bg-black/25 border-white/10 text-neutral-100"
                        }`}
                      >
                        <MarkdownRenderer content={message.content} />
                        {message.role === "assistant" && message.confidence ? (
                          <p className="text-[11px] text-neutral-400 mt-1 capitalize">Confidence: {message.confidence}</p>
                        ) : null}
                        {message.role === "assistant" && message.citations?.length ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {message.citations.slice(0, 3).map((citation, index) => (
                              <span
                                key={`${citation.sourceName}-${index}`}
                                className="text-[10px] rounded-full bg-white/10 px-2 py-0.5 text-neutral-300"
                              >
                                {citation.sourceType}: {citation.sourceName}
                                {citation.sourceYear ? ` (${citation.sourceYear})` : ""}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-neutral-400">Ask a question and get concise, topic-specific answers.</p>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="pt-1 pb-1">
                  <AnimatedGlowingBorder className="w-full h-[62px]" innerClassName="h-full bg-[#010201]">
                    <AIInputWithLoading
                      id="study-topic-chat"
                      placeholder="Ask about this topic"
                      loadingDuration={1200}
                      thinkingDuration={500}
                      minHeight={56}
                      className="py-0"
                      textareaClassName="h-[56px] min-h-[56px] rounded-lg bg-[#010201] dark:bg-[#010201] text-white placeholder:text-neutral-400"
                      onSubmit={async (value) => {
                        await handleAsk(value);
                      }}
                      disabled={asking}
                      showStatusText={false}
                    />
                  </AnimatedGlowingBorder>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/10 bg-black/70 backdrop-blur-xl">
        <div className="mx-auto max-w-[1400px] px-4 md:px-6 py-3 flex items-center justify-between gap-3">
          <Button asChild variant="outline" className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10 hover:border-white/20 transition-all">
            <Link href={`/dashboard?id=${strategyId}`}>Back to Dashboard</Link>
          </Button>

          <div className="hidden md:flex items-center gap-3">
            {/* Visual session progress strip */}
            <div className="flex flex-col items-center gap-1">
              <div className="w-32 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-orange-500 transition-all duration-500"
                  style={{ width: `${globalProgress.percent}%` }}
                />
              </div>
              <span className="text-[10px] text-neutral-400">{globalProgress.completed}/{globalProgress.total} topics</span>
            </div>
            <div className="flex items-center gap-2">
              {topicProgressLabel ? (
                <span className="text-xs md:text-sm text-neutral-300 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                  {topicProgressLabel}
                </span>
              ) : null}
              {nextReason ? (
                <span className="text-xs text-neutral-300 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                  {nextReason}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={handleMarkCompleted}
              className="rounded-full bg-orange-500 hover:bg-orange-400 text-white shadow-[0_0_16px_rgba(249,115,22,0.2)] hover:shadow-[0_0_24px_rgba(249,115,22,0.35)] transition-all"
              disabled={completed}
            >
              {completed ? "Completed" : "Mark as Completed"}
            </Button>
            <Button
              asChild
              className="rounded-full bg-white hover:bg-neutral-100 text-[#080808] shadow-[0_2px_16px_rgba(255,255,255,0.12)] transition-all"
              disabled={!hasNextStep}
            >
              <Link href={nextHref}>
                {nextLabel} →
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
