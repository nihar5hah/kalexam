import { YoutubeTranscript } from "youtube-transcript";

import { FAST_MODEL } from "@/lib/ai/modelRouter";
import { generateWithGeminiModel } from "@/lib/ai/providers/gemini";
import { readYoutubeReconstructionCache, writeYoutubeReconstructionCache } from "@/lib/firestore/youtube-cache";
import { splitIntoChunks } from "@/lib/parsing/chunker";
import { ParsedSourceChunk } from "@/lib/parsing/types";

type TranscriptSource = "captions" | "ai-reconstructed";

type YouTubeMetadata = {
  title: string;
  author?: string;
  thumbnailUrl?: string;
  description?: string;
  chapters: string[];
  tags: string[];
};

type ReconstructedChunk = {
  text: string;
  section: string;
};

type YouTubeIngestResult = {
  videoId: string;
  title: string;
  channel?: string;
  summary?: string;
  transcriptSource: TranscriptSource;
  youtubeMetadata: YouTubeMetadata;
  originalLanguage?: "english" | "hindi" | "other";
  translatedToEnglish?: boolean;
  chunks: ParsedSourceChunk[];
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function fetchYouTubeMetadata(videoId: string): Promise<YouTubeMetadata> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(oembedUrl, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      return {
        title: `YouTube Video ${videoId}`,
        chapters: [],
        tags: [],
      };
    }

    const data = (await response.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    const title = data.title?.trim() || `YouTube Video ${videoId}`;
    const author = data.author_name?.trim();
    const thumbnailUrl = data.thumbnail_url?.trim();
    return {
      title,
      author,
      thumbnailUrl,
      chapters: [],
      tags: [],
    };
  } catch {
    return {
      title: `YouTube Video ${videoId}`,
      chapters: [],
      tags: [],
    };
  }
}

function cleanTranscriptText(value: string): string {
  return value
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function reconstructFromMetadata(
  videoId: string,
  url: string,
  metadata: YouTubeMetadata,
): Promise<{ transcript: string; summary?: string }> {
  const model = FAST_MODEL;
  const chapters = metadata.chapters.length ? metadata.chapters.join("\n") : "No chapter timestamps available";
  const tags = metadata.tags.length ? metadata.tags.join(", ") : "No tags available";
  const prompt = [
    "You are reconstructing educational content from a YouTube video.",
    "",
    `Video title: ${metadata.title}`,
    `Author: ${metadata.author ?? "Unknown"}`,
    `Description: ${metadata.description ?? "No description available"}`,
    `Chapters: ${chapters}`,
    `Tags: ${tags}`,
    `Thumbnail URL: ${metadata.thumbnailUrl ?? "Unavailable"}`,
    `URL: ${url}`,
    "",
    "Generate:",
    "1. Structured pseudo-transcript",
    "2. Main concepts explained",
    "3. Key exam-relevant points",
    "4. Important definitions",
    "5. Example questions",
    "6. Exam-style explanations with clear conceptual breakdown",
    "7. Definition-focused section with concise academic phrasing",
    "",
    "Output in long structured plain text format only.",
  ].join("\n");

  const raw = await withTimeout(generateWithGeminiModel(prompt, model), 20_000, "AI reconstruction timed out");
  const transcript = cleanTranscriptText(raw);
  if (!transcript) {
    throw new Error("AI reconstruction text is empty");
  }

  const preview = splitIntoChunks(transcript, 1200)[0] ?? "";
  const summary = preview ? `AI generated from video metadata.\n\n${preview}` : "AI generated from video metadata.";
  return { transcript, summary };
}

async function detectVideoLanguage(input: {
  title: string;
  description?: string;
  transcriptSample?: string;
}): Promise<"english" | "hindi" | "other"> {
  const prompt = [
    "Detect the language of this educational video content.",
    "Return exactly one word: english, hindi, or other.",
    `Title: ${input.title}`,
    `Description: ${input.description ?? ""}`,
    `Transcript sample: ${input.transcriptSample ?? ""}`,
  ].join("\n");

  try {
    const raw = await withTimeout(
      generateWithGeminiModel(prompt, FAST_MODEL),
      5_000,
      "Language detection timed out",
    );
    const normalized = raw.toLowerCase();
    if (normalized.includes("hindi")) {
      return "hindi";
    }
    if (normalized.includes("english")) {
      return "english";
    }
    return "other";
  } catch {
    return "english";
  }
}

async function translateTranscriptToEnglish(text: string, sourceLanguage: "hindi" | "other"): Promise<string> {
  const chunks = splitIntoChunks(text, 2800);
  const translatedParts: string[] = [];

  for (const piece of chunks) {
    const prompt = [
      "Translate transcript into clean academic English while preserving meaning.",
      `Source language: ${sourceLanguage}`,
      "Preserve technical terms, definitions, formulas, and exam-relevant wording.",
      "Return plain text only.",
      "Transcript:",
      piece,
    ].join("\n\n");

    const translated = await withTimeout(
      generateWithGeminiModel(prompt, FAST_MODEL),
      30_000,
      "Transcript translation timed out",
    );
    const cleaned = cleanTranscriptText(translated);
    if (cleaned) {
      translatedParts.push(cleaned);
    }
  }

  const merged = translatedParts.join("\n\n").trim();
  if (!merged) {
    throw new Error("Translated transcript is empty");
  }

  return merged;
}

async function generateVideoSummaryFallback(
  videoId: string,
  url: string,
  metadata: YouTubeMetadata,
): Promise<string> {
  const model = FAST_MODEL;
  const prompt = [
    "Create study notes from YouTube metadata when transcript is unavailable.",
    `Video URL: ${url}`,
    `Video title: ${metadata.title}`,
    `Author: ${metadata.author ?? "Unknown"}`,
    `Description: ${metadata.description ?? "No description available"}`,
    "Return structured notes with key concepts, definitions, and 3 exam-style questions.",
  ].join("\n");

  try {
    const raw = await withTimeout(
      generateWithGeminiModel(prompt, model),
      20_000,
      "AI summary generation timed out",
    );
    const summary = cleanTranscriptText(raw);
    if (summary) {
      return summary;
    }
  } catch {
    // deterministic fallback below
  }

  return [
    `No captions were available for \"${metadata.title}\".`,
    `Video URL: ${url}`,
    metadata.author ? `Author: ${metadata.author}` : undefined,
    "Generated study notes from video metadata.",
    "Main concepts are inferred and should be cross-checked with your uploaded study material.",
    "Exam tip: prioritize definitions, core frameworks, and example questions from these notes.",
  ]
    .filter(Boolean)
    .join("\n");
}

function toStructuredChunks(
  text: string,
  title: string,
  transcriptSource: TranscriptSource,
  summary?: string,
): ReconstructedChunk[] {
  const pieces = splitIntoChunks(text);
  const result: ReconstructedChunk[] = pieces.map((piece, index) => ({
    text: piece,
    section: transcriptSource === "captions" ? `Transcript ${index + 1}` : `Reconstructed Segment ${index + 1}`,
  }));

  if (summary && transcriptSource === "ai-reconstructed") {
    result.unshift({
      text: summary,
      section: "AI Summary",
    });
  }

  if (!result.length) {
    const fallback = splitIntoChunks(`Study notes for ${title}`);
    return fallback.map((piece, index) => ({ text: piece, section: `Reconstructed Segment ${index + 1}` }));
  }

  return result;
}

export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace("/", "") || null;
    }

    if (parsed.hostname.includes("youtube.com")) {
      const watchId = parsed.searchParams.get("v");
      if (watchId) {
        return watchId;
      }
      const parts = parsed.pathname.split("/").filter(Boolean);
      const embedIndex = parts.findIndex((value) => value === "embed" || value === "shorts");
      if (embedIndex >= 0 && parts[embedIndex + 1]) {
        return parts[embedIndex + 1];
      }
    }
  } catch {
    return null;
  }

  return null;
}

