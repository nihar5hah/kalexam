import { NextResponse } from "next/server";

import { ModelConfig, UploadedFile } from "@/lib/ai/types";
import { buildLearnItemContent } from "@/lib/study/rag";

export const runtime = "nodejs";

type LearnItemRequest = {
  topic?: string;
  item?: string;
  files?: UploadedFile[];
  modelType?: "gemini" | "custom";
  modelConfig?: {
    baseUrl?: string;
    apiKey?: string;
    modelName?: string;
  } | null;
};

function toModelConfig(body: LearnItemRequest): ModelConfig {
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
    const body = (await request.json()) as LearnItemRequest;

    if (!body.topic?.trim()) {
      return NextResponse.json({ error: "Missing topic" }, { status: 400 });
    }

    if (!body.item?.trim()) {
      return NextResponse.json({ error: "Missing learning item" }, { status: 400 });
    }

    const files = body.files ?? [];
    if (!files.length) {
      return NextResponse.json({ error: "Missing uploaded files context" }, { status: 400 });
    }

    const modelConfig = toModelConfig(body);
    const content = await buildLearnItemContent(files, body.topic, body.item, modelConfig);

    return NextResponse.json(content);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
