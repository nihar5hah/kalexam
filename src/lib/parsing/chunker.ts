/**
 * Smart text chunking shared across YouTube, URL, and manual-text ingestion paths.
 *
 * Strategy (in order of preference):
 *  1. Split on paragraph boundaries (double-newline)
 *  2. Merge short paragraphs until approaching targetChars
 *  3. Split long paragraphs at sentence boundaries (.!?)
 *  4. Hard-split on word boundary as last resort
 *
 * Target: 300–600 tokens ≈ 1200–2400 chars (we approximate at 4 chars/token).
 */

const DEFAULT_TARGET_CHARS = 1800; // ~450 tokens
const MAX_CHARS = 2400; // ~600 tokens, hard cap per chunk

function splitAtSentenceBoundary(text: string, maxChars: number): string[] {
  // Split at sentence-ending punctuation followed by whitespace
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (!sentence.trim()) continue;
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) chunks.push(current.trim());
      // If single sentence exceeds maxChars, hard-split at word boundary
      if (sentence.length > maxChars) {
        const words = sentence.split(/\s+/);
        let wordBuffer = "";
        for (const word of words) {
          const next = wordBuffer ? `${wordBuffer} ${word}` : word;
          if (next.length <= maxChars) {
            wordBuffer = next;
          } else {
            if (wordBuffer) chunks.push(wordBuffer.trim());
            wordBuffer = word;
          }
        }
        current = wordBuffer;
      } else {
        current = sentence;
      }
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function splitIntoChunks(text: string, targetChars = DEFAULT_TARGET_CHARS): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!normalized) return [];

  // Step 1: split on paragraph boundaries
  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.replace(/\n/g, " ").trim()).filter(Boolean);

  const result: string[] = [];
  let buffer = "";

  for (const para of paragraphs) {
    const candidate = buffer ? `${buffer}\n\n${para}` : para;

    if (candidate.length <= targetChars) {
      buffer = candidate;
    } else if (buffer) {
      // flush buffer
      result.push(buffer.trim());
      // if this paragraph alone is too large, sentence-split it
      if (para.length > MAX_CHARS) {
        const sentenceChunks = splitAtSentenceBoundary(para, MAX_CHARS);
        const last = sentenceChunks.pop();
        result.push(...sentenceChunks);
        buffer = last ?? "";
      } else {
        buffer = para;
      }
    } else {
      // buffer was empty, para itself exceeds target
      if (para.length > MAX_CHARS) {
        const sentenceChunks = splitAtSentenceBoundary(para, MAX_CHARS);
        const last = sentenceChunks.pop();
        result.push(...sentenceChunks);
        buffer = last ?? "";
      } else {
        buffer = para;
      }
    }
  }

  if (buffer.trim()) result.push(buffer.trim());

  // Final safety pass: any chunk still over MAX_CHARS gets hard-split
  return result.flatMap((chunk) => {
    if (chunk.length <= MAX_CHARS) return [chunk];
    return splitAtSentenceBoundary(chunk, MAX_CHARS);
  });
}