export async function ingestYouTubeTranscript(url: string): Promise<YouTubeIngestResult> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    throw new Error("Invalid YouTube URL");
  }

  const metadata = await fetchYouTubeMetadata(videoId);
  const cacheKey = FAST_MODEL;
  const cached = await readYoutubeReconstructionCache(videoId, cacheKey);
  if (cached?.chunks?.length) {
    return {
      videoId,
      title: cached.title,
      channel: cached.channel,
      summary: cached.summary,
      transcriptSource: cached.transcriptSource,
      youtubeMetadata: cached.youtubeMetadata,
      originalLanguage: cached.originalLanguage,
      translatedToEnglish: cached.translatedToEnglish,
      chunks: cached.chunks.map((chunk) => ({
        text: chunk.text,
        sourceType: "Study Material",
        sourceName: cached.title,
        section: chunk.section,
      })),
    };
  }

  let combined = "";
  let rawTranscript = "";
  let summary: string | undefined;
  let transcriptSource: TranscriptSource = "captions";
  let originalLanguage: "english" | "hindi" | "other" = "english";
  let translatedToEnglish = false;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const transcript = await withTimeout(
        YoutubeTranscript.fetchTranscript(videoId),
        10_000,
        "Transcript request timed out",
      );
      if (!transcript?.length) {
        throw new Error("Transcript unavailable for this video");
      }

      combined = transcript
        .map((segment) => segment.text.replace(/\n/g, " "))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (!combined) {
        throw new Error("Transcript text is empty");
      }

      rawTranscript = combined;
      break;
    } catch {
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  if (!combined) {
    try {
      const aiResult = await reconstructFromMetadata(videoId, url, metadata);
      combined = aiResult.transcript;
      rawTranscript = combined;
      summary = aiResult.summary;
      transcriptSource = "ai-reconstructed";
    } catch {
      const fallbackSummary = await generateVideoSummaryFallback(videoId, url, metadata);
      combined = fallbackSummary;
      rawTranscript = fallbackSummary;
      summary = "AI generated from video metadata.";
      transcriptSource = "ai-reconstructed";
    }
  }

  originalLanguage = await detectVideoLanguage({
    title: metadata.title,
    description: metadata.description,
    transcriptSample: combined.slice(0, 700),
  });
  if (originalLanguage !== "english") {
    combined = await translateTranscriptToEnglish(combined, originalLanguage);
    translatedToEnglish = true;
    summary = "AI generated from video metadata.";
  }

  const structuredChunks = toStructuredChunks(combined, metadata.title, transcriptSource, summary);
  const chunks: ParsedSourceChunk[] = structuredChunks.map((chunk) => ({
    text: chunk.text,
    sourceType: "Study Material",
    sourceName: metadata.title,
    section: chunk.section,
  }));

  if (transcriptSource === "ai-reconstructed") {
    await writeYoutubeReconstructionCache(videoId, cacheKey, {
      videoId,
      modelVersion: cacheKey,
      title: metadata.title,
      channel: metadata.author,
      transcriptSource,
      originalLanguage,
      translatedToEnglish,
      summary,
      rawTranscript,
      translatedTranscript: translatedToEnglish ? combined : undefined,
      youtubeMetadata: metadata,
      chunks: structuredChunks,
    });
  }

  return {
    videoId,
    title: metadata.title,
    channel: metadata.author,
    summary,
    transcriptSource,
    youtubeMetadata: metadata,
    originalLanguage,
    translatedToEnglish,
    chunks,
  };
}
