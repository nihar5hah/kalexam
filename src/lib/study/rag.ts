import {
  ModelConfig,
  SourceCitation,
  StudyQuestionCard,
  TopicConfidence,
  TopicPriority,
  UploadedFile,
} from "@/lib/ai/types";
import {
  AiTaskType,
  RoutingMeta,
  generateWithModelRouter,
} from "@/lib/ai/modelRouter";
import { parseUploadedFiles } from "@/lib/parsing";
import { ParsedSourceChunk } from "@/lib/parsing/types";
import { computeExamLikelihood, examLikelihoodLabel } from "@/lib/study/exam-likelihood";
import { FALLBACK_MESSAGE } from "@/lib/study/constants";

const STOP_WORDS = new Set([
  "the",
  "and",
  "with",
  "that",
  "from",
  "this",
  "for",
  "your",
  "have",
  "will",
  "into",
  "are",
  "you",
  "what",
  "when",
  "where",
  "which",
  "about",
  "topic",
  "exam",
  "study",
]);

export type TopicStudyContent = {
  whatToLearn: string[];
  explanation: {
    concept: string;
    simpleExplanation: string;
    example: string;
    examTip: string;
  };
  keyDefinitions: string[];
  differences: Array<{
    conceptA: string;
    conceptB: string;
    definition: string;
    role: string;
    example: string;
    examImportance: string;
  }>;
  examplesFromMaterial: string[];
  examTips: string[];
  typicalExamQuestions: StudyQuestionCard[];
  keyExamPoints: string[];
  confidence: TopicConfidence;
  estimatedTime: string;
  examLikelihoodScore: number;
  examLikelihoodLabel: ReturnType<typeof examLikelihoodLabel>;
  sourceRefs: SourceCitation[];
  materialCoverage: number;
  lowMaterialConfidence: boolean;
  routingMeta?: RoutingMeta;
};

export type TopicAnswer = {
  answer: string;
  confidence: TopicConfidence;
  citations: SourceCitation[];
  routingMeta?: RoutingMeta;
};

export type LearnItemContent = {
  conceptExplanation: string;
  example: string;
  examTip: string;
  typicalExamQuestion: string;
  fullAnswer: string;
  confidence: TopicConfidence;
  citations: SourceCitation[];
  routingMeta?: RoutingMeta;
};

export type ExamModeContent = {
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
  routingMeta?: RoutingMeta;
};

export type MicroQuizQuestion = {
  question: string;
  answer: string;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
};

export type MicroQuizContent = {
  questions: MicroQuizQuestion[];
  citations: SourceCitation[];
  routingMeta?: RoutingMeta;
};

export type StudyGenerationContext = {
  currentChapter?: string;
  examTimeRemaining?: string;
  studyMode?: string;
  examMode?: boolean;
  userIntent?: string;
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function toModelPrompt(
  taskType: AiTaskType,
  modelConfig: ModelConfig,
  prompt: string,
  qualitySignals?: {
    retrievalConfidence?: TopicConfidence;
    minChars?: number;
    requiresJson?: boolean;
  },
  complexityScore?: number,
) {
  return generateWithModelRouter({
    taskType,
    modelConfig,
    prompt,
    complexityScore,
    qualitySignals,
  });
}

function buildContextEnvelope(context?: StudyGenerationContext): string[] {
  if (!context) {
    return [];
  }

  return [
    "Generation context:",
    `- currentChapter: ${context.currentChapter ?? "unknown"}`,
    `- examTimeRemaining: ${context.examTimeRemaining ?? "unknown"}`,
    `- studyMode: ${context.studyMode ?? "learn"}`,
    `- examMode: ${context.examMode ? "on" : "off"}`,
    `- userIntent: ${context.userIntent ?? "general"}`,
  ];
}

function scoreChunk(chunk: string, tokens: string[]): number {
  if (!chunk || !tokens.length) {
    return 0;
  }

  const normalizedChunk = chunk.toLowerCase();
  return tokens.reduce((score, token) => {
    if (!normalizedChunk.includes(token)) {
      return score;
    }

    const exactMatches = normalizedChunk.split(token).length - 1;
    return score + Math.max(1, exactMatches);
  }, 0);
}

function toConfidence(score: number): TopicConfidence {
  if (score >= 10) {
    return "high";
  }
  if (score >= 5) {
    return "medium";
  }
  return "low";
}

function estimateTime(priority: TopicPriority): string {
  if (priority === "high") {
    return "90-120 min";
  }
  if (priority === "medium") {
    return "60-90 min";
  }
  return "30-45 min";
}

function toBulletList(text: string, maxItems: number): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 35)
    .slice(0, maxItems);
}

