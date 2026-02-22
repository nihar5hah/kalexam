import { generateStrategy } from "@/lib/ai/ai-client";
import {
  ModelConfig,
  StrategyResult,
  SyllabusChapterHint,
  TopicPriority,
  UploadedFile,
  normalizeStrategyResult,
} from "@/lib/ai/types";
import { parseUploadedFiles } from "@/lib/parsing";
import { extractSyllabusChapters } from "@/lib/parsing/exam-intelligence";
import { computeExamLikelihood } from "@/lib/study/exam-likelihood";

export type StrategyPipelineRequest = {
  hoursLeft: number;
  syllabusFiles: UploadedFile[];
  syllabusTextInput?: string;
  studyMaterialFiles: UploadedFile[];
  previousPaperFiles: UploadedFile[];
  modelType?: "gemini" | "custom";
  modelConfig?: {
    baseUrl?: string;
    apiKey?: string;
    modelName?: string;
  } | null;
};

export type StrategyJobStage =
  | "queued"
  | "extracting_text"
  | "analyzing_chapters"
  | "generating_strategy"
  | "preparing_study_content"
  | "complete"
  | "failed";

export type StrategyJobState = {
  id: string;
  userId: string;
  stage: StrategyJobStage;
  progress: number;
  createdAt: number;
  updatedAt: number;
  request: StrategyPipelineRequest;
  result?: StrategyResult;
  error?: string;
};

const strategyJobs = new Map<string, StrategyJobState>();

function parseWeightage(weightage?: string): number {
  if (!weightage) {
    return 0;
  }

  const match = weightage.match(/(\d+(?:\.\d+)?)/);
  if (!match) {
    return 0;
  }

  return Number.parseFloat(match[1]);
}

function topicPriorityScore(priority: TopicPriority): number {
  if (priority === "high") {
    return 3;
  }
  if (priority === "medium") {
    return 2;
  }
  return 1;
}

function chapterPriorityFromHint(hint: SyllabusChapterHint, topics: StrategyResult["topics"]): TopicPriority {
  const topicScore = topics.reduce((score, topic) => score + topicPriorityScore(topic.priority), 0);
  const weightageScore = parseWeightage(hint.weightage);
  const blended = weightageScore + hint.emphasisScore + hint.coverageScore + topicScore;

  if (blended >= 16) {
    return "high";
  }
  if (blended >= 8) {
    return "medium";
  }
  return "low";
}

function hasTokenHit(target: string, chapterTitle: string): boolean {
  const normalized = target.toLowerCase();
  const tokens = chapterTitle
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 3);

  return tokens.some((token) => normalized.includes(token));
}

function toChapterTime(priority: TopicPriority, topicCount: number): string {
  const count = Math.max(topicCount, 1);
  if (priority === "high") {
    return `${Math.max(2, count)}-${Math.max(3, count + 1)} hours`;
  }
  if (priority === "medium") {
    return `${Math.max(1, count)}-${Math.max(2, count)} hours`;
  }
  return "45-90 min";
}

function mapWithChapterHints(
  result: StrategyResult,
  chapterHints: SyllabusChapterHint[],
  previousPaperText: string,
  allFiles: UploadedFile[]
): StrategyResult {
  if (!chapterHints.length) {
    return result;
  }

  const hints = [...chapterHints].sort((a, b) => a.chapterNumber - b.chapterNumber);
  const mappedTopics = result.topics.map((topic) => {
    if (topic.chapterNumber && hints.some((hint) => hint.chapterNumber === topic.chapterNumber)) {
      const matchedHint = hints.find((hint) => hint.chapterNumber === topic.chapterNumber);
      return {
        ...topic,
        chapterTitle: matchedHint?.chapterTitle ?? topic.chapterTitle,
      };
    }

    const topicText = `${topic.title} ${topic.explanation}`.toLowerCase();
    const scoredHints = hints
      .map((hint) => {
        const tokens = hint.chapterTitle
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((token) => token.length > 3);
        const score = tokens.reduce(
          (sum, token) => (topicText.includes(token) ? sum + 1 : sum),
          0
        );
        return { hint, score };
      })
      .sort((a, b) => b.score - a.score || a.hint.chapterNumber - b.hint.chapterNumber);

    const bestHint = scoredHints[0]?.hint ?? hints[0];
    return {
      ...topic,
      chapterNumber: bestHint.chapterNumber,
      chapterTitle: bestHint.chapterTitle,
    };
  });

  const chapters = hints.map((hint) => {
    const chapterTopics = mappedTopics.filter((topic) => topic.chapterNumber === hint.chapterNumber);
    const priority = chapterPriorityFromHint(hint, chapterTopics);
    const likelihood = computeExamLikelihood({
      appearsInPreviousPaper: hasTokenHit(previousPaperText, hint.chapterTitle),
      appearsInQuestionBank: allFiles.some((file) => file.name.toLowerCase().includes("question bank")),
      repeatedInStudyMaterial: hint.coverageScore >= 2,
      syllabusCoreTopic: hint.emphasisScore >= 2,
      highChapterWeightage: parseWeightage(hint.weightage) >= 15,
    });

    return {
      chapterNumber: hint.chapterNumber,
      chapterTitle: hint.chapterTitle,
      weightage: hint.weightage,
      materialCoverage: hint.materialCoveragePercent,
      lowMaterialConfidence: hint.materialCoveragePercent < 40,
      examLikelihoodSummary: {
        highLikelihoodQuestions: chapterTopics.filter((topic) => topic.priority === "high").length,
        averageLikelihood: likelihood.score,
      },
      materialWarning: hint.materialAvailable ? undefined : "Material not uploaded for this chapter.",
      priority,
      estimatedTime: toChapterTime(priority, chapterTopics.length),
      topics: hint.materialAvailable ? chapterTopics : [],
    };
  });

  const activeChapters = chapters.filter((chapter) => chapter.topics.length || chapter.materialWarning);

  return {
    ...result,
    schemaVersion: 2,
    topics: activeChapters.flatMap((chapter) => chapter.topics),
    chapters: activeChapters,
  };
}

