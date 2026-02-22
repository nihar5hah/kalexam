import { RepeatedTopic, SyllabusChapterHint } from "@/lib/ai/types";

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
  "exam",
  "question",
  "questions",
  "marks",
  "unit",
  "topic",
  "chapter",
]);

export function detectRepeatedTopics(text: string): RepeatedTopic[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word));

  const counts = words.reduce<Map<string, number>>((accumulator, word) => {
    accumulator.set(word, (accumulator.get(word) ?? 0) + 1);
    return accumulator;
  }, new Map());

  return Array.from(counts.entries())
    .filter(([, frequency]) => frequency >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([topic, frequency]) => ({ topic, frequency }));
}

function normalizeText(input: string): string {
  return input.replace(/\r/g, "").replace(/\t/g, " ").replace(/\u00a0/g, " ");
}

function extractWeightage(line: string): string | undefined {
  const match = line.match(/(\d+(?:\.\d+)?\s*(?:%|marks?))/i);
  if (!match) {
    return undefined;
  }

  return match[1].replace(/\s+/g, " ").trim();
}

function computeCoverageScore(materialText: string, chapterTitle: string): number {
  const normalizedMaterial = materialText.toLowerCase();
  const tokens = chapterTitle
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 3);

  if (!tokens.length) {
    return 0;
  }

  return tokens.reduce((score, token) => {
    const occurrences = normalizedMaterial.split(token).length - 1;
    return score + Math.min(occurrences, 6);
  }, 0);
}

function toCoveragePercent(coverageScore: number): number {
  const percent = Math.round(Math.min(100, coverageScore * 12));
  return Math.max(0, percent);
}

function computeEmphasisScore(syllabusText: string, chapterTitle: string): number {
  const normalizedSyllabus = syllabusText.toLowerCase();
  const title = chapterTitle.toLowerCase();

  if (!title) {
    return 0;
  }

  return Math.min(normalizedSyllabus.split(title).length - 1, 8);
}

export function extractSyllabusChapters(
  syllabusText: string,
  materialText: string
): SyllabusChapterHint[] {
  const normalized = normalizeText(syllabusText);
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);

  const chapters: SyllabusChapterHint[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const match = line.match(
      /^(?:chapter|unit)\s*(\d+)\s*[:\-–—.]?\s*([^()\-–—]+?)(?:\s*[\-–—:]\s*(\d+(?:\.\d+)?\s*(?:%|marks?)))?(?:\s*\(([^)]+)\))?$/i
    );

    if (!match) {
      continue;
    }

    const chapterNumber = Number.parseInt(match[1] ?? "", 10);
    if (!Number.isFinite(chapterNumber)) {
      continue;
    }

    const chapterTitle = (match[2] ?? "").replace(/\s+/g, " ").trim() || `Chapter ${chapterNumber}`;
    const key = `${chapterNumber}:${chapterTitle.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const inlineWeightage = match[3]?.trim();
    const bracketWeightage = extractWeightage(match[4] ?? "");
    const weightage = inlineWeightage ?? bracketWeightage ?? extractWeightage(line);

    const coverageScore = computeCoverageScore(materialText, chapterTitle);

    chapters.push({
      chapterNumber,
      chapterTitle,
      weightage,
      emphasisScore: computeEmphasisScore(normalized, chapterTitle),
      coverageScore,
      materialCoveragePercent: toCoveragePercent(coverageScore),
      materialAvailable: coverageScore > 0,
    });
  }

  return chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
}
