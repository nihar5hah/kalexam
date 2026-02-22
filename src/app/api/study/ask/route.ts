import { NextResponse } from "next/server";

import { ModelConfig, UploadedFile } from "@/lib/ai/types";
import { answerTopicQuestion } from "@/lib/study/rag";

export const runtime = "nodejs";

type TopicQuestionRequest = {
  topic?: string;
  question?: string;
  files?: UploadedFile[];
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  modelType?: "gemini" | "custom";
  modelConfig?: {
    baseUrl?: string;
    apiKey?: string;
    modelName?: string;
  } | null;
};

function toModelConfig(body: TopicQuestionRequest): ModelConfig {
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
    const body = (await request.json()) as TopicQuestionRequest;

    if (!body.topic?.trim()) {
      return NextResponse.json({ error: "Missing topic" }, { status: 400 });
    }

    if (!body.question?.trim()) {
      return NextResponse.json({ error: "Missing question" }, { status: 400 });
    }

    const files = body.files ?? [];
    if (!files.length) {
      return NextResponse.json({ error: "Missing uploaded files context" }, { status: 400 });
    }

    const modelConfig = toModelConfig(body);
    const answer = await answerTopicQuestion(files, body.topic, body.question, modelConfig, body.history ?? []);
    return NextResponse.json(answer);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
