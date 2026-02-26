import { ModelConfig } from "@/lib/ai/types";
import { generateWithCustomProvider } from "@/lib/ai/providers/custom";
import { generateWithCustomProviderStream } from "@/lib/ai/providers/custom";
import { generateWithGeminiModel } from "@/lib/ai/providers/gemini";
import { generateWithGeminiModelStream } from "@/lib/ai/providers/gemini";

export const SMART_MODEL = "gemini-3.1-pro-preview";
export const FAST_MODEL = "gemini-3-flash-preview";

export type AiTaskType =
  | "strategy_generation"
  | "chapter_prioritization"
  | "exam_readiness_scoring"
  | "crash_course_generation"
  | "topic_ranking"
  | "adaptive_path"
  | "learn_now_answer"
  | "quick_explanation"
  | "chat_follow_up"
  | "concept_summary"
  | "topic_description"
  | "label_generation"
  | "quiz_generation"
  | "source_summarization"
  | "clarification_question"
  | "exam_mode_generation";

export type RoutingMeta = {
  taskType: AiTaskType;
  modelUsed: string;
  fallbackTriggered: boolean;
  fallbackReason?: string;
  latencyMs: number;
};

export type RouteModelSelectionInput = {
  modelType?: "gemini" | "custom";
  modelConfig?: {
    baseUrl?: string;
    apiKey?: string;
    modelName?: string;
  } | null;
};

type QualitySignals = {
  retrievalConfidence?: "high" | "medium" | "low";
  minChars?: number;
  requiresJson?: boolean;
};

type RoutedGenerationInput = {
  prompt: string;
  taskType: AiTaskType;
  modelConfig: ModelConfig;
  complexityScore?: number;
  qualitySignals?: QualitySignals;
};

type DeltaHandler = (chunk: string) => void;

type ProviderErrorCode =
  | "missing_api_key"
  | "request_failed"
  | "empty_response"
  | "unknown_provider_error";

class ModelRouterGenerationError extends Error {
  readonly code: ProviderErrorCode;

  constructor(code: ProviderErrorCode, message: string) {
    super(message);
    this.name = "ModelRouterGenerationError";
    this.code = code;
  }
}

const SMART_TASKS = new Set<AiTaskType>([
  "strategy_generation",
  "chapter_prioritization",
  "exam_readiness_scoring",
  "crash_course_generation",
  "topic_ranking",
  "adaptive_path",
]);

export function routeModel(taskType: AiTaskType, complexityScore = 0): typeof FAST_MODEL | typeof SMART_MODEL {
  if (SMART_TASKS.has(taskType) || complexityScore >= 0.8) {
    return SMART_MODEL;
  }
  return FAST_MODEL;
}

function parseJsonCandidate(raw: string): boolean {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  const candidate = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? cleaned;
  try {
    JSON.parse(candidate);
    return true;
  } catch {
    return false;
  }
}

function looksGeneric(raw: string): boolean {
  const value = raw.toLowerCase();
  return (
    value.includes("as an ai") ||
    value.includes("i cannot") ||
    value.includes("not enough information") ||
    value.includes("it depends")
  );
}

function evaluateFastOutputQuality(raw: string, signals?: QualitySignals): { ok: boolean; reason?: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reason: "empty explanation" };
  }

  if ((signals?.minChars ?? 120) > trimmed.length) {
    return { ok: false, reason: "output too short" };
  }

  if (signals?.requiresJson && !parseJsonCandidate(trimmed)) {
    return { ok: false, reason: "missing answer structure" };
  }

  if (signals?.retrievalConfidence === "low") {
    return { ok: false, reason: "low retrieval confidence" };
  }

  if (looksGeneric(trimmed)) {
    return { ok: false, reason: "generic response" };
  }

  return { ok: true };
}

function classifyProviderError(error: unknown): ProviderErrorCode {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String((error as { code?: unknown }).code ?? "");
    if (code === "missing_api_key" || code === "request_failed" || code === "empty_response") {
      return code;
    }
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("missing") && message.includes("api")) {
      return "missing_api_key";
    }
    if (message.includes("empty response")) {
      return "empty_response";
    }
    if (message.includes("request failed") || message.includes("status")) {
      return "request_failed";
    }
  }

  return "unknown_provider_error";
}

async function runWithModel(prompt: string, modelConfig: ModelConfig, modelName: string): Promise<string> {
  try {
    if (modelConfig.modelType === "custom") {
      return generateWithCustomProvider(prompt, modelConfig.config);
    }

    return generateWithGeminiModel(prompt, modelName);
  } catch (error) {
    const code = classifyProviderError(error);
    const message = error instanceof Error ? error.message : "Unknown provider error";
    throw new ModelRouterGenerationError(code, message);
  }
}

