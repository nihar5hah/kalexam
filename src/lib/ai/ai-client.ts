import { generateWithCustomProvider } from "@/lib/ai/providers/custom";
import { generateWithGemini } from "@/lib/ai/providers/gemini";
import {
  GenerateStrategyInput,
  ModelConfig,
  StrategyResult,
  normalizeStrategyResult,
} from "@/lib/ai/types";

function buildPrompt(input: GenerateStrategyInput): string {
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
    `Hours left before exam: ${input.hoursLeft}`,
    `Syllabus extracted text:\n${input.extractedTexts.syllabusText || "Not provided"}`,
    `Study material extracted text:\n${input.extractedTexts.materialText || "Not provided"}`,
    `Previous paper extracted text:\n${input.extractedTexts.previousPaperText || "Not provided"}`,
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
  const parsed = JSON.parse(candidate) as Partial<StrategyResult>;

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

export async function generateStrategy(
  input: GenerateStrategyInput,
  modelConfig: ModelConfig
): Promise<StrategyResult> {
  const prompt = buildPrompt(input);

  const rawResponse =
    modelConfig.modelType === "custom"
      ? await generateWithCustomProvider(prompt, modelConfig.config)
      : await generateWithGemini(prompt);

  return parseStrategyResult(rawResponse);
}
