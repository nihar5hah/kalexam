import { NextResponse } from "next/server";

import { ModelConfig, UploadedFile } from "@/lib/ai/types";
import { buildExamModeContent } from "@/lib/study/rag";

export const runtime = "nodejs";

type ExamModeRequest = {
  topic?: string;
  files?: UploadedFile[];
  modelType?: "gemini" | "custom";
  modelConfig?: {
    baseUrl?: string;
    apiKey?: string;
    modelName?: string;
  } | null;
};

function toModelConfig(body: ExamModeRequest): ModelConfig {
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
    const body = (await request.json()) as ExamModeRequest;

    if (!body.topic?.trim()) {
      return NextResponse.json({ error: "Missing topic" }, { status: 400 });
    }

    const files = body.files ?? [];
    if (!files.length) {
      return NextResponse.json({ error: "Missing uploaded files context" }, { status: 400 });
    }

    const modelConfig = toModelConfig(body);
    const result = await buildExamModeContent(files, body.topic, modelConfig);

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
