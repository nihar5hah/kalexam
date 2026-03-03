import { generateWithModelRouter } from "@/lib/ai/modelRouter";
import {
  GenerateStrategyInput,
  ModelConfig,
  StrategyResult,
  StrategyResultV1,
  normalizeStrategyResult,
} from "@/lib/ai/types";

function compactTextForPrompt(text: string, maxChars: number): string {
  const normalized = text.trim();
  if (!normalized) {
    return "Not provided";
  }

  if (normalized.length <= maxChars) {
    return normalized;
  }

  const headChars = Math.floor(maxChars * 0.7);
  const tailChars = maxChars - headChars;
  const omitted = normalized.length - maxChars;

  return [
    normalized.slice(0, headChars),
    `\n...[truncated ${omitted} characters for speed]...\n`,
    normalized.slice(-tailChars),
  ].join("");
}

function buildPrompt(input: GenerateStrategyInput): string {
  const syllabusSnippet = compactTextForPrompt(input.extractedTexts.syllabusText || "", 9_000);
  const materialSnippet = compactTextForPrompt(input.extractedTexts.materialText || "", 15_000);
  const previousPaperSnippet = compactTextForPrompt(input.extractedTexts.previousPaperText || "", 7_000);

  const repeatedTopicsText = input.examIntelligence.repeatedTopics.length
    ? input.examIntelligence.repeatedTopics
        .map((topic) => `${topic.topic} (${topic.frequency})`)
        .join(", ")
    : "No repeated topics detected from previous papers.";

  const chapterHintsText = input.chapterHints.length
    ? input.chapterHints
        .map((chapter) => {
          const weightage = chapter.weightage ? `, weightage: ${chapter.weightage}` : "";
          return `Chapter ${chapter.chapterNumber}: ${chapter.chapterTitle}${weightage}, emphasisScore: ${chapter.emphasisScore}, coverageScore: ${chapter.coverageScore}`;
        })
        .join("\n")
    : "No explicit chapter headings detected. Infer chapter structure from syllabus text.";

  return [
    "Create an exam study strategy and return ONLY valid JSON with these exact keys:",
    "strategySummary: { hoursLeft: number, estimatedCoverage: string, highImpactTopics: number }",
    "chapters: Array<{ chapterNumber: number, chapterTitle: string, weightage?: string, priority: 'high' | 'medium' | 'low', estimatedTime: string, topics: Array<{ slug: string, title: string, priority: 'high' | 'medium' | 'low', estimatedTime: string, whatToLearn: string[], explanation: string, keyExamPoints: string[], confidence: 'high' | 'medium' | 'low', chapterNumber: number, chapterTitle: string }> }>",
    "highPriority: string[]",
    "mediumPriority: string[]",
    "lowPriority: string[]",
    "studyOrder: string[]",
    "reasoning: string[]",
    "topics: Array<{ slug: string, title: string, priority: 'high' | 'medium' | 'low', estimatedTime: string, whatToLearn: string[], explanation: string, keyExamPoints: string[], confidence: 'high' | 'medium' | 'low' }>",
    "modelUsed: string",
    "efficiencyScore: string",
    "",
    "Use concise planning based on evidence. Do not include raw source excerpts in output.",
    `Hours left before exam: ${input.hoursLeft}`,
    `Syllabus extracted text:\n${syllabusSnippet}`,
    `Study material extracted text:\n${materialSnippet}`,
    `Previous paper extracted text:\n${previousPaperSnippet}`,
    `Detected chapter hints:\n${chapterHintsText}`,
    `Repeated topics from previous papers: ${repeatedTopicsText}`,
    `Parser warnings: ${input.fileWarnings.join(" | ") || "None"}`,
    "Priority logic MUST consider chapter weightage (if available), syllabus emphasis, material coverage, and exam time available.",
    "Map every topic to a chapter using chapterNumber + chapterTitle.",
    "The strategy should feel like revision notes: concise, exam-focused, no raw extracted text.",
    "Keep response concise and practical for maximizing marks in limited time.",
  ].join("\n");
}

function parseStrategyResult(raw: string): StrategyResult {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();

  const candidate = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? cleaned;
  let parsed: Partial<StrategyResult>;
  try {
    parsed = JSON.parse(candidate) as Partial<StrategyResult>;
  } catch {
    throw new Error("Model returned invalid strategy format");
  }

  const partial = normalizeStrategyResult(
    parsed as StrategyResult,
    parsed.strategySummary?.hoursLeft ?? 0,
    parsed.modelUsed ?? "Unknown"
  );

  return {
    strategySummary: {
      hoursLeft: partial.strategySummary.hoursLeft,
      estimatedCoverage: partial.strategySummary.estimatedCoverage,
      highImpactTopics: partial.strategySummary.highImpactTopics,
    },
    highPriority: partial.highPriority,
    mediumPriority: partial.mediumPriority,
    lowPriority: partial.lowPriority,
    studyOrder: partial.studyOrder,
    reasoning: partial.reasoning,
    topics: partial.topics,
    chapters: partial.chapters,
    modelUsed: partial.modelUsed,
    efficiencyScore: partial.efficiencyScore,
  };
}

