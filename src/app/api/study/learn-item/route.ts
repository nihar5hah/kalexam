import { NextResponse } from "next/server";

import { UploadedFile } from "@/lib/ai/types";
import { resolveModelConfig } from "@/lib/ai/modelRouter";
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
  currentChapter?: string;
  examTimeRemaining?: string;
  studyMode?: string;
  examMode?: boolean;
  userIntent?: string;
};

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

    const modelConfig = resolveModelConfig(body);
    const content = await buildLearnItemContent(files, body.topic, body.item, modelConfig, {
      currentChapter: body.currentChapter,
      examTimeRemaining: body.examTimeRemaining,
      studyMode: body.studyMode,
      examMode: body.examMode,
      userIntent: body.userIntent,
    });

    return NextResponse.json(content);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
