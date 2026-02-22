export type ModelType = "gemini" | "custom";

export type StrategySummary = {
  hoursLeft: number;
  estimatedCoverage: string;
  highImpactTopics: number;
};

export type TopicPriority = "high" | "medium" | "low";
export type TopicConfidence = "high" | "medium" | "low";
export type ExamLikelihoodLabel = "VERY LIKELY" | "HIGH" | "MEDIUM" | "LOW";
export type SourceType = "Previous Paper" | "Question Bank" | "Study Material" | "Syllabus Derived";
export type ImportanceLevel = "VERY IMPORTANT" | "IMPORTANT" | "SUPPORTING";

export type SourceCitation = {
  sourceType: SourceType;
  sourceName: string;
  sourceYear?: string;
  importanceLevel: ImportanceLevel;
  section?: string;
};

export type StudyQuestionCard = {
  question: string;
  answer: string;
  simpleExplanation: string;
  example: string;
  examTip: string;
  examLikelihoodScore: number;
  examLikelihoodLabel: ExamLikelihoodLabel;
  sources: SourceCitation[];
  askedIn?: string;
  originalQuestion?: string;
};

export type StudyTopic = {
  slug: string;
  title: string;
  priority: TopicPriority;
  estimatedTime: string;
  materialCoverage?: number;
  lowMaterialConfidence?: boolean;
  examLikelihoodScore?: number;
  examLikelihoodLabel?: ExamLikelihoodLabel;
  sourceRefs?: SourceCitation[];
  whatToLearn: string[];
  explanation: string;
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
  chapterNumber?: number;
  chapterTitle?: string;
};

export type StudyChapter = {
  chapterNumber: number;
  chapterTitle: string;
  weightage?: string;
  materialCoverage?: number;
  lowMaterialConfidence?: boolean;
  examLikelihoodSummary?: {
    highLikelihoodQuestions: number;
    averageLikelihood: number;
  };
  materialWarning?: string;
  priority: TopicPriority;
  estimatedTime: string;
  topics: StudyTopic[];
};

export type StrategyResult = {
  schemaVersion?: number;
  strategySummary: StrategySummary;
  highPriority: string[];
  mediumPriority: string[];
  lowPriority: string[];
  studyOrder: string[];
  reasoning: string[];
  modelUsed: string;
  efficiencyScore: string;
  topics: StudyTopic[];
  chapters: StudyChapter[];
};

export type StrategyResultV1 = {
  highPriority: string[];
  mediumPriority: string[];
  lowPriority: string[];
  studyOrder: string[];
  estimatedCoverage: string;
};

export type SyllabusChapterHint = {
  chapterNumber: number;
  chapterTitle: string;
  weightage?: string;
  emphasisScore: number;
  coverageScore: number;
  materialCoveragePercent: number;
  materialAvailable: boolean;
};

function slugifyTopic(topic: string): string {
  const base = topic
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return base || "topic";
}

function inferEstimatedTime(priority: TopicPriority): string {
  if (priority === "high") {
    return "90-120 min";
  }
  if (priority === "medium") {
    return "60-90 min";
  }
  return "30-45 min";
}

function parsePriority(value: unknown, fallback: TopicPriority = "medium"): TopicPriority {
  return value === "high" || value === "medium" || value === "low" ? value : fallback;
}

function parseConfidence(value: unknown, fallbackPriority: TopicPriority): TopicConfidence {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }

  if (fallbackPriority === "high") {
    return "high";
  }
  if (fallbackPriority === "medium") {
    return "medium";
  }
  return "low";
}

function defaultTopic(
  title: string,
  priority: TopicPriority,
  hoursLeft: number,
  index: number,
  chapter?: { chapterNumber: number; chapterTitle: string }
): StudyTopic {
  return {
    slug: `${slugifyTopic(title)}-${index + 1}`,
    title,
    priority,
    estimatedTime: hoursLeft <= 6 ? "30-45 min" : inferEstimatedTime(priority),
    whatToLearn: [
      `${title} basics and definitions`,
      `${title} most frequently tested patterns`,
      `${title} exam-style problem approach`,
    ],
    explanation: "Generated from your uploaded material.",
    keyExamPoints: [
      `Understand the core concept of ${title}`,
      `Prioritize high-frequency question patterns for ${title}`,
    ],
    confidence: parseConfidence(undefined, priority),
    chapterNumber: chapter?.chapterNumber,
    chapterTitle: chapter?.chapterTitle,
  };
}

