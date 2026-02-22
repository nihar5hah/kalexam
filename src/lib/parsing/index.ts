import { UploadedFile } from "@/lib/ai/types";
import { detectRepeatedTopics, extractSyllabusChapters } from "@/lib/parsing/exam-intelligence";
import { parseDocx } from "@/lib/parsing/parse-docx";
import { parsePdf } from "@/lib/parsing/parse-pdf";
import { parseLegacyPpt } from "@/lib/parsing/parse-ppt";
import { parsePptx } from "@/lib/parsing/parse-pptx";
import { byCategory, ParsedCorpus, ParsedSourceChunk } from "@/lib/parsing/types";

const SUPPORTED_EXTENSIONS = new Set(["pdf", "docx", "ppt", "pptx"]);

function extensionFromFile(file: UploadedFile): string {
  return file.extension.toLowerCase().replace(".", "");
}

function toTextLimit(text: string, maxLength = 35_000): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n...[truncated]` : text;
}

function sanitizeExtractedText(input: string): string {
  return input
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/[�]/g, " ")
    .replace(/[|]{2,}/g, " ")
    .replace(/[_=~`^]{3,}/g, " ")
    .replace(/(\b\w{2,20}\b)(?:\s+\1){3,}/gi, "$1")
    .replace(/([a-zA-Z])\1{5,}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

async function parseFileFromUrl(file: UploadedFile): Promise<{ text: string; warning?: string }> {
  const extension = extensionFromFile(file);
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    return { text: "", warning: `${file.name}: unsupported format (${extension})` };
  }

  const response = await fetch(file.url);
  if (!response.ok) {
    return { text: "", warning: `${file.name}: failed to fetch file` };
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  try {
    if (extension === "pdf") {
      return { text: await parsePdf(buffer) };
    }
    if (extension === "docx") {
      return { text: await parseDocx(buffer) };
    }
    if (extension === "pptx") {
      return { text: await parsePptx(buffer) };
    }

    const pptText = await parseLegacyPpt(buffer);
    return {
      text: pptText,
      warning: `${file.name}: legacy .ppt parsed with best-effort mode; convert to .pptx for better quality.`,
    };
  } catch {
    return { text: "", warning: `${file.name}: parser could not extract readable text` };
  }
}

async function parseCollection(files: UploadedFile[]) {
  return Promise.all(files.map((file) => parseFileFromUrl(file).then((result) => ({ file, ...result }))));
}

function splitSourceText(text: string, size = 700): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  for (let index = 0; index < normalized.length; index += size) {
    chunks.push(normalized.slice(index, index + size));
  }

  return chunks;
}

function extractYear(fileName: string): string | undefined {
  const match = fileName.match(/(19|20)\d{2}/);
  return match?.[0];
}

function toSourceType(file: UploadedFile): ParsedSourceChunk["sourceType"] {
  if (file.category === "previousPapers") {
    return "Previous Paper";
  }

  const lower = file.name.toLowerCase();
  if (lower.includes("question bank")) {
    return "Question Bank";
  }
  if (file.category === "syllabus") {
    return "Syllabus Derived";
  }

  return "Study Material";
}

function toSourceChunks(parsedItems: Array<{ file: UploadedFile; text: string }>): ParsedSourceChunk[] {
  return parsedItems.flatMap(({ file, text }) => {
    if (extensionFromFile(file) === "ppt") {
      return [];
    }

    const sanitized = sanitizeExtractedText(text);
    const pieces = splitSourceText(sanitized);
    const sourceType = toSourceType(file);
    const sourceYear = extractYear(file.name);

    return pieces.map((piece, index) => ({
      text: piece,
      sourceType,
      sourceName: file.name,
      sourceYear,
      section: `Chunk ${index + 1}`,
    }));
  });
}

export async function parseUploadedFiles(files: UploadedFile[]): Promise<ParsedCorpus> {
  const syllabusFiles = byCategory(files, "syllabus");
  const materialFiles = byCategory(files, "studyMaterial");
  const previousFiles = byCategory(files, "previousPapers");

  const [parsedSyllabus, parsedMaterial, parsedPrevious] = await Promise.all([
    parseCollection(syllabusFiles),
    parseCollection(materialFiles),
    parseCollection(previousFiles),
  ]);

  const warnings = [...parsedSyllabus, ...parsedMaterial, ...parsedPrevious]
    .map((item) => item.warning)
    .filter((warning): warning is string => Boolean(warning));

  const previousPaperText = toTextLimit(
    sanitizeExtractedText(parsedPrevious.map((item) => item.text).filter(Boolean).join("\n")),
  );
  const syllabusText = toTextLimit(
    sanitizeExtractedText(parsedSyllabus.map((item) => item.text).filter(Boolean).join("\n")),
  );
  const materialText = toTextLimit(
    sanitizeExtractedText(parsedMaterial.map((item) => item.text).filter(Boolean).join("\n")),
  );
  const sourceChunks = toSourceChunks([...parsedSyllabus, ...parsedMaterial, ...parsedPrevious]);

  return {
    syllabusText,
    materialText,
    previousPaperText,
    repeatedTopics: detectRepeatedTopics(previousPaperText),
    chapters: extractSyllabusChapters(syllabusText, materialText),
    sourceChunks,
    warnings,
  };
}
