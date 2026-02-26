import { splitIntoChunks } from "@/lib/parsing/chunker";
import { ParsedSourceChunk } from "@/lib/parsing/types";

type UrlIngestResult = {
  title: string;
  chunks: ParsedSourceChunk[];
};

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function extractPageTitle(html: string): string | null {
  const match = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return match?.[1]?.trim() ?? null;
}

export async function ingestUrlContent(url: string): Promise<UrlIngestResult> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; KalExam/1.0; +https://kalexam.app)" },
  });
  if (!response.ok) {
    throw new Error(`Unable to fetch URL (${response.status})`);
  }

  const html = await response.text();
  const text = stripHtml(html);
  const chunksText = splitIntoChunks(text);
  if (!chunksText.length) {
    throw new Error("No readable text found at that URL");
  }

  const hostname = new URL(url).hostname.replace(/^www\./, "");
  const pageTitle = extractPageTitle(html);
  const title = pageTitle ? `${pageTitle} (${hostname})` : `Website: ${hostname}`;

  const chunks: ParsedSourceChunk[] = chunksText.map((chunk, index) => ({
    text: chunk,
    sourceType: "Study Material",
    sourceName: title,
    section: `Page Chunk ${index + 1}`,
  }));

  return { title, chunks };
}