function parseChapterTopicTitle(input: string):
  | { chapterNumber: number; chapterTitle: string; topicTitle: string }
  | null {
  const normalized = input.replace(/\s+/g, " ").trim();
  const match = normalized.match(
    /^(?:chapter|unit)\s*(\d+)\s*[:\-–—.]?\s*([^:–—-]+?)(?:\s*[:\-–—.]\s*(.+))?$/i
  );

  if (!match) {
    return null;
  }

  const chapterNumber = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isFinite(chapterNumber)) {
    return null;
  }

  const chapterTitle = (match[2] ?? "").trim() || `Chapter ${chapterNumber}`;
  const topicTitle = (match[3] ?? chapterTitle).trim();

  return {
    chapterNumber,
    chapterTitle,
    topicTitle,
  };
}

function buildTopicsFromPriorityLists(
  highPriority: string[],
  mediumPriority: string[],
  lowPriority: string[],
  hoursLeft: number
): StudyTopic[] {
  const all: Array<{ title: string; priority: TopicPriority }> = [
    ...highPriority.map((title) => ({ title, priority: "high" as const })),
    ...mediumPriority.map((title) => ({ title, priority: "medium" as const })),
    ...lowPriority.map((title) => ({ title, priority: "low" as const })),
  ];

  const seen = new Set<string>();
  return all
    .filter((item) => {
      const key = item.title.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .map((item, index) => {
      const chapterInfo = parseChapterTopicTitle(item.title);
      const topic = defaultTopic(
        chapterInfo?.topicTitle ?? item.title,
        item.priority,
        hoursLeft,
        index,
        chapterInfo
          ? { chapterNumber: chapterInfo.chapterNumber, chapterTitle: chapterInfo.chapterTitle }
          : undefined
      );

      if (chapterInfo) {
        topic.slug = `${slugifyTopic(chapterInfo.topicTitle)}-${chapterInfo.chapterNumber}-${index + 1}`;
      }

      return topic;
    });
}

function normalizeTopics(value: unknown, fallback: StudyTopic[]): StudyTopic[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value.flatMap((item, index) => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const topic = item as Partial<StudyTopic>;
      const title = typeof topic.title === "string" && topic.title.trim() ? topic.title.trim() : null;
      if (!title) {
        return [];
      }

      const parsedFromTitle = parseChapterTopicTitle(title);
      const priority = parsePriority(topic.priority, "medium");
      const chapterNumber =
        typeof topic.chapterNumber === "number"
          ? topic.chapterNumber
          : parsedFromTitle?.chapterNumber;
      const chapterTitle =
        typeof topic.chapterTitle === "string" && topic.chapterTitle.trim()
          ? topic.chapterTitle.trim()
          : parsedFromTitle?.chapterTitle;

      const toArray = (input: unknown): string[] =>
        Array.isArray(input)
          ? input.map((entry) => String(entry)).filter((entry) => entry.trim().length > 0)
          : [];

      const normalizedTopic: StudyTopic = {
        slug:
          typeof topic.slug === "string" && topic.slug.trim()
            ? topic.slug
            : `${slugifyTopic(parsedFromTitle?.topicTitle ?? title)}-${index + 1}`,
        title: parsedFromTitle?.topicTitle ?? title,
        priority,
        estimatedTime:
          typeof topic.estimatedTime === "string" && topic.estimatedTime.trim()
            ? topic.estimatedTime
            : inferEstimatedTime(priority),
        whatToLearn: toArray(topic.whatToLearn),
        explanation:
          typeof topic.explanation === "string" && topic.explanation.trim()
            ? topic.explanation
            : "Generated from your uploaded material.",
        keyExamPoints: toArray(topic.keyExamPoints),
        confidence: parseConfidence(topic.confidence, priority),
        chapterNumber,
        chapterTitle,
      };

      return [normalizedTopic];
    });

  return normalized.length ? normalized : fallback;
}

function parseWeightageValue(weightage?: string): number {
  if (!weightage) {
    return 0;
  }

  const match = weightage.match(/(\d+(?:\.\d+)?)/);
  if (!match) {
    return 0;
  }

  return Number.parseFloat(match[1]);
}

function inferChapterPriority(chapter: {
  weightage?: string;
  topics: StudyTopic[];
  fallbackPriority?: TopicPriority;
}): TopicPriority {
  if (chapter.fallbackPriority) {
    return chapter.fallbackPriority;
  }

  const weightageScore = parseWeightageValue(chapter.weightage);
  const topicPriorityScore = chapter.topics.reduce((score, topic) => {
    if (topic.priority === "high") {
      return score + 3;
    }
    if (topic.priority === "medium") {
      return score + 2;
    }
    return score + 1;
  }, 0);

  const composite = weightageScore + topicPriorityScore;
  if (composite >= 18) {
    return "high";
  }
  if (composite >= 9) {
    return "medium";
  }
  return "low";
}

function inferChapterEstimatedTime(priority: TopicPriority, topicCount: number): string {
  const count = Math.max(topicCount, 1);
  if (priority === "high") {
    return `${Math.max(2, count)}-${Math.max(3, count + 1)} hours`;
  }
  if (priority === "medium") {
    return `${Math.max(1, count)}-${Math.max(2, count)} hours`;
  }
  return "45-90 min";
}

function buildChapterFallback(topics: StudyTopic[]): StudyChapter[] {
  const grouped = new Map<number, StudyChapter>();

  for (const topic of topics) {
    const chapterNumber = topic.chapterNumber ?? 1;
    const chapterTitle = topic.chapterTitle ?? "General Revision";

    const existing = grouped.get(chapterNumber);
    if (existing) {
      existing.topics.push(topic);
      continue;
    }

    grouped.set(chapterNumber, {
      chapterNumber,
      chapterTitle,
      priority: "medium",
      estimatedTime: "1-2 hours",
      topics: [topic],
    });
  }

  return Array.from(grouped.values())
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
    .map((chapter) => {
      const priority = inferChapterPriority({ topics: chapter.topics });
      return {
        ...chapter,
        priority,
        estimatedTime: inferChapterEstimatedTime(priority, chapter.topics.length),
      };
    });
}

function normalizeChapters(value: unknown, normalizedTopics: StudyTopic[]): StudyChapter[] {
  if (!Array.isArray(value)) {
    return buildChapterFallback(normalizedTopics);
  }

  const topicByKey = new Map<string, StudyTopic>();
  for (const topic of normalizedTopics) {
    topicByKey.set(topic.slug.toLowerCase(), topic);
    topicByKey.set(topic.title.toLowerCase().trim(), topic);
  }

  const chapters = value.flatMap((item, chapterIndex) => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const chapter = item as Partial<StudyChapter> & { topics?: unknown[] };
      const chapterNumber =
        typeof chapter.chapterNumber === "number" && Number.isFinite(chapter.chapterNumber)
          ? chapter.chapterNumber
          : chapterIndex + 1;
      const chapterTitle =
        typeof chapter.chapterTitle === "string" && chapter.chapterTitle.trim()
          ? chapter.chapterTitle.trim()
          : `Chapter ${chapterNumber}`;

      const rawTopics = Array.isArray(chapter.topics) ? (chapter.topics as unknown[]) : [];
      const chapterTopics: StudyTopic[] = rawTopics.length
        ? rawTopics
            .map((topicItem, topicIndex) => {
              if (typeof topicItem === "string") {
                const existing = topicByKey.get(topicItem.toLowerCase().trim());
                if (existing) {
                  return {
                    ...existing,
                    chapterNumber,
                    chapterTitle,
                  };
                }

                return defaultTopic(topicItem, parsePriority(chapter.priority, "medium"), 8, topicIndex, {
                  chapterNumber,
                  chapterTitle,
                });
              }

              if (!topicItem || typeof topicItem !== "object") {
                return null;
              }

              const normalized = normalizeTopics([topicItem], []);
              if (!normalized.length) {
                return null;
              }

              return {
                ...normalized[0],
                chapterNumber,
                chapterTitle,
                priority: parsePriority(normalized[0].priority, parsePriority(chapter.priority, "medium")),
              };
            })
            .filter((topic): topic is StudyTopic => Boolean(topic))
        : [];

      const priority = inferChapterPriority({
        topics: chapterTopics,
        weightage: typeof chapter.weightage === "string" ? chapter.weightage : undefined,
        fallbackPriority: parsePriority(chapter.priority, "medium"),
      });

      const normalizedChapter: StudyChapter = {
        chapterNumber,
        chapterTitle,
        weightage: typeof chapter.weightage === "string" && chapter.weightage.trim() ? chapter.weightage : undefined,
        priority,
        estimatedTime:
          typeof chapter.estimatedTime === "string" && chapter.estimatedTime.trim()
            ? chapter.estimatedTime
            : inferChapterEstimatedTime(priority, chapterTopics.length),
        topics: chapterTopics,
      };

      return [normalizedChapter];
    });

  if (!chapters.length) {
    return buildChapterFallback(normalizedTopics);
  }

  for (const chapter of chapters) {
    for (const topic of chapter.topics) {
      topicByKey.set(topic.slug.toLowerCase(), topic);
      topicByKey.set(topic.title.toLowerCase().trim(), topic);
    }
  }

  return chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
}

