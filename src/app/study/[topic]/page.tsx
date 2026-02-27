"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

import { AuthenticatedNavBar } from "@/components/AuthenticatedNavBar";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { RequireAuth } from "@/components/RequireAuth";
import { StrategyRecoveryView } from "@/components/StrategyRecoveryView";
import { StudySourcesCard } from "@/components/study/StudySourcesCard";
import { StudyTopicHero } from "@/components/study/StudyTopicHero";
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
import {
  StudySourceRecord,
  listStudySources,
  removeStudySource,
  setStudySourceEnabled,
  updateStudySourceChunkCount,
  upsertStudySource,
} from "@/lib/firestore/sources";
import { appendIndexedChunks, replaceIndexedChunks } from "@/lib/firestore/chunks";
import { FALLBACK_MESSAGE } from "@/lib/study/constants";
import {
  isFallbackLikeChatPayload,
  isFallbackLikeLearnPayload,
  isFallbackLikeTopicPayload,
} from "@/lib/study/fallback-detection";

const DesktopStudyChatPanel = dynamic(
  () => import("@/components/study/StudyChatPanel").then((module) => module.DesktopStudyChatPanel),
  { ssr: false },
);

const MobileStudyChatPanel = dynamic(
  () => import("@/components/study/StudyChatPanel").then((module) => module.MobileStudyChatPanel),
  { ssr: false },
);

const StudyKeyExamCard = dynamic(
  () => import("@/components/study/StudyKeyExamCard").then((module) => module.StudyKeyExamCard),
  { ssr: false },
);

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
  usedVideoContext?: boolean;
  retrievedChunks?: Array<{ sourceName: string; sourceType: string; score: number; selected: boolean }>;
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
  retrievedChunks?: Array<{ sourceName: string; sourceType: string; score: number; selected: boolean }>;
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
  retrievedChunks?: Array<{ sourceName: string; sourceType: string; score: number; selected: boolean }>;
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
  retrievedChunks?: Array<{ sourceName: string; sourceType: string; score: number; selected: boolean }>;
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
  usedVideoContext?: boolean;
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

type SourceIndexResponse = {
  error?: string;
  detail?: string;
  warnings?: string[];
  sources: Array<{
    id: string;
    type: "pdf" | "ppt" | "docx" | "text" | "youtube" | "url";
    title: string;
    status: "indexed" | "error";
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
  }>;
  chunks: Array<{
    sourceId: string;
    text: string;
    sourceType: "Previous Paper" | "Question Bank" | "Study Material" | "Syllabus Derived";
    sourceName: string;
    sourceYear?: string;
    section: string;
  }>;
};

type StreamEnvelope<TPayload> =
  | { type: "started" }
  | { type: "delta"; chunk?: string }
  | { type: "done"; payload?: TPayload }
  | { type: "error"; message?: string };

const STUDY_CACHE_SCHEMA_VERSION = "v3";

type SourceAddStatus =
  | "idle"
  | "validating"
  | "fetching"
  | "fetching-transcript"
  | "fetching-metadata"
  | "ai-reconstruction"
  | "extracting"
  | "chunking"
  | "indexing"
  | "completed"
  | "failed";
type SourceIndexLifecycle = "idle" | "preparing" | "parsing" | "chunking" | "indexing" | "saving" | "completed" | "failed";

const INDEXED_CHUNKS_SESSION_CACHE_KEY = "kalexam:indexed-chunks";

function sourceTypeFromFileExtension(extension: string): StudySourceRecord["type"] {
  const normalized = extension.toLowerCase().replace(".", "");
  if (normalized === "pdf") return "pdf";
  if (normalized === "docx") return "docx";
  if (normalized === "ppt" || normalized === "pptx") return "ppt";
  return "text";
}

function toContextSourceRecord(file: UploadedFile): StudySourceRecord {
  return {
    id: `uploaded:${file.name}:${file.url}`,
    type: sourceTypeFromFileExtension(file.extension),
    title: file.name,
    status: "indexed",
    enabled: true,
    fileUrl: file.url,
    chunkCount: 0,
  };
}

function mergeSessionSources(base: StudySourceRecord[], contextFiles: UploadedFile[]): StudySourceRecord[] {
  if (!contextFiles.length) {
    return base;
  }

  const merged = [...base];
  const existingKeys = new Set(base.map((source) => `${source.title.toLowerCase()}::${source.fileUrl ?? ""}`));

  for (const file of contextFiles) {
    const key = `${file.name.toLowerCase()}::${file.url}`;
    if (!existingKeys.has(key)) {
      merged.push(toContextSourceRecord(file));
    }
  }

  return merged;
}

function buildChunkCountMap(
  chunks: SourceIndexResponse["chunks"],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const chunk of chunks) {
    counts.set(chunk.sourceId, (counts.get(chunk.sourceId) ?? 0) + 1);
  }
  return counts;
}

