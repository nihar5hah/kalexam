import { NextResponse } from "next/server";

import { ModelConfig, TopicPriority, UploadedFile } from "@/lib/ai/types";
import { buildTopicStudyContent } from "@/lib/study/rag";

export const runtime = "nodejs";

type TopicStudyRequest = {
  topic?: string;
  priority?: TopicPriority;
  files?: UploadedFile[];
  outlineOnly?: boolean;
  modelType?: "gemini" | "custom";
  modelConfig?: {
    baseUrl?: string;
    apiKey?: string;
    modelName?: string;
  } | null;
};

function toModelConfig(body: TopicStudyRequest): ModelConfig {
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
    const body = (await request.json()) as TopicStudyRequest;

    if (!body.topic?.trim()) {
      return NextResponse.json({ error: "Missing topic" }, { status: 400 });
    }

    const files = body.files ?? [];
    if (!files.length) {
      return NextResponse.json({ error: "Missing uploaded files context" }, { status: 400 });
    }

    const priority = body.priority ?? "medium";
    const modelConfig = toModelConfig(body);
    const content = await buildTopicStudyContent(files, body.topic, priority, modelConfig, {
      outlineOnly: Boolean(body.outlineOnly),
    });

    return NextResponse.json(content);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
