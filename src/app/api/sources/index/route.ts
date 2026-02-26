import { NextResponse } from "next/server";

import { UploadedFile } from "@/lib/ai/types";
import { splitIntoChunks } from "@/lib/parsing/chunker";
import { parseUploadedFiles } from "@/lib/parsing";
import { ingestUrlContent } from "@/lib/parsing/url";
import { ingestYouTubeTranscript } from "@/lib/parsing/youtube";
import { precomputeEmbeddingVectors } from "@/lib/study/precompute";

type SourceIndexRequest = {
  files?: UploadedFile[];
  syllabusTextInput?: string;
  youtubeUrls?: string[];
  websiteUrls?: string[];
};

type IndexedSource = {
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
};

type SourceIndexLifecycle =
  | "idle"
  | "preparing"
  | "parsing"
  | "fetching-transcript"
  | "fetching-metadata"
  | "ai-reconstruction"
  | "chunking"
  | "indexing"
  | "saving"
  | "completed"
  | "failed";

type IndexedChunk = {
  sourceId: string;
  text: string;
  sourceType: "Previous Paper" | "Question Bank" | "Study Material" | "Syllabus Derived";
  sourceName: string;
  sourceYear?: string;
  section: string;
};

function sourceIdFromLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function inferSourceType(file: UploadedFile): IndexedSource["type"] {
  const extension = file.extension.toLowerCase().replace(".", "");
  if (extension === "pdf") return "pdf";
  if (extension === "docx") return "docx";
  return "ppt";
}

function toFriendlySourceError(raw: string): string {
  const value = raw.toLowerCase();
  if (value.includes("transcript") && (value.includes("unavailable") || value.includes("disabled"))) {
    return "Video has no captions — generating AI study version…";
  }
  if (value.includes("youtube") && value.includes("invalid")) {
    return "This YouTube link looks invalid. Please check the URL and retry.";
  }
  if (value.includes("timeout") || value.includes("aborted")) {
    return "Analyzing video structure took too long. Please retry in a moment.";
  }
  return "Could not process this source right now. Please retry.";
}

function logLifecycle(state: SourceIndexLifecycle, context?: Record<string, unknown>) {
  console.info(`[source-index] ${state}`, context ?? {});
}

function logStage(stage: "START_INDEX" | "PARSE_COMPLETE" | "CHUNK_COMPLETE" | "FIRESTORE_WRITE_START" | "FIRESTORE_WRITE_DONE", context?: Record<string, unknown>) {
  console.info(`[source-index] ${stage}`, context ?? {});
}

