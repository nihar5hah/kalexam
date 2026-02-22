import { FileCategory, RepeatedTopic, SyllabusChapterHint, UploadedFile } from "@/lib/ai/types";

export type ParsedSourceChunk = {
  text: string;
  sourceType: "Previous Paper" | "Question Bank" | "Study Material" | "Syllabus Derived";
  sourceName: string;
  sourceYear?: string;
  section: string;
};

export type ParsedFile = {
  file: UploadedFile;
  text: string;
  warning?: string;
};

export type ParsedByCategory = {
  syllabus: ParsedFile[];
  studyMaterial: ParsedFile[];
  previousPapers: ParsedFile[];
};

export type ParsedCorpus = {
  syllabusText: string;
  materialText: string;
  previousPaperText: string;
  repeatedTopics: RepeatedTopic[];
  chapters: SyllabusChapterHint[];
  sourceChunks: ParsedSourceChunk[];
  warnings: string[];
};

export function byCategory(files: UploadedFile[], category: FileCategory) {
  return files.filter((file) => file.category === category);
}