async function runWithModelStream(
  prompt: string,
  modelConfig: ModelConfig,
  modelName: string,
  onDelta: DeltaHandler,
): Promise<string> {
  try {
    if (modelConfig.modelType === "custom") {
      return generateWithCustomProviderStream(prompt, modelConfig.config, onDelta);
    }

    return generateWithGeminiModelStream(prompt, modelName, onDelta);
  } catch (error) {
    const code = classifyProviderError(error);
    const message = error instanceof Error ? error.message : "Unknown provider error";
    throw new ModelRouterGenerationError(code, message);
  }
}

export async function generateWithModelRouter(
  input: RoutedGenerationInput,
): Promise<{ text: string; meta: RoutingMeta }> {
  const startedAt = Date.now();

  if (input.modelConfig.modelType === "custom") {
    const text = await runWithModel(input.prompt, input.modelConfig, input.modelConfig.config.modelName);
    return {
      text,
      meta: {
        taskType: input.taskType,
        modelUsed: input.modelConfig.config.modelName,
        fallbackTriggered: false,
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  const primaryModel = routeModel(input.taskType, input.complexityScore);
  let primary = "";
  let primaryErrorCode: ProviderErrorCode | null = null;

  try {
    primary = await runWithModel(input.prompt, input.modelConfig, primaryModel);
  } catch (error) {
    primaryErrorCode = classifyProviderError(error);
  }

  if (primaryModel === SMART_MODEL) {
    if (!primary) {
      throw new ModelRouterGenerationError(
        primaryErrorCode ?? "unknown_provider_error",
        `smart_model_failed:${primaryErrorCode ?? "unknown_provider_error"}`,
      );
    }

    return {
      text: primary,
      meta: {
        taskType: input.taskType,
        modelUsed: SMART_MODEL,
        fallbackTriggered: false,
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  if (!primary) {
    const upgradedAfterPrimaryError = await runWithModel(input.prompt, input.modelConfig, SMART_MODEL);
    return {
      text: upgradedAfterPrimaryError,
      meta: {
        taskType: input.taskType,
        modelUsed: SMART_MODEL,
        fallbackTriggered: true,
        fallbackReason: `primary_model_error:${primaryErrorCode ?? "unknown_provider_error"}`,
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  const quality = evaluateFastOutputQuality(primary, input.qualitySignals);
  if (quality.ok) {
    return {
      text: primary,
      meta: {
        taskType: input.taskType,
        modelUsed: FAST_MODEL,
        fallbackTriggered: false,
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  const upgraded = await runWithModel(input.prompt, input.modelConfig, SMART_MODEL);

  return {
    text: upgraded,
    meta: {
      taskType: input.taskType,
      modelUsed: SMART_MODEL,
      fallbackTriggered: true,
      fallbackReason: quality.reason,
      latencyMs: Date.now() - startedAt,
    },
  };
}

export async function generateWithModelRouterStream(
  input: RoutedGenerationInput,
  onDelta: DeltaHandler,
): Promise<{ text: string; meta: RoutingMeta }> {
  const startedAt = Date.now();

  if (input.modelConfig.modelType === "custom") {
    const text = await runWithModelStream(input.prompt, input.modelConfig, input.modelConfig.config.modelName, onDelta);
    return {
      text,
      meta: {
        taskType: input.taskType,
        modelUsed: input.modelConfig.config.modelName,
        fallbackTriggered: false,
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  const primaryModel = routeModel(input.taskType, input.complexityScore);

  try {
    const text = await runWithModelStream(input.prompt, input.modelConfig, primaryModel, onDelta);
    return {
      text,
      meta: {
        taskType: input.taskType,
        modelUsed: primaryModel,
        fallbackTriggered: false,
        latencyMs: Date.now() - startedAt,
      },
    };
  } catch (error) {
    const primaryErrorCode = classifyProviderError(error);
    if (primaryModel === SMART_MODEL) {
      throw new ModelRouterGenerationError(
        primaryErrorCode ?? "unknown_provider_error",
        `smart_model_failed:${primaryErrorCode ?? "unknown_provider_error"}`,
      );
    }

    const upgraded = await runWithModelStream(input.prompt, input.modelConfig, SMART_MODEL, onDelta);
    return {
      text: upgraded,
      meta: {
        taskType: input.taskType,
        modelUsed: SMART_MODEL,
        fallbackTriggered: true,
        fallbackReason: `primary_model_error:${primaryErrorCode ?? "unknown_provider_error"}`,
        latencyMs: Date.now() - startedAt,
      },
    };
  }
}

export function resolveModelConfig(selection: RouteModelSelectionInput): ModelConfig {
  if (selection.modelType === "custom") {
    if (
      !selection.modelConfig?.baseUrl ||
      !selection.modelConfig?.apiKey ||
      !selection.modelConfig?.modelName
    ) {
      throw new Error("Missing custom model configuration");
    }

    return {
      modelType: "custom",
      config: {
        baseUrl: selection.modelConfig.baseUrl,
        apiKey: selection.modelConfig.apiKey,
        modelName: selection.modelConfig.modelName,
      },
    };
  }

  return { modelType: "gemini" };
}