function formatIndexError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to index sources";
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  logLifecycle("idle");
  try {
    logStage("START_INDEX");
    logLifecycle("preparing");
    const body = (await request.json()) as SourceIndexRequest;
    const files = body.files ?? [];
    const youtubeUrls = body.youtubeUrls ?? [];
    const websiteUrls = body.websiteUrls ?? [];

    logLifecycle("parsing", { fileCount: files.length, youtubeCount: youtubeUrls.length, websiteCount: websiteUrls.length });
    const parsed = await parseUploadedFiles(files);
    logStage("PARSE_COMPLETE", { parsedChunkCount: parsed.sourceChunks.length, warningCount: parsed.warnings.length });

    if (files.length > 0 && parsed.sourceChunks.length === 0) {
      const warningSummary = parsed.warnings.length
        ? ` Warnings: ${parsed.warnings.join(" | ")}`
        : "";
      throw new Error(`Parser produced zero chunks for uploaded files.${warningSummary}`);
    }

    logLifecycle("chunking");
    const sourceMap = new Map<string, IndexedSource>();
    const fileSourceIdByName = new Map<string, string>();
    const chunks: IndexedChunk[] = [];

    for (const file of files) {
      const id = sourceIdFromLabel(`${file.category}:${file.name}`);
      fileSourceIdByName.set(file.name.trim().toLowerCase(), id);
      sourceMap.set(id, {
        id,
        type: inferSourceType(file),
        title: file.name,
        status: "indexed",
        enabled: true,
        fileUrl: file.url,
        chunkCount: 0,
      });
    }

    parsed.sourceChunks.forEach((chunk) => {
      const normalizedSourceName = chunk.sourceName.trim().toLowerCase();
      const matchedId = fileSourceIdByName.get(normalizedSourceName);
      const id = matchedId ?? sourceIdFromLabel(`chunk:${chunk.sourceType}:${chunk.sourceName}`);
      if (!matchedId) {
        console.warn("[source-index] file source id lookup miss", {
          sourceName: chunk.sourceName,
          normalizedSourceName,
          fallbackId: id,
        });
      }
      if (!sourceMap.has(id)) {
        sourceMap.set(id, {
          id,
          type: "text",
          title: chunk.sourceName,
          status: "indexed",
          enabled: true,
          chunkCount: 0,
        });
      }

      chunks.push({
        sourceId: id,
        text: chunk.text,
        sourceType: chunk.sourceType,
        sourceName: chunk.sourceName,
        sourceYear: chunk.sourceYear,
        section: chunk.section,
      });

      const existing = sourceMap.get(id);
      if (existing) {
        existing.chunkCount += 1;
        sourceMap.set(id, existing);
      }
    });

    const syllabusText = body.syllabusTextInput?.trim() ?? "";
    if (syllabusText) {
      const textSourceId = sourceIdFromLabel("text:manual-syllabus");
      const textChunks = splitIntoChunks(syllabusText);
      sourceMap.set(textSourceId, {
        id: textSourceId,
        type: "text",
        title: "Manual Syllabus Text",
        status: "indexed",
        enabled: true,
        chunkCount: textChunks.length,
      });

      textChunks.forEach((text, index) => {
        chunks.push({
          sourceId: textSourceId,
          text,
          sourceType: "Syllabus Derived",
          sourceName: "Manual Syllabus Text",
          section: `Text Chunk ${index + 1}`,
        });
      });
    }

    logStage("CHUNK_COMPLETE", { chunkCount: chunks.length, sourceCount: sourceMap.size });
    logLifecycle("indexing");
    for (const youtubeUrl of youtubeUrls) {
      const id = sourceIdFromLabel(`youtube:${youtubeUrl}`);
      try {
        logStage("FIRESTORE_WRITE_START", { kind: "youtube", url: youtubeUrl });
        logLifecycle("fetching-transcript", { kind: "youtube", url: youtubeUrl });
        const result = await ingestYouTubeTranscript(youtubeUrl);
        logLifecycle("fetching-metadata", { kind: "youtube", url: youtubeUrl });
        if (result.transcriptSource === "ai-reconstructed") {
          logLifecycle("ai-reconstruction", { kind: "youtube", url: youtubeUrl });
        }
        sourceMap.set(id, {
          id,
          type: "youtube",
          title: result.title,
          status: "indexed",
          enabled: true,
          youtubeUrl,
          videoId: result.videoId,
          aiGeneratedTranscript: result.transcriptSource === "ai-reconstructed",
          transcriptSource: result.transcriptSource,
          videoLanguage: result.originalLanguage,
          translatedToEnglish: result.translatedToEnglish,
          chunkCount: result.chunks.length,
        });

        result.chunks.forEach((chunk) => {
          chunks.push({
            sourceId: id,
            text: chunk.text,
            sourceType: chunk.sourceType,
            sourceName: chunk.sourceName,
            sourceYear: chunk.sourceYear,
            section: chunk.section,
          });
        });
        logStage("FIRESTORE_WRITE_DONE", { kind: "youtube", url: youtubeUrl, chunks: result.chunks.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Transcript unavailable";
        sourceMap.set(id, {
          id,
          type: "youtube",
          title: youtubeUrl,
          status: "error",
          enabled: false,
          youtubeUrl,
          chunkCount: 0,
          errorMessage: toFriendlySourceError(message),
        });
      }
    }

    for (const websiteUrl of websiteUrls) {
      const id = sourceIdFromLabel(`url:${websiteUrl}`);
      try {
        logStage("FIRESTORE_WRITE_START", { kind: "url", url: websiteUrl });
        const result = await ingestUrlContent(websiteUrl);
        sourceMap.set(id, {
          id,
          type: "url",
          title: result.title,
          status: "indexed",
          enabled: true,
          websiteUrl,
          chunkCount: result.chunks.length,
        });

        result.chunks.forEach((chunk) => {
          chunks.push({
            sourceId: id,
            text: chunk.text,
            sourceType: chunk.sourceType,
            sourceName: chunk.sourceName,
            sourceYear: chunk.sourceYear,
            section: chunk.section,
          });
        });
        logStage("FIRESTORE_WRITE_DONE", { kind: "url", url: websiteUrl, chunks: result.chunks.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : "URL extraction failed";
        sourceMap.set(id, {
          id,
          type: "url",
          title: websiteUrl,
          status: "error",
          enabled: false,
          websiteUrl,
          chunkCount: 0,
          errorMessage: toFriendlySourceError(message),
        });
      }
    }

    if (chunks.length === 0) {
      const warningSummary = parsed.warnings.length
        ? ` Warnings: ${parsed.warnings.join(" | ")}`
        : "";
      throw new Error(`Parser produced zero chunks.${warningSummary}`);
    }

    logLifecycle("saving", { sourceCount: sourceMap.size, chunkCount: chunks.length });
    void precomputeEmbeddingVectors(chunks).catch((error) => {
      const message = error instanceof Error ? error.message : "unknown";
      console.warn("[source-index] embedding precompute skipped", { message });
    });
    logLifecycle("completed");
    return NextResponse.json({
      sources: Array.from(sourceMap.values()),
      chunks,
      warnings: parsed.warnings,
    });
  } catch (error) {
    const detail = formatIndexError(error);
    logLifecycle("failed", { error: detail });
    return NextResponse.json({ error: "Unable to index sources", detail }, { status: 400 });
  }
}