function flattenChapterTopics(chapters: StudyChapter[], fallbackTopics: StudyTopic[]): StudyTopic[] {
  const merged = new Map<string, StudyTopic>();

  for (const chapter of chapters) {
    for (const topic of chapter.topics) {
      merged.set(topic.slug.toLowerCase(), {
        ...topic,
        chapterNumber: chapter.chapterNumber,
        chapterTitle: chapter.chapterTitle,
      });
    }
  }

  for (const topic of fallbackTopics) {
    if (!merged.has(topic.slug.toLowerCase())) {
      merged.set(topic.slug.toLowerCase(), topic);
    }
  }

  return Array.from(merged.values());
}

export type FileCategory = "syllabus" | "studyMaterial" | "previousPapers";

export type UploadedFile = {
  id?: string;
  name: string;
  type: string;
  url: string;
  extension: string;
  category: FileCategory;
};

export type ExtractedTexts = {
  syllabusText: string;
  materialText: string;
  previousPaperText: string;
};

export type RepeatedTopic = {
  topic: string;
  frequency: number;
};

export type ExamIntelligence = {
  repeatedTopics: RepeatedTopic[];
};

export type GenerateStrategyInput = {
  hoursLeft: number;
  extractedTexts: ExtractedTexts;
  examIntelligence: ExamIntelligence;
  chapterHints: SyllabusChapterHint[];
  fileWarnings: string[];
};