function cacheIndexedChunksInSession(
  strategyId: string,
  chunks: SourceIndexResponse["chunks"],
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    sessionStorage.setItem(`${INDEXED_CHUNKS_SESSION_CACHE_KEY}:${strategyId}`, JSON.stringify({
      cachedAt: Date.now(),
      chunks,
    }));
  } catch {
    // best effort cache fallback
  }
}

async function syncSourceChunkCounts(
  uid: string,
  strategyId: string,
  sources: SourceIndexResponse["sources"],
  chunks: SourceIndexResponse["chunks"],
) {
  const counts = buildChunkCountMap(chunks);
  for (const source of sources) {
    const count = counts.get(source.id) ?? source.chunkCount ?? 0;
    await updateStudySourceChunkCount(uid, strategyId, source.id, count);
  }
}

function humanizeSourceError(raw: string): string {
  const value = raw.toLowerCase();
  if (value.includes("transcript") && (value.includes("disabled") || value.includes("unavailable"))) {
    return "Video has no captions — generating AI study version…";
  }
  if (value.includes("timed out") || value.includes("abort")) {
    return "Analyzing video structure is taking longer than expected. Please retry.";
  }
  if (value.includes("permission_denied")) {
    return "Could not save source metadata. Please try again.";
  }
  if (value.includes("missing or insufficient permissions")) {
    return "Could not save source metadata. Please try again.";
  }
  if (value.includes("invalid youtube")) {
    return "This YouTube URL looks invalid. Please check and retry.";
  }
  return "Could not process this source right now. Please retry.";
}

function isPermissionError(raw: string): boolean {
  const value = raw.toLowerCase();
  return value.includes("permission_denied") || value.includes("missing or insufficient permissions");
}

async function readSourceIndexError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return `Server error ${response.status}`;
  }

  try {
    const parsed = JSON.parse(text) as { error?: string; detail?: string };
    return parsed.detail || parsed.error || `Server error ${response.status}`;
  } catch {
    return text;
  }
}

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