function getModelLabel(body: StrategyPipelineRequest): string {
  if (body.modelType === "custom") {
    return body.modelConfig?.modelName ?? "Custom Model";
  }

  return process.env.GEMINI_MODEL ?? "Gemini";
}

function toModelConfig(body: StrategyPipelineRequest): ModelConfig {
  if (body.modelType === "custom") {
    if (!body.modelConfig?.baseUrl || !body.modelConfig?.apiKey || !body.modelConfig?.modelName) {
      throw new Error("Missing custom model configuration");
    }

    return {
      modelType: "custom",
      config: {
        baseUrl: body.modelConfig.baseUrl,
        apiKey: body.modelConfig.apiKey,
        modelName: body.modelConfig.modelName,
      },
    };
  }

  return { modelType: "gemini" };
}

function updateJob(jobId: string, patch: Partial<StrategyJobState>) {
  const current = strategyJobs.get(jobId);
  if (!current) {
    return;
  }

  strategyJobs.set(jobId, {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  });
}

async function runStrategyPipeline(jobId: string) {
  const job = strategyJobs.get(jobId);
  if (!job) {
    return;
  }

  try {
    const body = job.request;
    const syllabusFiles = body.syllabusFiles ?? [];
    const syllabusTextInput = body.syllabusTextInput?.trim() ?? "";
    const studyMaterialFiles = body.studyMaterialFiles ?? [];
    const previousPaperFiles = body.previousPaperFiles ?? [];

    if (!body.hoursLeft || body.hoursLeft <= 0) {
      throw new Error("Invalid hoursLeft");
    }

    if ((!syllabusFiles.length && !syllabusTextInput) || !studyMaterialFiles.length) {
      throw new Error("Provide syllabus files or syllabus text, and at least one study material file.");
    }

    const modelConfig = toModelConfig(body);
    const allFiles = [...syllabusFiles, ...studyMaterialFiles, ...previousPaperFiles];

    updateJob(jobId, { stage: "extracting_text", progress: 45 });
    const parsed = await parseUploadedFiles(allFiles);
    const mergedSyllabusText = [parsed.syllabusText, syllabusTextInput].filter(Boolean).join("\n\n").trim();
    const chapterHints = extractSyllabusChapters(mergedSyllabusText, parsed.materialText);

    updateJob(jobId, { stage: "analyzing_chapters", progress: 62 });
    const modelLabel = getModelLabel(body);

    updateJob(jobId, { stage: "generating_strategy", progress: 78 });
    const strategy = await generateStrategy(
      {
        hoursLeft: body.hoursLeft,
        extractedTexts: {
          syllabusText: mergedSyllabusText,
          materialText: parsed.materialText,
          previousPaperText: parsed.previousPaperText,
        },
        examIntelligence: {
          repeatedTopics: parsed.repeatedTopics,
        },
        chapterHints,
        fileWarnings: parsed.warnings,
      },
      modelConfig
    );

    const normalized = normalizeStrategyResult(strategy, body.hoursLeft, modelLabel);

    updateJob(jobId, { stage: "preparing_study_content", progress: 90 });
    const chapterMapped = mapWithChapterHints(normalized, chapterHints, parsed.previousPaperText, allFiles);

    updateJob(jobId, {
      stage: "complete",
      progress: 100,
      result: {
        ...chapterMapped,
        modelUsed: modelLabel,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate strategy";
    updateJob(jobId, {
      stage: "failed",
      progress: 100,
      error: message,
    });
  }
}

export function createStrategyJob(userId: string, request: StrategyPipelineRequest): StrategyJobState {
  const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const now = Date.now();

  const created: StrategyJobState = {
    id,
    userId,
    stage: "queued",
    progress: 35,
    createdAt: now,
    updatedAt: now,
    request,
  };

  strategyJobs.set(id, created);
  void runStrategyPipeline(id);

  return created;
}

export function getStrategyJob(jobId: string): StrategyJobState | null {
  return strategyJobs.get(jobId) ?? null;
}