export type CustomProviderConfig = {
  baseUrl: string;
  apiKey: string;
  modelName: string;
};

export type ModelConfig =
  | {
      modelType: "gemini";
      config?: undefined;
    }
  | {
      modelType: "custom";
      config: CustomProviderConfig;
    };

export function normalizeStrategyResult(
  strategy: StrategyResult | StrategyResultV1,
  hoursLeft: number,
  modelUsed: string
): StrategyResult {
  const toArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
  const toStringValue = (value: unknown, fallback: string): string =>
    typeof value === "string" && value.trim() ? value : fallback;

  if ("strategySummary" in strategy) {
    const strategyValue = strategy as Partial<StrategyResult>;

    const fallbackTopics = buildTopicsFromPriorityLists(
      toArray(strategyValue.highPriority),
      toArray(strategyValue.mediumPriority),
      toArray(strategyValue.lowPriority),
      hoursLeft
    );
    const normalizedTopics = normalizeTopics(strategyValue.topics, fallbackTopics);
    const normalizedChapters = normalizeChapters(strategyValue.chapters, normalizedTopics);
    const mergedTopics = flattenChapterTopics(normalizedChapters, normalizedTopics);

    return {
      strategySummary: {
        hoursLeft:
          typeof strategyValue.strategySummary?.hoursLeft === "number"
            ? strategyValue.strategySummary.hoursLeft
            : hoursLeft,
        estimatedCoverage: toStringValue(
          strategyValue.strategySummary?.estimatedCoverage,
          "70%"
        ),
        highImpactTopics:
          typeof strategyValue.strategySummary?.highImpactTopics === "number"
            ? strategyValue.strategySummary.highImpactTopics
            : toArray(strategyValue.highPriority).length,
      },
      highPriority: toArray(strategyValue.highPriority),
      mediumPriority: toArray(strategyValue.mediumPriority),
      lowPriority: toArray(strategyValue.lowPriority),
      studyOrder: toArray(strategyValue.studyOrder),
      reasoning: toArray(strategyValue.reasoning),
      modelUsed: toStringValue(strategyValue.modelUsed, modelUsed),
      efficiencyScore: toStringValue(
        strategyValue.efficiencyScore,
        strategyValue.strategySummary?.estimatedCoverage ?? "70%"
      ),
      topics: mergedTopics,
      chapters: normalizedChapters,
    };
  }

  const fallbackTopics = buildTopicsFromPriorityLists(
    toArray(strategy.highPriority),
    toArray(strategy.mediumPriority),
    toArray(strategy.lowPriority),
    hoursLeft
  );

  const fallbackChapters = buildChapterFallback(fallbackTopics);

  return {
    strategySummary: {
      hoursLeft,
      estimatedCoverage: toStringValue(strategy.estimatedCoverage, "70%"),
      highImpactTopics: toArray(strategy.highPriority).length,
    },
    highPriority: toArray(strategy.highPriority),
    mediumPriority: toArray(strategy.mediumPriority),
    lowPriority: toArray(strategy.lowPriority),
    studyOrder: toArray(strategy.studyOrder),
    reasoning: [
      "Appears in previous papers",
      "Core syllabus concept",
      "High marks potential",
    ],
    modelUsed,
    efficiencyScore: toStringValue(strategy.estimatedCoverage, "70%"),
    topics: fallbackTopics,
    chapters: fallbackChapters,
  };
}
