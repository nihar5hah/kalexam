import { NextResponse } from "next/server";

import { ModelConfig, UploadedFile } from "@/lib/ai/types";
import { buildMicroQuizContent } from "@/lib/study/rag";

export const runtime = "nodejs";

type MicroQuizRequest = {
  topic?: string;
  files?: UploadedFile[];
  count?: number;
  modelType?: "gemini" | "custom";
  modelConfig?: {
    baseUrl?: string;
    apiKey?: string;
    modelName?: string;
  } | null;
};

function toModelConfig(body: MicroQuizRequest): ModelConfig {
  if (body.modelType === "custom") {
    if (!body.modelConfig?.baseUrl || !body.modelConfig?.apiKey || !body.modelConfig?.modelName) {
      throw new Error("Missing custom model configuration");
    }

    return {
      modelType: "custom",
      config: {
        baseUrl: body.modelConfig.baseUrl,
        apiKey: body.modelConfig.apiKey,
        modelName: body.modelConfig.modelName,
      },
    };
  }

  return { modelType: "gemini" };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MicroQuizRequest;
    if (!body.topic?.trim()) {
      return NextResponse.json({ error: "Missing topic" }, { status: 400 });
    }

    const files = body.files ?? [];
    if (!files.length) {
      return NextResponse.json({ error: "Missing files" }, { status: 400 });
    }

    const modelConfig = toModelConfig(body);
    const count = Math.max(3, Math.min(5, Math.round(body.count ?? 4)));
    const quiz = await buildMicroQuizContent(files, body.topic, modelConfig, count);
    return NextResponse.json(quiz);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