function parseNumericWeightage(weightage?: string): number {
  if (!weightage) {
    return 0;
  }

  const match = weightage.match(/(\d+(?:\.\d+)?)/);
  if (!match) {
    return 0;
  }

  return Number.parseFloat(match[1]);
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(trimmed);
  }

  return output;
}

function buildFallbackStrategy(input: GenerateStrategyInput): StrategyResult {
  const rankedChapters = [...input.chapterHints].sort((left, right) => {
    const leftScore = left.emphasisScore * 4 + left.coverageScore * 3 + parseNumericWeightage(left.weightage);
    const rightScore = right.emphasisScore * 4 + right.coverageScore * 3 + parseNumericWeightage(right.weightage);
    return rightScore - leftScore;
  });

  const repeatedTopics = input.examIntelligence.repeatedTopics.map((topic) => topic.topic);
  const chapterTitles = rankedChapters.map((chapter) => chapter.chapterTitle);

  const highPriority = dedupe([...chapterTitles.slice(0, 3), ...repeatedTopics.slice(0, 2)]).slice(0, 5);
  const mediumPriority = dedupe([
    ...chapterTitles.slice(3, 8),
    ...repeatedTopics.slice(2, 8),
  ]).filter((topic) => !highPriority.includes(topic));
  const lowPriority = dedupe([
    "Definitions and core formulas",
    "Previous-year question pattern review",
    "Quick revision checklist",
  ]).filter((topic) => !highPriority.includes(topic) && !mediumPriority.includes(topic));

  const fallbackV1: StrategyResultV1 = {
    highPriority,
    mediumPriority,
    lowPriority,
    studyOrder: [...highPriority, ...mediumPriority, ...lowPriority],
    estimatedCoverage: input.hoursLeft <= 6 ? "65%" : input.hoursLeft <= 12 ? "75%" : "85%",
  };

  return normalizeStrategyResult(fallbackV1, input.hoursLeft, "fallback-planner");
}

function buildRepairPrompt(input: GenerateStrategyInput, invalidOutput: string): string {
  return [
    "Return ONLY valid JSON. No markdown, no explanation, no prose.",
    "Use this exact schema:",
    "strategySummary: { hoursLeft: number, estimatedCoverage: string, highImpactTopics: number }",
    "chapters: Array<{ chapterNumber: number, chapterTitle: string, weightage?: string, priority: 'high' | 'medium' | 'low', estimatedTime: string, topics: Array<{ slug: string, title: string, priority: 'high' | 'medium' | 'low', estimatedTime: string, whatToLearn: string[], explanation: string, keyExamPoints: string[], confidence: 'high' | 'medium' | 'low', chapterNumber: number, chapterTitle: string }> }>",
    "highPriority: string[]",
    "mediumPriority: string[]",
    "lowPriority: string[]",
    "studyOrder: string[]",
    "reasoning: string[]",
    "topics: Array<{ slug: string, title: string, priority: 'high' | 'medium' | 'low', estimatedTime: string, whatToLearn: string[], explanation: string, keyExamPoints: string[], confidence: 'high' | 'medium' | 'low' }>",
    "modelUsed: string",
    "efficiencyScore: string",
    "",
    `Hours left: ${input.hoursLeft}`,
    "Invalid output to repair:",
    invalidOutput,
  ].join("\n");
}

export async function generateStrategy(
  input: GenerateStrategyInput,
  modelConfig: ModelConfig
): Promise<StrategyResult> {
  const prompt = buildPrompt(input);
  const routed = await generateWithModelRouter({
    prompt,
    taskType: "strategy_generation",
    modelConfig,
    complexityScore: 0.45,
    qualitySignals: {
      requiresJson: true,
      minChars: 180,
    },
  });
  try {
    const parsed = parseStrategyResult(routed.text);
    return {
      ...parsed,
      modelUsed: routed.meta.modelUsed,
    };
  } catch (parseError) {
    console.warn("[ai-client] strategy JSON parse failed, attempting repair", {
      message: parseError instanceof Error ? parseError.message : "unknown",
    });
  }

  try {
    const repaired = await generateWithModelRouter({
      prompt: buildRepairPrompt(input, routed.text),
      taskType: "strategy_generation",
      modelConfig,
      complexityScore: 0.6,
      qualitySignals: {
        requiresJson: true,
        minChars: 180,
      },
    });

    const repairedParsed = parseStrategyResult(repaired.text);
    return {
      ...repairedParsed,
      modelUsed: repaired.meta.modelUsed,
    };
  } catch (repairError) {
    console.warn("[ai-client] strategy repair failed, using fallback strategy", {
      message: repairError instanceof Error ? repairError.message : "unknown",
    });
  }

  return buildFallbackStrategy(input);
}
