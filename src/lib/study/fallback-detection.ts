import { FALLBACK_MESSAGE } from "@/lib/study/constants";

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function isFallbackLikeText(value: unknown): boolean {
  const stringValue = normalizeText(value);
  if (!stringValue) {
    return false;
  }

  const normalized = stringValue;
  const fallback = normalizeText(FALLBACK_MESSAGE);

  return (
    normalized === fallback ||
    normalized.startsWith(fallback) ||
    normalized.includes("not found in uploaded material") ||
    normalized.includes("not directly found in your material") ||
    normalized.includes("no matching concept found")
  );
}

export function isFallbackLikeTopicPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const record = payload as Record<string, unknown>;
  const simpleExplanation = record.explanation && typeof record.explanation === "object" 
    ? (record.explanation as Record<string, unknown>).simpleExplanation
    : undefined;
  
  if (isFallbackLikeText(simpleExplanation)) {
    return true;
  }

  const hasNoLearnItems = Array.isArray(record.whatToLearn) && record.whatToLearn.length === 0;
  return hasNoLearnItems && record.confidence === "low";
}

export function isFallbackLikeLearnPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const record = payload as Record<string, unknown>;
  return isFallbackLikeText(record.fullAnswer) || isFallbackLikeText(record.conceptExplanation);
}

export function isFallbackLikeChatPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const record = payload as Record<string, unknown>;
  return isFallbackLikeText(record.answer);
}