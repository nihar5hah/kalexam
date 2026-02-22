"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";

import { AppTopNav } from "@/components/AppTopNav";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { RequireAuth } from "@/components/RequireAuth";
import { StrategyRecoveryView } from "@/components/StrategyRecoveryView";
import { AIInputWithLoading } from "@/components/ui/ai-input-with-loading";
import { AnimatedGlowingBorder } from "@/components/ui/animated-glowing-search-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  getChatCacheFromSession,
  markTopicCompletedInSession,
  markTopicLearningInSession,
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
};

type TopicAskApiResponse = {
  answer: string;
  confidence: TopicConfidence;
  citations?: SourceCitation[];
};

type LearnItemApiResponse = {
  conceptExplanation: string;
  example: string;
  examTip: string;
  typicalExamQuestion: string;
  fullAnswer: string;
  confidence: TopicConfidence;
  citations: SourceCitation[];
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

export default function StudyTopicPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
          <p className="text-neutral-400">Loading study mode...</p>
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

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [asking, setAsking] = useState(false);
  const [quickActions, setQuickActions] = useState<QuickActionState>({
    difference: { loading: false, content: "" },
    example: { loading: false, content: "" },
    examQuestion: { loading: false, content: "" },
    explainSimply: { loading: false, content: "" },
  });
  const [expandedOriginalQuestions, setExpandedOriginalQuestions] = useState<Record<string, boolean>>({});
  const [learnedItems, setLearnedItems] = useState<Record<string, { loading: boolean; content?: LearnItemApiResponse; error?: string }>>({});
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
        setRecoveryMessage("Study context is missing. Open a recent strategy or create a new one.");
        setLoading(false);
        return;
      }

      const stored = await getStrategyById(user.uid, strategyId);
      if (!stored) {
        const recent = await listRecentStrategies(user.uid, 5);
        setRecentStrategies(mapRecentStrategies(recent));
        setRecoveryMessage("This strategy could not be found. Open a recent strategy or create a new one.");
        setLoading(false);
        return;
      }

      const modelLabel = stored.modelType === "custom" ? "Custom Model" : "Gemini";
      const normalized = normalizeStrategyResult(stored.strategy, stored.hoursLeft, modelLabel);
      const selectedTopic = normalized.topics.find((item) => item.slug === topicSlug);

      if (!selectedTopic) {
        const recent = await listRecentStrategies(user.uid, 5);
        setRecentStrategies(mapRecentStrategies(recent));
        setRecoveryMessage("This topic is not available in the selected strategy.");
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
        setLoading(false);
        return;
      }

      const response = await fetch("/api/study/topic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: selectedTopic.title,
          priority: selectedTopic.priority,
          outlineOnly: false,
          files: allFiles,
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

    const recommendedNextTopic = strategy.topics
      .filter((candidate) => candidate.slug !== topic.slug)
      .filter((candidate) => !topicStatuses[candidate.slug])
      .map((candidate) => {
        const chapter = candidate.chapterNumber ? chapterByNumber.get(candidate.chapterNumber) : undefined;
        const examLikelihood = candidate.examLikelihoodScore ?? 0;
        const chapterWeightage = parseWeightage(chapter?.weightage);
        const unfinishedStatus = topicStatuses[candidate.slug] ? 0 : 18;
        const score =
          examLikelihood +
          chapterWeightage +
          unfinishedStatus +
          priorityScore(candidate.priority) +
          timeRemainingFactor(candidate.priority);
        return {
          candidate,
          score,
        };
      })
      .sort((a, b) => b.score - a.score)[0]?.candidate ?? null;

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

    return { nextTopicInChapter, nextChapterStart, recommendedNextTopic };
  }, [activeChapter, strategy, topic, topicStatuses]);

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
      const response = await fetch("/api/study/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.title,
          question: actionPrompt[action],
          files: [...stored.syllabusFiles, ...stored.studyMaterialFiles, ...stored.previousPaperFiles],
          history: [],
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
      setAsking(false);
      return;
    }

    try {
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

      setChatHistory((current) => [
        ...current,
        {
          id: `${Date.now()}-assistant`,
          role: "assistant",
          content: data.answer,
          confidence: data.confidence,
          citations: data.citations ?? [],
        },
      ]);
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
    if (!topic || !contextFiles.length) {
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
      const response = await fetch("/api/study/learn-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.title,
          item,
          files: contextFiles,
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
      const response = await fetch("/api/study/exam-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.title,
          files: contextFiles,
          ...modelPayload,
        }),
      });

      if (!response.ok) {
        setExamMode(null);
        return;
      }

      const data = (await response.json()) as ExamModeApiResponse;
      setExamMode(data);
    } finally {
      setExamModeLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
        <p className="text-neutral-400">Loading topic...</p>
      </div>
    );
  }

  if (!topic || !studyData || !strategy) {
    return (
      <div className="min-h-screen bg-[#050505] text-white selection:bg-indigo-500/30 overflow-hidden relative">
        <AppTopNav strategyId={strategyId} topicSlug={topicSlug} />
        <div className="relative z-10 pt-20">
          <StrategyRecoveryView
            title="Study context missing"
            message={recoveryMessage ?? "Open a recent strategy or create a new one to continue studying."}
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
      : `/strategy?id=${strategyId}`;
  const nextLabel = nextFlow.recommendedNextTopic
    ? "🔥 Recommended Next Topic"
    : nextFlow.nextTopicInChapter
    ? "Continue Chapter"
    : nextFlow.nextChapterStart
      ? "Start Next Chapter"
      : "Back to Strategy";
  const hasNextStep = Boolean(nextFlow.recommendedNextTopic || nextFlow.nextTopicInChapter || nextFlow.nextChapterStart);

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-indigo-500/30 overflow-hidden relative pb-28">
      <AppTopNav strategyId={strategyId} topicSlug={topicSlug} />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.15, 0.3, 0.15] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-[10%] -left-[10%] w-[60%] h-[60%] rounded-full bg-indigo-500/20 blur-[120px]"
        />
      </div>

      <div className="relative z-10 mx-auto max-w-[1400px] px-4 md:px-6 pt-24 pb-16 md:pt-28 md:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-5 items-start">
          <div className="lg:col-span-7 space-y-5 max-h-[calc(100vh-12rem)] overflow-y-auto pr-1">
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

          <div className="lg:col-span-3 lg:sticky lg:top-6">
            <Card className="bg-white/5 border border-white/10 backdrop-blur-xl shadow-2xl rounded-3xl h-[calc(100vh-10rem)] flex flex-col">
              <CardHeader>
                <CardTitle className="text-white text-xl">Ask about this topic</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-3 overflow-hidden">
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {chatHistory.length ? (
                    chatHistory.map((message) => (
                      <div
                        key={message.id}
                        className={`rounded-xl px-3 py-2 text-sm leading-6 border ${
                          message.role === "user"
                            ? "bg-indigo-500/20 border-indigo-300/40 text-indigo-50"
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
                </div>

                <div className="pt-1">
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
          <Button asChild variant="outline" className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10">
            <Link href={`/strategy?id=${strategyId}`}>Back to Strategy</Link>
          </Button>

          <div className="hidden md:flex items-center">
            {topicProgressLabel ? (
              <span className="text-xs md:text-sm text-neutral-300 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                {topicProgressLabel}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={handleMarkCompleted}
              className="rounded-full bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
              disabled={completed}
            >
              {completed ? "Completed" : "Mark as Completed"}
            </Button>
            <Button
              asChild
              className="rounded-full bg-white text-black hover:bg-neutral-200"
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