function defaultWhatToLearn(topic: string): string[] {
  return [
    `${topic}: core definition and meaning`,
    `${topic}: key steps or structure`,
    `${topic}: common exam-style application`,
    `${topic}: frequent mistakes and edge cases`,
    `${topic}: quick revision checklist`,
  ];
}

function defaultKeyExamPoints(topic: string): string[] {
  return [
    `Start with a precise definition of ${topic}.`,
    `Use a short worked example when answering ${topic} questions.`,
    `Write point-wise and align with expected marking scheme.`,
    `Highlight assumptions or conditions before giving the final result.`,
  ];
}

function cleanRetrievedText(input: string): string {
  const normalized = input
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/[•●▪◦]/g, "-")
    .replace(/[�]/g, " ")
    .replace(/([a-zA-Z])\1{5,}/g, "$1")
    .replace(/(\b\w{2,20}\b)(?:\s+\1){3,}/gi, "$1")
    .replace(/[|]{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const lines = normalized
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 20)
    .filter((line) => !/^(page\s*\d+|header|footer|slide\s*\d+)$/i.test(line));

  const seen = new Set<string>();
  const deduped = lines.filter((line) => {
    const key = line.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  return deduped.join("\n\n");
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  const candidate = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? cleaned;

  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toImportanceLevel(sourceType: ParsedSourceChunk["sourceType"]): SourceCitation["importanceLevel"] {
  if (sourceType === "Previous Paper") {
    return "VERY IMPORTANT";
  }
  if (sourceType === "Question Bank") {
    return "IMPORTANT";
  }
  return "SUPPORTING";
}

function toCitation(chunk: ParsedSourceChunk): SourceCitation {
  return {
    sourceType: chunk.sourceType,
    sourceName: chunk.sourceName,
    sourceYear: chunk.sourceYear,
    section: chunk.section,
    importanceLevel: toImportanceLevel(chunk.sourceType),
  };
}

function sourcePriorityBoost(sourceType: ParsedSourceChunk["sourceType"]): number {
  if (sourceType === "Previous Paper") {
    return 8;
  }
  if (sourceType === "Question Bank") {
    return 5;
  }
  if (sourceType === "Study Material") {
    return 3;
  }
  return 1;
}

function parseWeightageScore(sourceName: string): number {
  const match = sourceName.match(/(\d+(?:\.\d+)?)\s*(?:%|marks?)/i);
  if (!match) {
    return 0;
  }

  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) && value >= 15 ? 1 : 0;
}

function hasTokenMatch(text: string, tokens: string[]): boolean {
  const normalized = text.toLowerCase();
  return tokens.some((token) => normalized.includes(token));
}

function extractQuestionLikeLine(text: string): string | undefined {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const directQuestion = sentences.find((line) => line.includes("?"));
  if (directQuestion) {
    return directQuestion.slice(0, 220);
  }

  const questionPattern = sentences.find((line) => /difference between|define|explain|compare/i.test(line));
  return questionPattern?.slice(0, 220);
}

function titleCase(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function buildDifferences(topic: string, context: string): TopicStudyContent["differences"] {
  const candidates: Array<{ conceptA: string; conceptB: string; evidence: string }> = [];
  const sentences = context
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 20);

  const topicVsMatch = topic.match(/(.+?)\s+vs\.?\s+(.+)/i);
  if (topicVsMatch) {
    const conceptA = titleCase(topicVsMatch[1] ?? "");
    const conceptB = titleCase(topicVsMatch[2] ?? "");
    const evidence =
      sentences.find((line) => {
        const lower = line.toLowerCase();
        return lower.includes(conceptA.toLowerCase()) && lower.includes(conceptB.toLowerCase());
      }) ?? "";

    if (conceptA && conceptB && evidence) {
      candidates.push({ conceptA, conceptB, evidence });
    }
  }

  const differenceRegex = /difference between\s+([a-z0-9\-\s]{3,40})\s+and\s+([a-z0-9\-\s]{3,40})/gi;
  const vsRegex = /([a-z0-9\-\s]{3,40})\s+vs\.?\s+([a-z0-9\-\s]{3,40})/gi;

  let match: RegExpExecArray | null = differenceRegex.exec(context.toLowerCase());
  while (match) {
    const conceptA = titleCase(match[1] ?? "");
    const conceptB = titleCase(match[2] ?? "");
    const evidence =
      sentences.find((line) => {
        const lower = line.toLowerCase();
        return lower.includes(conceptA.toLowerCase()) && lower.includes(conceptB.toLowerCase());
      }) ?? "";
    if (conceptA && conceptB && evidence) {
      candidates.push({ conceptA, conceptB, evidence });
    }
    match = differenceRegex.exec(context.toLowerCase());
  }

  match = vsRegex.exec(context.toLowerCase());
  while (match) {
    const conceptA = titleCase(match[1] ?? "");
    const conceptB = titleCase(match[2] ?? "");
    const evidence =
      sentences.find((line) => {
        const lower = line.toLowerCase();
        return lower.includes(conceptA.toLowerCase()) && lower.includes(conceptB.toLowerCase());
      }) ?? "";
    if (conceptA && conceptB && evidence) {
      candidates.push({ conceptA, conceptB, evidence });
    }
    match = vsRegex.exec(context.toLowerCase());
  }

  const seen = new Set<string>();
  return candidates
    .filter((pair) => {
      const key = `${pair.conceptA.toLowerCase()}::${pair.conceptB.toLowerCase()}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 3)
    .map((pair) => ({
      conceptA: pair.conceptA,
      conceptB: pair.conceptB,
      definition: pair.evidence,
      role: pair.evidence,
      example: pair.evidence,
      examImportance: "Use this comparison for difference-based exam questions.",
    }));
}

function normalizeStudyContent(
  value: Record<string, unknown> | null,
  fallbackText: string,
  confidence: TopicConfidence,
  estimatedTime: string,
  sourceRefs: SourceCitation[],
  materialCoverage: number,
  examLikelihoodScore: number
): TopicStudyContent {
  const toArray = (input: unknown) =>
    Array.isArray(input)
      ? input.map((item) => String(item)).filter((item) => item.trim().length > 0).slice(0, 6)
      : [];

  const explanationInput = (value?.explanation ?? {}) as Record<string, unknown>;

  const concept =
    typeof explanationInput.concept === "string" && explanationInput.concept.trim()
      ? explanationInput.concept
      : "Key concept";

  const simpleExplanation =
    typeof explanationInput.simpleExplanation === "string" && explanationInput.simpleExplanation.trim()
      ? explanationInput.simpleExplanation
      : fallbackText;

  const example =
    typeof explanationInput.example === "string" && explanationInput.example.trim()
      ? explanationInput.example
      : "No direct worked example found in uploaded material.";

  const examTip =
    typeof explanationInput.examTip === "string" && explanationInput.examTip.trim()
      ? explanationInput.examTip
      : "Revise definitions and frequently repeated question patterns.";

  return {
    whatToLearn: toArray(value?.whatToLearn),
    explanation: {
      concept,
      simpleExplanation,
      example,
      examTip,
    },
    keyDefinitions: toArray(value?.keyDefinitions),
    differences: [],
    examplesFromMaterial: toArray(value?.examplesFromMaterial),
    examTips: toArray(value?.examTips),
    typicalExamQuestions: [],
    keyExamPoints: toArray(value?.keyExamPoints),
    confidence,
    estimatedTime,
    examLikelihoodScore,
    examLikelihoodLabel: examLikelihoodLabel(examLikelihoodScore),
    sourceRefs,
    materialCoverage,
    lowMaterialConfidence: materialCoverage < 40,
  };
}

async function getTopChunks(files: UploadedFile[], query: string, maxChunks = 4) {
  const parsed = await parseUploadedFiles(files);
  const tokens = tokenize(query);
  const scoredCandidates = parsed.sourceChunks
    .map((chunk) => ({
      chunk,
      score: scoreChunk(chunk.text, tokens) + sourcePriorityBoost(chunk.sourceType),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(maxChunks * 2, 8));

  const seen = new Set<string>();
  const deduped = scoredCandidates.filter((item) => {
    const key = item.chunk.text.toLowerCase().replace(/\s+/g, " ").slice(0, 220);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  const overlapBoost = deduped
    .map((item) => {
      const overlap = tokens.reduce((count, token) => {
        return item.chunk.text.toLowerCase().includes(token) ? count + 1 : count;
      }, 0);
      return {
        ...item,
        score: item.score + overlap * 2,
      };
    })
    .sort((a, b) => b.score - a.score);

  const scored = overlapBoost.slice(0, maxChunks);

  const averageCoverage = parsed.chapters.length
    ? Math.round(
        parsed.chapters.reduce((sum, chapter) => sum + chapter.materialCoveragePercent, 0) /
          parsed.chapters.length,
      )
    : 0;

  const hasQuestionBank = files.some((file) => file.name.toLowerCase().includes("question bank"));
  const hasPreviousPaper = scored.some((item) => item.chunk.sourceType === "Previous Paper");
  const repeatedInMaterial = scored.filter((item) => item.chunk.sourceType === "Study Material").length >= 2;
  const coreTopic = scored.some((item) => item.chunk.sourceType === "Syllabus Derived");
  const highWeightage = parsed.chapters.some((chapter) => chapter.weightage && parseWeightageScore(chapter.weightage) > 0);
  const likelihood = computeExamLikelihood({
    appearsInPreviousPaper: hasPreviousPaper,
    appearsInQuestionBank: hasQuestionBank,
    repeatedInStudyMaterial: repeatedInMaterial,
    syllabusCoreTopic: coreTopic,
    highChapterWeightage: highWeightage,
  });

  return {
    chunks: scored.map((item) => item.chunk.text),
    citations: scored.map((item) => toCitation(item.chunk)),
    score: scored.reduce((sum, item) => sum + item.score, 0),
    materialCoverage: averageCoverage,
    examLikelihood: likelihood,
    topPreviousPaperChunk: scored.find((item) => item.chunk.sourceType === "Previous Paper")?.chunk,
  };
}

export async function buildTopicStudyContent(
  files: UploadedFile[],
  topic: string,
  priority: TopicPriority,
  modelConfig: ModelConfig,
  options?: { outlineOnly?: boolean; context?: StudyGenerationContext }
): Promise<TopicStudyContent> {
  const retrieval = await getTopChunks(files, topic, 6);
  const confidence = toConfidence(retrieval.score);
  const estimatedTime = estimateTime(priority);

  if (!retrieval.chunks.length) {
    return {
      whatToLearn: [],
      explanation: {
        concept: "No matching concept found",
        simpleExplanation: FALLBACK_MESSAGE,
        example: "No matching example found.",
        examTip: "Upload more relevant study material for this topic.",
      },
      keyDefinitions: [],
      differences: [],
      examplesFromMaterial: [],
      examTips: [],
      typicalExamQuestions: [],
      keyExamPoints: [],
      confidence: "low",
      estimatedTime,
      examLikelihoodScore: retrieval.examLikelihood.score,
      examLikelihoodLabel: retrieval.examLikelihood.label,
      sourceRefs: [],
      materialCoverage: retrieval.materialCoverage,
      lowMaterialConfidence: true,
      routingMeta: {
        taskType: "topic_description",
        modelUsed: "cache-none",
        fallbackTriggered: false,
        latencyMs: 0,
      },
    };
  }

  const cleanedContext = cleanRetrievedText(retrieval.chunks.join("\n\n"));

  const prompt = [
    "You are a teacher helping a student prepare for exams.",
    "Use only the provided context.",
    "Do not copy raw text.",
    "Summarize and simplify.",
    "Use short paragraphs.",
    "Add an example when possible.",
    "Focus only on exam-relevant concepts.",
    ...(options?.outlineOnly
      ? ["Keep explanation concise and prioritize a high-quality whatToLearn list."]
      : []),
    "Return ONLY valid JSON with this exact shape:",
    '{ "whatToLearn": string[], "explanation": { "concept": string, "simpleExplanation": string, "example": string, "examTip": string }, "keyExamPoints": string[] }',
    `Topic: ${topic}`,
    ...buildContextEnvelope(options?.context),
    "Context:",
    cleanedContext,
  ].join("\n");

  try {
    const generated = await toModelPrompt(
      "topic_description",
      modelConfig,
      prompt,
      {
        requiresJson: true,
        minChars: options?.outlineOnly ? 120 : 220,
        retrievalConfidence: confidence,
      },
      0.45,
    );
    const parsed = parseJsonObject(generated.text);

    const strictNormalized = normalizeStudyContent(
      parsed,
      FALLBACK_MESSAGE,
      confidence,
      estimatedTime,
      retrieval.citations,
      retrieval.materialCoverage,
      retrieval.examLikelihood.score,
    );

    if (!strictNormalized.whatToLearn.length) {
      strictNormalized.whatToLearn = defaultWhatToLearn(topic);
    }
    if (!strictNormalized.keyExamPoints.length) {
      strictNormalized.keyExamPoints = defaultKeyExamPoints(topic);
    }

    const definitions = toBulletList(cleanedContext, 3);
    strictNormalized.keyDefinitions = strictNormalized.keyDefinitions.length
      ? strictNormalized.keyDefinitions
      : definitions;
    strictNormalized.examplesFromMaterial = strictNormalized.examplesFromMaterial.length
      ? strictNormalized.examplesFromMaterial
      : toBulletList(cleanedContext, 2);
    strictNormalized.examTips = strictNormalized.examTips.length
      ? strictNormalized.examTips
      : [strictNormalized.explanation.examTip];

    const questionText = `What is the exam-relevant explanation of ${topic}?`;
    const previousAskedIn = retrieval.topPreviousPaperChunk
      ? `${retrieval.topPreviousPaperChunk.sourceName}${retrieval.topPreviousPaperChunk.sourceYear ? ` (${retrieval.topPreviousPaperChunk.sourceYear})` : ""}`
      : undefined;
    const previousOriginalQuestion = retrieval.topPreviousPaperChunk
      ? extractQuestionLikeLine(retrieval.topPreviousPaperChunk.text)
      : undefined;

    strictNormalized.differences = buildDifferences(topic, cleanedContext);
    strictNormalized.typicalExamQuestions = [
      {
        question: questionText,
        answer: strictNormalized.explanation.simpleExplanation,
        simpleExplanation: strictNormalized.explanation.simpleExplanation,
        example: strictNormalized.explanation.example,
        examTip: strictNormalized.explanation.examTip,
        examLikelihoodScore: retrieval.examLikelihood.score,
        examLikelihoodLabel: retrieval.examLikelihood.label,
        sources: retrieval.citations,
        askedIn: previousAskedIn,
        originalQuestion: previousOriginalQuestion,
      },
    ];
    strictNormalized.routingMeta = generated.meta;

    return strictNormalized;
  } catch {
    return {
      whatToLearn: defaultWhatToLearn(topic),
      explanation: {
        concept: topic,
        simpleExplanation: FALLBACK_MESSAGE,
        example: "No direct example found in uploaded material.",
        examTip: "Prioritize repeated patterns and definition-based questions for this topic.",
      },
      keyDefinitions: ["Key definitions are unavailable right now. Try reloading this topic."],
      differences: [],
      examplesFromMaterial: [],
      examTips: ["Prioritize high-likelihood patterns from previous papers."],
      typicalExamQuestions: [
        {
          question: `What is the exam-relevant explanation of ${topic}?`,
          answer: FALLBACK_MESSAGE,
          simpleExplanation: FALLBACK_MESSAGE,
          example: "No direct example found in uploaded material.",
          examTip: "Focus on repeated patterns and standard definitions.",
          examLikelihoodScore: retrieval.examLikelihood.score,
          examLikelihoodLabel: retrieval.examLikelihood.label,
          sources: retrieval.citations,
          askedIn: retrieval.topPreviousPaperChunk
            ? `${retrieval.topPreviousPaperChunk.sourceName}${retrieval.topPreviousPaperChunk.sourceYear ? ` (${retrieval.topPreviousPaperChunk.sourceYear})` : ""}`
            : undefined,
          originalQuestion: retrieval.topPreviousPaperChunk
            ? extractQuestionLikeLine(retrieval.topPreviousPaperChunk.text)
            : undefined,
        },
      ],
      keyExamPoints: defaultKeyExamPoints(topic),
      confidence,
      estimatedTime,
      examLikelihoodScore: retrieval.examLikelihood.score,
      examLikelihoodLabel: retrieval.examLikelihood.label,
      sourceRefs: retrieval.citations,
      materialCoverage: retrieval.materialCoverage,
      lowMaterialConfidence: retrieval.materialCoverage < 40,
      routingMeta: {
        taskType: "topic_description",
        modelUsed: "fallback",
        fallbackTriggered: false,
        latencyMs: 0,
      },
    };
  }
}

export async function buildLearnItemContent(
  files: UploadedFile[],
  topic: string,
  item: string,
  modelConfig: ModelConfig,
  generationContext?: StudyGenerationContext,
): Promise<LearnItemContent> {
  const retrieval = await getTopChunks(files, `${topic} ${item}`, 5);
  const confidence = toConfidence(retrieval.score);

  if (!retrieval.chunks.length) {
    return {
      conceptExplanation: "Not found in uploaded material.",
      example: "",
      examTip: "Upload more topic-relevant material.",
      typicalExamQuestion: `Explain ${item}.`,
      fullAnswer: "Not found in uploaded material.",
      confidence: "low",
      citations: [],
      routingMeta: {
        taskType: "learn_now_answer",
        modelUsed: "cache-none",
        fallbackTriggered: false,
        latencyMs: 0,
      },
    };
  }

  const context = cleanRetrievedText(retrieval.chunks.join("\n\n"));
  const prompt = [
    "You are an exam-focused tutor.",
    "Use only provided context.",
    "Return ONLY JSON with keys:",
    '{ "conceptExplanation": string, "example": string, "examTip": string, "typicalExamQuestion": string, "fullAnswer": string }',
    "Keep content medium length and structured with short sections and bullet points.",
    `Topic: ${topic}`,
    `Learning item: ${item}`,
    ...buildContextEnvelope(generationContext),
    "Context:",
    context,
  ].join("\n");

  try {
    const generated = await toModelPrompt(
      "learn_now_answer",
      modelConfig,
      prompt,
      {
        requiresJson: true,
        minChars: 180,
        retrievalConfidence: confidence,
      },
      0.35,
    );
    const parsed = parseJsonObject(generated.text);
    return {
      conceptExplanation:
        typeof parsed?.conceptExplanation === "string" && parsed.conceptExplanation.trim()
          ? parsed.conceptExplanation
          : "Not found in uploaded material.",
      example:
        typeof parsed?.example === "string" && parsed.example.trim()
          ? parsed.example
          : "",
      examTip:
        typeof parsed?.examTip === "string" && parsed.examTip.trim()
          ? parsed.examTip
          : "Focus on scoring patterns and repeated exam wording.",
      typicalExamQuestion:
        typeof parsed?.typicalExamQuestion === "string" && parsed.typicalExamQuestion.trim()
          ? parsed.typicalExamQuestion
          : `Explain ${item} with exam relevance.`,
      fullAnswer:
        typeof parsed?.fullAnswer === "string" && parsed.fullAnswer.trim()
          ? parsed.fullAnswer
          : "Not found in uploaded material.",
      confidence,
      citations: retrieval.citations,
      routingMeta: generated.meta,
    };
  } catch {
    return {
      conceptExplanation: "Not found in uploaded material.",
      example: "",
      examTip: "Focus on exam language and concise point-wise answers.",
      typicalExamQuestion: `Explain ${item} with a suitable example.`,
      fullAnswer: "Not found in uploaded material.",
      confidence,
      citations: retrieval.citations,
      routingMeta: {
        taskType: "learn_now_answer",
        modelUsed: "fallback",
        fallbackTriggered: false,
        latencyMs: 0,
      },
    };
  }
}

export async function answerTopicQuestion(
  files: UploadedFile[],
  topic: string,
  question: string,
  modelConfig: ModelConfig,
  history: Array<{ role: "user" | "assistant"; content: string }> = [],
  generationContext?: StudyGenerationContext,
): Promise<TopicAnswer> {
  const retrieval = await getTopChunks(files, `${topic} ${question}`, 5);
  const confidence = toConfidence(retrieval.score);

  if (!retrieval.chunks.length) {
    return {
      answer: FALLBACK_MESSAGE,
      confidence: "low",
      citations: [],
      routingMeta: {
        taskType: "chat_follow_up",
        modelUsed: "cache-none",
        fallbackTriggered: false,
        latencyMs: 0,
      },
    };
  }

  const cleanedContext = cleanRetrievedText(retrieval.chunks.join("\n\n"));
  const recentTurns = history.slice(-6).map((turn) => `${turn.role}: ${turn.content}`).join("\n");

  const prompt = [
    "You are an exam tutor.",
    "Answer the question using this priority:",
    "1) Use uploaded material first.",
    "2) If not directly found, provide a short relevant educational explanation.",
    '3) If using broader explanation, start with exactly: "Not directly found in your material, but relevant:"',
    "Never invent exam facts that are not supported by context.",
    "Keep answer concise: 4 to 7 sentences maximum.",
    `Topic: ${topic}`,
    `Question: ${question}`,
    ...buildContextEnvelope(generationContext),
    "Recent chat context:",
    recentTurns || "None",
    "Retrieved context:",
    cleanedContext,
  ].join("\n");

  try {
    const response = await toModelPrompt(
      "chat_follow_up",
      modelConfig,
      prompt,
      {
        minChars: 90,
        retrievalConfidence: confidence,
      },
      0.3,
    );
    const answerText = response.text
      .replace(/^```[\s\S]*?\n/, "")
      .replace(/```$/, "")
      .trim();

    if (!answerText) {
      return {
        answer: FALLBACK_MESSAGE,
        confidence: "low",
        citations: [],
        routingMeta: response.meta,
      };
    }

    const queryTokens = tokenize(`${topic} ${question}`);
    const isGrounded = hasTokenMatch(answerText, queryTokens);
    if (!isGrounded) {
      if (retrieval.score >= 8) {
        const normalized = answerText.startsWith("Not directly found in your material, but relevant:")
          ? answerText
          : `Not directly found in your material, but relevant:\n\n${answerText}`;

        return {
          answer: normalized,
          confidence: confidence === "high" ? "medium" : "low",
          citations: retrieval.citations,
          routingMeta: response.meta,
        };
      }

      return {
        answer: "Not found in uploaded material.",
        confidence: "low",
        citations: retrieval.citations,
        routingMeta: response.meta,
      };
    }

    return {
      answer: answerText,
      confidence,
      citations: retrieval.citations,
      routingMeta: response.meta,
    };
  } catch {
    const fallbackAnswer = "Not found in uploaded material.";
    return {
      answer: fallbackAnswer || FALLBACK_MESSAGE,
      confidence: "low",
      citations: retrieval.citations,
      routingMeta: {
        taskType: "chat_follow_up",
        modelUsed: "fallback",
        fallbackTriggered: false,
        latencyMs: 0,
      },
    };
  }
}

export async function buildExamModeContent(
  files: UploadedFile[],
  topic: string,
  modelConfig: ModelConfig,
  generationContext?: StudyGenerationContext,
): Promise<ExamModeContent> {
  const retrieval = await getTopChunks(files, `${topic} likely exam questions`, 6);
  const confidence = toConfidence(retrieval.score);

  if (!retrieval.chunks.length) {
    return {
      likelyQuestions: [
        {
          question: `Explain ${topic} with one practical example.`,
          expectedAnswer: "Not found in uploaded material.",
          difficulty: "medium",
          timeLimitMinutes: 8,
        },
      ],
      readinessScore: 25,
      confidence: "low",
      weakAreas: ["Insufficient uploaded material for this topic."],
      examTip: "Upload more topic-relevant notes and previous papers to improve readiness score.",
      citations: [],
      routingMeta: {
        taskType: "exam_mode_generation",
        modelUsed: "cache-none",
        fallbackTriggered: false,
        latencyMs: 0,
      },
    };
  }

  const context = cleanRetrievedText(retrieval.chunks.join("\n\n"));
  const prompt = [
    "You are an exam coach.",
    "Use only the provided context.",
    "Return ONLY valid JSON with exact shape:",
    '{ "likelyQuestions": [{"question": string, "expectedAnswer": string, "difficulty": "easy"|"medium"|"hard", "timeLimitMinutes": number}], "readinessScore": number, "weakAreas": string[], "examTip": string }',
    "Generate 3 likely exam questions and concise expected answers.",
    "readinessScore must be 0-100.",
    `Topic: ${topic}`,
    ...buildContextEnvelope(generationContext),
    "Context:",
    context,
  ].join("\n");

  try {
    const generated = await toModelPrompt(
      "exam_mode_generation",
      modelConfig,
      prompt,
      {
        requiresJson: true,
        minChars: 220,
        retrievalConfidence: confidence,
      },
      0.55,
    );
    const parsed = parseJsonObject(generated.text);

    const likelyQuestionsRaw = Array.isArray(parsed?.likelyQuestions) ? parsed.likelyQuestions : [];
    const likelyQuestions = likelyQuestionsRaw
      .map((item) => {
        const row = item as Record<string, unknown>;
        const question = typeof row.question === "string" ? row.question.trim() : "";
        const expectedAnswer = typeof row.expectedAnswer === "string" ? row.expectedAnswer.trim() : "";
        const difficultyRaw = typeof row.difficulty === "string" ? row.difficulty.toLowerCase() : "medium";
        const difficulty: "easy" | "medium" | "hard" =
          difficultyRaw === "easy" || difficultyRaw === "hard" ? difficultyRaw : "medium";
        const timeLimitMinutesRaw = Number(row.timeLimitMinutes ?? 8);
        const timeLimitMinutes = Number.isFinite(timeLimitMinutesRaw)
          ? Math.max(3, Math.min(25, Math.round(timeLimitMinutesRaw)))
          : 8;

        if (!question || !expectedAnswer) {
          return null;
        }

        return {
          question,
          expectedAnswer,
          difficulty,
          timeLimitMinutes,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .slice(0, 3);

    const weakAreas = Array.isArray(parsed?.weakAreas)
      ? parsed.weakAreas.map((item) => String(item)).filter((item) => item.trim().length > 0).slice(0, 4)
      : [];

    const baseReadiness = typeof parsed?.readinessScore === "number" ? parsed.readinessScore : 50;
    const confidenceBoost = confidence === "high" ? 8 : confidence === "medium" ? 3 : -5;
    const finalReadiness = Math.max(0, Math.min(100, Math.round(baseReadiness + confidenceBoost)));

    return {
      likelyQuestions:
        likelyQuestions.length > 0
          ? likelyQuestions
          : [
              {
                question: `Explain ${topic} with one practical example.`,
                expectedAnswer: "Not found in uploaded material.",
                difficulty: "medium",
                timeLimitMinutes: 8,
              },
            ],
      readinessScore: finalReadiness,
      confidence,
      weakAreas: weakAreas.length ? weakAreas : ["Key areas need additional revision from uploaded material."],
      examTip:
        typeof parsed?.examTip === "string" && parsed.examTip.trim()
          ? parsed.examTip
          : "Practice high-likelihood questions first and focus on concise structured answers.",
      citations: retrieval.citations,
      routingMeta: generated.meta,
    };
  } catch {
    return {
      likelyQuestions: [
        {
          question: `Explain ${topic} with one practical example.`,
          expectedAnswer: "Not found in uploaded material.",
          difficulty: "medium",
          timeLimitMinutes: 8,
        },
      ],
      readinessScore: confidence === "high" ? 68 : confidence === "medium" ? 52 : 35,
      confidence,
      weakAreas: ["Unable to infer all weak areas from available context."],
      examTip: "Revise definitions, solve one timed answer, then re-attempt exam mode.",
      citations: retrieval.citations,
      routingMeta: {
        taskType: "exam_mode_generation",
        modelUsed: "fallback",
        fallbackTriggered: false,
        latencyMs: 0,
      },
    };
  }
}

export async function buildMicroQuizContent(
  files: UploadedFile[],
  topic: string,
  modelConfig: ModelConfig,
  count = 4,
  generationContext?: StudyGenerationContext,
): Promise<MicroQuizContent> {
  const retrieval = await getTopChunks(files, `${topic} quiz questions`, 8);
  if (!retrieval.chunks.length) {
    return {
      questions: [],
      citations: [],
      routingMeta: {
        taskType: "quiz_generation",
        modelUsed: "cache-none",
        fallbackTriggered: false,
        latencyMs: 0,
      },
    };
  }

  const context = cleanRetrievedText(retrieval.chunks.join("\n\n"));
  const prompt = [
    "You are generating a micro quiz from uploaded material.",
    "Use strictly and only the provided context.",
    "If evidence is weak, avoid inventing facts.",
    "Return only valid JSON with shape:",
    '{ "questions": [{ "question": string, "answer": string, "explanation": string, "difficulty": "easy"|"medium"|"hard" }] }',
    `Generate ${Math.max(3, Math.min(5, count))} short exam-style questions for topic: ${topic}.`,
    "Each answer and explanation must be grounded in context.",
    ...buildContextEnvelope(generationContext),
    "Context:",
    context,
  ].join("\n");

  try {
    const generated = await toModelPrompt(
      "quiz_generation",
      modelConfig,
      prompt,
      {
        requiresJson: true,
        minChars: 180,
      },
      0.4,
    );
    const parsed = parseJsonObject(generated.text);
    const questionsRaw = Array.isArray(parsed?.questions) ? parsed.questions : [];

    const questions = questionsRaw
      .map((row) => {
        const item = row as Record<string, unknown>;
        const question = typeof item.question === "string" ? item.question.trim() : "";
        const answer = typeof item.answer === "string" ? item.answer.trim() : "";
        const explanation = typeof item.explanation === "string" ? item.explanation.trim() : "";
        const difficultyRaw = typeof item.difficulty === "string" ? item.difficulty.toLowerCase() : "medium";
        const difficulty: "easy" | "medium" | "hard" =
          difficultyRaw === "easy" || difficultyRaw === "hard" ? difficultyRaw : "medium";

        if (!question || !answer || !explanation) {
          return null;
        }

        return { question, answer, explanation, difficulty };
      })
      .filter((item): item is MicroQuizQuestion => Boolean(item))
      .slice(0, 5);

    return {
      questions,
      citations: retrieval.citations,
      routingMeta: generated.meta,
    };
  } catch {
    return {
      questions: [],
      citations: retrieval.citations,
      routingMeta: {
        taskType: "quiz_generation",
        modelUsed: "fallback",
        fallbackTriggered: false,
        latencyMs: 0,
      },
    };
  }
}

export { FALLBACK_MESSAGE };