async function readSseResponse<TPayload>(
  response: Response,
  onEvent: (event: StreamEnvelope<TPayload>) => void,
): Promise<void> {
  const stream = response.body;
  if (!stream) {
    throw new Error("Missing response stream");
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const line = frame
        .split("\n")
        .find((entry) => entry.startsWith("data:"));

      if (!line) {
        continue;
      }

      const raw = line.slice(5).trim();
      if (!raw) {
        continue;
      }

      try {
        const event = JSON.parse(raw) as StreamEnvelope<TPayload>;
        onEvent(event);
      } catch {
        // ignore malformed chunk
      }
    }
  }
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
  const router = useRouter();
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
  const [sessionExamDate, setSessionExamDate] = useState<string | null>(null);
  const [topicCompletionMap, setTopicCompletionMap] = useState<Record<string, boolean>>({});

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
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [sourceTruthVersion, setSourceTruthVersion] = useState(0);
  const [sources, setSources] = useState<StudySourceRecord[]>([]);
  const [sourceAddStatus, setSourceAddStatus] = useState<SourceAddStatus>("idle");
  const sourcesBackfillAttemptedRef = useRef(false);
  const [, setSourceIndexLifecycle] = useState<SourceIndexLifecycle>("idle");

  const getAuthHeaders = useCallback(async () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (user) {
      const token = await user.getIdToken();
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }, [user]);

  const setIndexLifecycle = useCallback((state: SourceIndexLifecycle) => {
    setSourceIndexLifecycle(state);
    console.info("[sources:index-lifecycle]", state);
  }, []);

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
      setRecoveryMessage(null);

      const initialTopicCompletion = normalized.topics.reduce<Record<string, boolean>>((accumulator, item) => {
        accumulator[item.slug] = Boolean(stored.studyProgress?.[item.slug]?.completed);
        return accumulator;
      }, {});

      const session = await getStudySessionByStrategyId(user.uid, strategyId);
      if (session) {
        setSessionExamDate(session.data.examDate ?? null);

        for (const [slug, progress] of Object.entries(session.data.topicProgress ?? {})) {
          initialTopicCompletion[slug] = progress?.status === "completed";
        }
      }

      setTopicCompletionMap(initialTopicCompletion);

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
        cacheEntry.schemaVersion === STUDY_CACHE_SCHEMA_VERSION &&
        !isFallbackLikeTopicPayload(cacheEntry.content)
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
        headers: await getAuthHeaders(),
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
          userId: user.uid,
          strategyId,
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
  }, [strategyId, topicSlug, user, getAuthHeaders]);

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

  useEffect(() => {
    async function loadSources() {
      if (!user || !strategyId) {
        return;
      }

      try {
        const loaded = await listStudySources(user.uid, strategyId);
        setSources(mergeSessionSources(loaded, contextFiles));
      } catch {
        setSources(mergeSessionSources([], contextFiles));
      }
    }

    void loadSources();
  }, [contextFiles, strategyId, user]);

  useEffect(() => {
    async function backfillSources() {
      if (!user || !strategyId) {
        return;
      }
      if (sourcesBackfillAttemptedRef.current) {
        return;
      }
      if (sources.length > 0) {
        sourcesBackfillAttemptedRef.current = true;
        return;
      }
      if (!contextFiles.length) {
        return;
      }

      sourcesBackfillAttemptedRef.current = true;

      const toastId = toast.loading("Indexing your uploaded files…");
      let attempts = 0;
      const maxRetries = 1;
      let indexed = false;
      let lastErrorMessage = "Could not index uploaded files";

      while (!indexed && attempts <= maxRetries) {
        attempts += 1;

        if (attempts > 1) {
          toast.message("Could not index files. Retrying automatically…", { id: toastId });
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        try {
          setIndexLifecycle("preparing");
          setIndexLifecycle("parsing");
          const response = await fetch("/api/sources/index", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              files: contextFiles,
              syllabusTextInput: "",
              youtubeUrls: [],
              websiteUrls: [],
            }),
          });

          if (!response.ok) {
            throw new Error(await readSourceIndexError(response));
          }

          const payload = (await response.json()) as SourceIndexResponse;
          setIndexLifecycle("chunking");

          if (!payload.chunks.length) {
            throw new Error("Parser produced zero chunks");
          }

          setIndexLifecycle("saving");
          try {
            for (const source of payload.sources) {
              await upsertStudySource(user.uid, strategyId, {
                id: source.id,
                type: source.type,
                title: source.title,
                status: source.status,
                enabled: source.enabled,
                fileUrl: source.fileUrl,
                youtubeUrl: source.youtubeUrl,
                websiteUrl: source.websiteUrl,
                videoId: source.videoId,
                aiGeneratedTranscript: source.aiGeneratedTranscript,
                transcriptSource: source.transcriptSource,
                videoLanguage: source.videoLanguage,
                translatedToEnglish: source.translatedToEnglish,
                chunkCount: source.chunkCount,
                errorMessage: source.errorMessage,
              });
            }

            setIndexLifecycle("indexing");
            try {
              await replaceIndexedChunks(
                user.uid,
                strategyId,
                payload.chunks.map((chunk) => ({
                  sourceId: chunk.sourceId,
                  text: chunk.text,
                  sourceType: chunk.sourceType,
                  sourceName: chunk.sourceName,
                  sourceYear: chunk.sourceYear,
                  section: chunk.section,
                })),
              );
            } catch (chunkError) {
              const chunkMessage = chunkError instanceof Error ? chunkError.message : "Index write failed";
              if (isPermissionError(chunkMessage)) {
                throw new Error(chunkMessage);
              }

              cacheIndexedChunksInSession(strategyId, payload.chunks);
              toast.warning("Index writes failed — using session cache fallback", {
                id: toastId,
                description: "Sources remain usable in this session.",
              });
            }

            try {
              await syncSourceChunkCounts(user.uid, strategyId, payload.sources, payload.chunks);
            } catch (syncError) {
              const syncMessage = syncError instanceof Error ? syncError.message : "Chunk count sync failed";
              if (isPermissionError(syncMessage)) {
                throw new Error(syncMessage);
              }
            }
          } catch (writeError) {
            const writeMessage = writeError instanceof Error ? writeError.message : "Could not save source metadata";
            throw new Error(`Could not save indexed sources: ${writeMessage}`);
          }

          setIndexLifecycle("completed");
          const loaded = await listStudySources(user.uid, strategyId);
          const merged = mergeSessionSources(loaded, contextFiles);
          setSources(merged);
          toast.success("Sources indexed", {
            id: toastId,
            description: `${merged.length} source${merged.length === 1 ? "" : "s"} ready`,
          });
          indexed = true;
        } catch (error) {
          lastErrorMessage = error instanceof Error ? error.message : "Could not index uploaded files";
          setIndexLifecycle("failed");
        }
      }

      if (!indexed) {
        toast.error("Could not index files. Retrying automatically…", {
          id: toastId,
          description: `${humanizeSourceError(lastErrorMessage)} Using direct file parsing fallback. Study session still works.`,
        });
        setSources(mergeSessionSources([], contextFiles));
      }
    }

    void backfillSources();
  }, [contextFiles, setIndexLifecycle, sources.length, strategyId, user]);

  const handleToggleSource = useCallback(async (sourceId: string, enabled: boolean) => {
    if (!user || !strategyId || !topic) {
      return;
    }

    setSources((current) =>
      current.map((item) => (item.id === sourceId ? { ...item, enabled } : item)),
    );

    try {
      await setStudySourceEnabled(user.uid, strategyId, sourceId, enabled);
      setSourceTruthVersion((current) => current + 1);
      setChatHistory([]);
      setQuickActions({
        difference: { loading: false, content: "" },
        example: { loading: false, content: "" },
        examQuestion: { loading: false, content: "" },
        explainSimply: { loading: false, content: "" },
      });
      setLearnedItems({});
      setMicroQuizzes({});
      setExamMode(null);
      setExpandedOriginalQuestions({});
      setMobileChatOpen(false);

      if (contextFiles.length) {
        const examTimeRemaining = formatExamTimeRemaining(sessionExamDate, strategy?.strategySummary?.hoursLeft);
        const refreshed = await fetch("/api/study/topic", {
          method: "POST",
          headers: await getAuthHeaders(),
          body: JSON.stringify({
            topic: topic.title,
            priority: topic.priority,
            outlineOnly: false,
            files: contextFiles,
            currentChapter: topic.chapterTitle,
            examTimeRemaining,
            studyMode: "learn",
            examMode: false,
            userIntent: "topic overview and exam-focused summary",
            userId: user.uid,
            strategyId,
            ...modelPayload,
          }),
        });

        if (refreshed.ok) {
          const refreshedData = (await refreshed.json()) as TopicStudyApiResponse;
          setStudyData(refreshedData);
        }
      }

      toast.info("Sources updated — all content refreshed.");
    } catch {
      setSources((current) =>
        current.map((item) => (item.id === sourceId ? { ...item, enabled: !enabled } : item)),
      );
    }
  }, [user, strategyId, topic, contextFiles, sessionExamDate, strategy, modelPayload, getAuthHeaders]);

  const handleRemoveSource = useCallback(async (sourceId: string) => {
    if (!user || !strategyId) {
      return;
    }

    setSources((prev) => {
      const previous = prev;
      void (async () => {
        try {
          await removeStudySource(user.uid, strategyId, sourceId);
        } catch {
          setSources(previous);
        }
      })();
      return prev.filter((item) => item.id !== sourceId);
    });
  }, [user, strategyId]);

  const handleAddSourceFromUrl = useCallback(async (url: string, attempt = 0) => {
    if (!user || !strategyId) {
      return;
    }

    const raw = url.trim();
    if (!raw) {
      return;
    }

    const isHttp = raw.startsWith("http://") || raw.startsWith("https://");
    const isYouTube = isHttp && (raw.includes("youtube.com") || raw.includes("youtu.be"));
    const youtubeProgressToastId = isYouTube ? toast.loading("Fetching transcript…") : undefined;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    setSourceAddStatus("validating");
    try {
      setSourceAddStatus(isYouTube ? "fetching-transcript" : "fetching");
      if (youtubeProgressToastId) {
        toast.message("Fetching transcript…", { id: youtubeProgressToastId });
      }
      const response = await fetch("/api/sources/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          files: [],
          syllabusTextInput: isHttp ? "" : raw,
          youtubeUrls: isYouTube ? [raw] : [],
          websiteUrls: isHttp && !isYouTube ? [raw] : [],
        }),
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const msg = humanizeSourceError(await readSourceIndexError(response));
        if (attempt < 1) {
          toast.message("Could not index files. Retrying automatically…", { description: msg });
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return handleAddSourceFromUrl(raw, attempt + 1);
        }
        toast.error("Could not add source", { description: msg });
        setSourceAddStatus("failed");
        setTimeout(() => setSourceAddStatus("idle"), 3000);
        return;
      }

      setSourceAddStatus(isYouTube ? "fetching-metadata" : "extracting");
      if (youtubeProgressToastId) {
        toast.message("Analyzing video structure…", { id: youtubeProgressToastId });
      }
      setSourceAddStatus("indexing");
      if (youtubeProgressToastId) {
        toast.message("Indexing…", { id: youtubeProgressToastId });
      }
      const payload = (await response.json()) as SourceIndexResponse;

      const usedAiReconstruction = payload.sources.some(
        (source) => source.type === "youtube" && source.status === "indexed" &&
          (source.transcriptSource === "ai-reconstructed" || source.aiGeneratedTranscript),
      );
      if (isYouTube && usedAiReconstruction) {
        setSourceAddStatus("ai-reconstruction");
        if (youtubeProgressToastId) {
          toast.message("Building study notes from video…", { id: youtubeProgressToastId });
        }
      }

      setSourceAddStatus("chunking");

      if (!payload.chunks.length) {
        throw new Error("Parser produced zero chunks");
      }

      // Warn about any individual source errors
      for (const source of payload.sources) {
        if (source.status === "error" && source.errorMessage) {
          toast.warning(source.title || "Source error", { description: source.errorMessage });
        }
      }

      const goodSources = payload.sources.filter((s) => s.status !== "error");
      if (!goodSources.length) {
        if (attempt < 1) {
          toast.message("Could not index files. Retrying automatically…");
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return handleAddSourceFromUrl(raw, attempt + 1);
        }
        setSourceAddStatus("failed");
        setTimeout(() => setSourceAddStatus("idle"), 3000);
        return;
      }

      if (isYouTube && usedAiReconstruction) {
        toast.message("Video has no captions — generating AI study version…", {
          id: youtubeProgressToastId,
        });
      }

      try {
        for (const source of payload.sources) {
          await upsertStudySource(user.uid, strategyId, {
            id: source.id,
            type: source.type,
            title: source.title,
            status: source.status,
            enabled: source.enabled,
            fileUrl: source.fileUrl,
            youtubeUrl: source.youtubeUrl,
            websiteUrl: source.websiteUrl,
            videoId: source.videoId,
            aiGeneratedTranscript: source.aiGeneratedTranscript,
            transcriptSource: source.transcriptSource,
            videoLanguage: source.videoLanguage,
            translatedToEnglish: source.translatedToEnglish,
            chunkCount: source.chunkCount,
            errorMessage: source.errorMessage,
          });
        }

        try {
          await appendIndexedChunks(
            user.uid,
            strategyId,
            payload.chunks.map((chunk) => ({
              sourceId: chunk.sourceId,
              text: chunk.text,
              sourceType: chunk.sourceType,
              sourceName: chunk.sourceName,
              sourceYear: chunk.sourceYear,
              section: chunk.section,
            })),
          );
        } catch (chunkError) {
          const chunkMessage = chunkError instanceof Error ? chunkError.message : "Index write failed";
          if (isPermissionError(chunkMessage)) {
            throw new Error(chunkMessage);
          }

          cacheIndexedChunksInSession(strategyId, payload.chunks);
          toast.warning("Index writes failed — using session cache fallback", {
            id: youtubeProgressToastId,
            description: "Source is still available for this session.",
          });
        }

        try {
          await syncSourceChunkCounts(user.uid, strategyId, payload.sources, payload.chunks);
        } catch (syncError) {
          const syncMessage = syncError instanceof Error ? syncError.message : "Chunk count sync failed";
          if (isPermissionError(syncMessage)) {
            throw new Error(syncMessage);
          }
        }
      } catch (writeError) {
        const message = writeError instanceof Error ? humanizeSourceError(writeError.message) : "Could not save source metadata";
        toast.error("Could not save source data", {
          id: youtubeProgressToastId,
          description: message,
        });
        setSourceAddStatus("failed");
        setTimeout(() => setSourceAddStatus("idle"), 3000);
        return;
      }

      const refreshed = await listStudySources(user.uid, strategyId);
      setSources(mergeSessionSources(refreshed, contextFiles));
      setSourceAddStatus("completed");
      toast.success("Source added", {
        id: youtubeProgressToastId,
        description: goodSources[0]?.title ?? "Ready to use in your study session",
      });
      setTimeout(() => setSourceAddStatus("idle"), 2000);
    } catch (err) {
      clearTimeout(timeout);
      const isAbort = err instanceof Error && err.name === "AbortError";
      if (attempt < 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return handleAddSourceFromUrl(raw, attempt + 1);
      }
      toast.error(
        isYouTube ? "Could not process this video" : "Could not add source",
        {
          id: youtubeProgressToastId,
          description: isAbort
            ? "Building study notes from video took too long. Please retry."
            : (isYouTube
              ? "All processing methods failed for this video. Please try a different URL."
              : err instanceof Error
                ? humanizeSourceError(err.message)
                : "Could not process this source right now. Please retry."),
        },
      );
      setSourceAddStatus("failed");
      setTimeout(() => setSourceAddStatus("idle"), 3000);
    }
  }, [contextFiles, strategyId, user]);

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
      };
    }

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

    return { nextTopicInChapter, nextChapterStart };
  }, [activeChapter, strategy, topic]);

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
    const completedCount = Object.values(topicCompletionMap).filter(Boolean).length;
    return {
      completed: completedCount,
      total,
      percent: total ? Math.round((completedCount / total) * 100) : 0,
    };
  }, [strategy, topicCompletionMap]);

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
        headers: await getAuthHeaders(),
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
          userId: user.uid,
          strategyId,
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

  const handleAsk = useCallback(async (overrideQuestion?: string) => {
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
      .join("|")}:source-truth:${sourceTruthVersion}`;

    const modelKey = getModelCacheKey(modelPayload);
    const cacheKey = `${topic.slug}:${resolvedQuestion}:${modelKey}:source-truth:${sourceTruthVersion}`;

    const cachedChat = await getChatCacheFromSession(
      user.uid,
      strategyId,
      cacheKey,
      fileSignature,
      STUDY_CACHE_SCHEMA_VERSION,
    );

    if (cachedChat && !isFallbackLikeChatPayload(cachedChat)) {
      setChatHistory((current) => [
        ...current,
        {
          id: `${Date.now()}-assistant`,
          role: "assistant",
          content: cachedChat.answer,
          confidence: cachedChat.confidence,
          citations: cachedChat.citations as SourceCitation[],
          usedVideoContext: cachedChat.usedVideoContext,
        },
      ]);
      void recordAiTelemetryInSession(user.uid, strategyId, {
        taskType: "chat_follow_up",
        modelUsed: cachedChat.model ?? "cache",
        latencyMs: 0,
        cacheHit: true,
        fallbackTriggered: false,
        usedVideoContext: Boolean(cachedChat.usedVideoContext),
      });
      setAsking(false);
      return;
    }

    try {
      const examTimeRemaining = formatExamTimeRemaining(sessionExamDate, strategy?.strategySummary?.hoursLeft);
      const response = await fetch("/api/study/ask", {
        method: "POST",
        headers: await getAuthHeaders(),
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
          userId: user.uid,
          strategyId,
          stream: true,
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

      const isSse = response.headers.get("content-type")?.includes("text/event-stream");
      const assistantId = `${Date.now()}-assistant`;
      let streamedAnswer = "";
      let data: TopicAskApiResponse | null = null;

      setChatHistory((current) => [
        ...current,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          confidence: "low",
          citations: [],
        },
      ]);

      if (isSse) {
        await readSseResponse<TopicAskApiResponse>(response, (event) => {
          if (event.type === "delta" && event.chunk) {
            streamedAnswer += event.chunk;
            setChatHistory((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      content: streamedAnswer,
                    }
                  : message,
              ),
            );
            return;
          }

          if (event.type === "done" && event.payload) {
            data = event.payload;
          }
        });
      } else {
        data = (await response.json()) as TopicAskApiResponse;
      }

      const finalData: TopicAskApiResponse = data ?? {
        answer: streamedAnswer || FALLBACK_MESSAGE,
        confidence: "low",
        citations: [],
        usedVideoContext: false,
      };

      const fullAnswer = finalData.answer?.trim() ? finalData.answer : streamedAnswer || FALLBACK_MESSAGE;
      setChatHistory((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: fullAnswer,
                confidence: finalData.confidence,
                citations: finalData.citations ?? [],
                usedVideoContext: finalData.usedVideoContext,
              }
            : message,
        ),
      );

      if (finalData.routingMeta) {
        void recordAiTelemetryInSession(user.uid, strategyId, {
          taskType: finalData.routingMeta.taskType,
          modelUsed: finalData.routingMeta.modelUsed,
          latencyMs: finalData.routingMeta.latencyMs,
          cacheHit: false,
          fallbackTriggered: finalData.routingMeta.fallbackTriggered,
          fallbackReason: finalData.routingMeta.fallbackReason,
          usedVideoContext: Boolean(finalData.usedVideoContext),
        });
      }

      void saveChatCacheToSession(user.uid, strategyId, cacheKey, {
        signature: fileSignature,
        schemaVersion: STUDY_CACHE_SCHEMA_VERSION,
        model: modelKey,
        answer: fullAnswer,
        confidence: finalData.confidence,
        usedVideoContext: finalData.usedVideoContext,
        citations: (finalData.citations ?? []).map((citation) => ({
          sourceType: citation.sourceType,
          sourceName: citation.sourceName,
          sourceYear: citation.sourceYear,
          importanceLevel: citation.importanceLevel,
        })),
      });
    } finally {
      setAsking(false);
    }
  }, [user, strategyId, topic, chatHistory, modelPayload, activeChapter, sessionExamDate, strategy, sourceTruthVersion, getAuthHeaders]);

  const handleMarkCompleted = useCallback(async () => {
    if (!user || !strategyId || !topic) return;

    try {
      const openedAt = topicOpenedAtRef.current ?? Date.now();
      const elapsedSeconds = Math.max(0, Math.round((Date.now() - openedAt) / 1000));

      await Promise.all([
        markTopicCompleted(user.uid, strategyId, topic.slug),
        markTopicCompletedInSession(user.uid, strategyId, topic.slug, elapsedSeconds, 80),
      ]);

      setCompleted(true);
      setTopicCompletionMap((current) => ({
        ...current,
        [topic.slug]: true,
      }));
    } catch {
      // no-op fallback
    }
  }, [user, strategyId, topic]);

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
      const signature = `${STUDY_CACHE_SCHEMA_VERSION}:${contextFiles.map((file) => file.url).join("|")}:source-truth:${sourceTruthVersion}`;
      const answerCacheKey = `${topic.slug}:${item}:source-truth:${sourceTruthVersion}`;
      const cachedLearnAnswer = await getStudyAnswerCacheFromSession(
        user.uid,
        strategyId,
        answerCacheKey,
        signature,
        STUDY_CACHE_SCHEMA_VERSION,
      );

      if (cachedLearnAnswer && !isFallbackLikeLearnPayload(cachedLearnAnswer)) {
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
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          topic: topic.title,
          item,
          files: contextFiles,
          currentChapter: activeChapter?.chapterTitle ?? topic.chapterTitle,
          examTimeRemaining,
          studyMode: "learn_now",
          examMode: false,
          userIntent: item,
          userId: user.uid,
          strategyId,
          stream: true,
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

      const isSse = response.headers.get("content-type")?.includes("text/event-stream");
      let streamedFullAnswer = "";
      let content: LearnItemApiResponse | null = null;

      if (isSse) {
        await readSseResponse<LearnItemApiResponse>(response, (event) => {
          if (event.type === "delta" && event.chunk) {
            streamedFullAnswer += event.chunk;
            setLearnedItems((current) => ({
              ...current,
              [key]: {
                loading: false,
                content: {
                  conceptExplanation: "Generating explanation...",
                  example: "Generating example...",
                  examTip: "Generating exam tip...",
                  typicalExamQuestion: "Generating exam-style question...",
                  fullAnswer: streamedFullAnswer,
                  confidence: "low",
                  citations: [],
                },
              },
            }));
            return;
          }

          if (event.type === "done" && event.payload) {
            content = event.payload;
          }
        });
      } else {
        content = (await response.json()) as LearnItemApiResponse;
      }

      const finalContent: LearnItemApiResponse =
        content ?? {
          conceptExplanation: "Not found in uploaded material.",
          example: "",
          examTip: "Focus on exam language and concise point-wise answers.",
          typicalExamQuestion: `Explain ${item} with exam relevance.`,
          fullAnswer: streamedFullAnswer || "Not found in uploaded material.",
          confidence: "low",
          citations: [],
        };

      void saveStudyAnswerCacheToSession(user.uid, strategyId, answerCacheKey, {
        signature,
        schemaVersion: STUDY_CACHE_SCHEMA_VERSION,
        model: finalContent.routingMeta?.modelUsed ?? getModelCacheKey(modelPayload),
        item,
        answer: {
          conceptExplanation: finalContent.conceptExplanation,
          example: finalContent.example,
          examTip: finalContent.examTip,
          typicalExamQuestion: finalContent.typicalExamQuestion,
          fullAnswer: finalContent.fullAnswer,
          confidence: finalContent.confidence,
          citations: (finalContent.citations ?? []).map((citation) => ({
            sourceType: citation.sourceType,
            sourceName: citation.sourceName,
            sourceYear: citation.sourceYear,
            importanceLevel: citation.importanceLevel,
          })),
        },
      });
      if (finalContent.routingMeta && user && strategyId) {
        void recordAiTelemetryInSession(user.uid, strategyId, {
          taskType: finalContent.routingMeta.taskType,
          modelUsed: finalContent.routingMeta.modelUsed,
          latencyMs: finalContent.routingMeta.latencyMs,
          cacheHit: false,
          fallbackTriggered: finalContent.routingMeta.fallbackTriggered,
          fallbackReason: finalContent.routingMeta.fallbackReason,
        });
      }
      setLearnedItems((current) => ({
        ...current,
        [key]: { loading: false, content: finalContent },
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
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          topic: topic.title,
          files: contextFiles,
          currentChapter: activeChapter?.chapterTitle ?? topic.chapterTitle,
          examTimeRemaining,
          studyMode: "exam_mode",
          examMode: true,
          userIntent: "generate likely exam questions",
          userId: user?.uid,
          strategyId,
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
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          topic: topic.title,
          files: contextFiles,
          count: 4,
          currentChapter: activeChapter?.chapterTitle ?? topic.chapterTitle,
          examTimeRemaining,
          studyMode: "micro_quiz",
          examMode: false,
          userIntent: "generate short quiz",
          userId: user?.uid,
          strategyId,
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
        <AuthenticatedNavBar strategyId={strategyId} topicSlug={topicSlug} hideNavOnMobile />
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

  const nextHref = nextFlow.nextTopicInChapter
    ? `/study/${nextFlow.nextTopicInChapter.slug}?id=${strategyId}`
    : nextFlow.nextChapterStart
      ? `/study/${nextFlow.nextChapterStart.slug}?id=${strategyId}`
      : `/dashboard?id=${strategyId}`;
  const nextLabel = nextFlow.nextTopicInChapter
    ? "Next Topic"
    : nextFlow.nextChapterStart
      ? "Next Chapter"
      : "Back to Dashboard";
  const hasNextStep = Boolean(nextFlow.nextTopicInChapter || nextFlow.nextChapterStart);

  const handleBackToDashboard = () => {
    router.push(strategyId ? `/dashboard?id=${strategyId}` : "/dashboard");
  };

  const handleMoveNext = () => {
    router.push(nextHref);
  };

  return (
    <div className="h-screen w-full max-w-full bg-[#050505] text-white selection:bg-orange-500/20 overflow-x-hidden overflow-y-hidden flex flex-col relative">
      <AuthenticatedNavBar strategyId={strategyId} topicSlug={topicSlug} hideNavOnMobile />
      <div className="h-20 flex-shrink-0 pointer-events-none" aria-hidden="true" />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="hidden md:block absolute -top-[10%] -left-[10%] w-[60%] h-[60%] rounded-full blur-[80px]"
          style={{ background: "radial-gradient(ellipse at center, rgba(249,115,22,0.1) 0%, transparent 70%)" }}
        />
      </div>

      <div className="relative z-10 flex-1 flex min-h-0 overflow-hidden">
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto min-w-0 px-4 md:px-8 pt-6 pb-6 md:pb-10 space-y-4">
            <StudyTopicHero
              topicTitle={topic.title}
              chapterLabel={
                activeChapter
                  ? `Chapter ${activeChapter.chapterNumber}: ${activeChapter.chapterTitle}`
                  : undefined
              }
              estimatedTime={studyData.estimatedTime}
              examLikelihoodScore={studyData.examLikelihoodScore}
              examLikelihoodLabel={studyData.examLikelihoodLabel}
              onBack={handleBackToDashboard}
              onComplete={() => void handleMarkCompleted()}
              onNext={hasNextStep ? handleMoveNext : undefined}
              nextLabel={nextLabel}
              isCompleted={completed}
            />

            <StudySourcesCard
              sources={sources}
              addStatus={sourceAddStatus}
              onAddSource={handleAddSourceFromUrl}
              onToggleSource={handleToggleSource}
              onRemoveSource={handleRemoveSource}
            />

            <Card className="bg-white/5 border border-white/10 backdrop-blur-sm md:backdrop-blur-xl shadow-2xl rounded-3xl">
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

                          {learned?.loading && !learned?.content ? (
                            <div className="mt-3 rounded-xl bg-black/35 border border-white/10 p-3 space-y-3 animate-pulse">
                              <div className="space-y-2">
                                <div className="h-3 w-32 rounded bg-white/10" />
                                <div className="h-3 w-full rounded bg-white/10" />
                                <div className="h-3 w-11/12 rounded bg-white/10" />
                              </div>
                              <div className="space-y-2">
                                <div className="h-3 w-24 rounded bg-white/10" />
                                <div className="h-3 w-10/12 rounded bg-white/10" />
                              </div>
                              <div className="h-3 w-20 rounded bg-white/10" />
                            </div>
                          ) : null}

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
                                    <Badge key={`${source.sourceName}-${sourceIndex}`} className="bg-white/10 text-white border-none text-[11px] rounded-xl whitespace-normal h-auto">
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
                              <Badge key={`${source.sourceName}-${sourceIndex}`} className="bg-white/10 text-white border-none text-[11px] rounded-xl whitespace-normal h-auto">
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
                        <Badge key={`${source.sourceName}-${index}`} className="bg-white/10 text-white border-none text-[11px] rounded-xl whitespace-normal h-auto">
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
                      </div>
                      <p className="mt-2">{quickActions[item.key].content}</p>
                    </div>
                  ))}
              </CardContent>
            </Card>

            <StudyKeyExamCard
              keyExamPoints={studyData.keyExamPoints}
              fallbackMessage={FALLBACK_MESSAGE}
              examMode={examMode}
              confidenceClass={confidenceClass}
            />
          </div>

          <DesktopStudyChatPanel
            chatHistory={chatHistory}
            asking={asking}
            onSubmit={handleAsk}
            chatEndRef={chatEndRef}
          />
        </div>
      </div>

      {/* Desktop bottom navigation bar */}
      <div className="hidden md:flex flex-shrink-0 items-center justify-between gap-4 px-8 py-3 border-t border-white/10 bg-[#050505]/90 backdrop-blur-sm z-20">
        <Button
          type="button"
          variant="ghost"
          onClick={handleBackToDashboard}
          className="flex items-center gap-2 text-neutral-300 hover:text-white hover:bg-white/10 rounded-full px-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>
        <div className="hidden md:flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-neutral-400 tabular-nums">{globalProgress.completed}/{globalProgress.total} topics</span>
                <span className="text-[10px] text-neutral-500">{globalProgress.percent}%</span>
              </div>
              <div className="w-36 h-1 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-orange-500 rounded-full transition-all duration-500" style={{ width: `${globalProgress.percent}%` }} />
              </div>
            </div>
            {topicProgressLabel ? (
              <span className="text-[11px] text-neutral-400 tabular-nums border-l border-white/10 pl-4">
                {topicProgressLabel}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleMarkCompleted()}
            className={cn(
              "relative group flex items-center gap-2 rounded-full border px-5 py-2 text-sm font-medium transition-all duration-200",
              completed
                ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/15"
                : "bg-orange-500/10 border-orange-500/30 text-white hover:bg-orange-500/5"
            )}
          >
            {/* top neon edge */}
            <span className={cn(
              "absolute h-px opacity-0 group-hover:opacity-100 transition-all duration-500 inset-x-0 top-0 bg-gradient-to-r w-3/4 mx-auto",
              completed
                ? "from-transparent via-emerald-500 to-transparent"
                : "from-transparent via-orange-500 to-transparent"
            )} />
            <Check className="h-4 w-4" />
            {completed ? "Completed" : "Mark Complete"}
            {/* bottom neon edge */}
            <span className={cn(
              "absolute group-hover:opacity-30 opacity-0 transition-all duration-500 inset-x-0 h-px -bottom-px bg-gradient-to-r w-3/4 mx-auto",
              completed
                ? "from-transparent via-emerald-500 to-transparent"
                : "from-transparent via-orange-500 to-transparent"
            )} />
          </button>
          {hasNextStep ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleMoveNext}
              className="flex items-center gap-2 rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10 px-5"
            >
              {nextLabel}
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <MobileStudyChatPanel
        open={mobileChatOpen}
        chatHistory={chatHistory}
        asking={asking}
        onSubmit={handleAsk}
        onToggle={() => setMobileChatOpen((current) => !current)}
        onClose={() => setMobileChatOpen(false)}
      />
    </div>
  );
}
