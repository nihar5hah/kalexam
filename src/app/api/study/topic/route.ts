import { NextResponse } from "next/server";

import { TopicPriority, UploadedFile } from "@/lib/ai/types";
import { resolveModelConfig } from "@/lib/ai/modelRouter";
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
  currentChapter?: string;
  examTimeRemaining?: string;
  studyMode?: string;
  examMode?: boolean;
  userIntent?: string;
};

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
    const modelConfig = resolveModelConfig(body);
    const content = await buildTopicStudyContent(files, body.topic, priority, modelConfig, {
      outlineOnly: Boolean(body.outlineOnly),
      context: {
        currentChapter: body.currentChapter,
        examTimeRemaining: body.examTimeRemaining,
        studyMode: body.studyMode,
        examMode: body.examMode,
        userIntent: body.userIntent,
      },
    });

    return NextResponse.json(content);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
