import { NextResponse } from "next/server";

import { UploadedFile } from "@/lib/ai/types";
import { resolveModelConfig } from "@/lib/ai/modelRouter";
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
  currentChapter?: string;
  examTimeRemaining?: string;
  studyMode?: string;
  examMode?: boolean;
  userIntent?: string;
};

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

    const modelConfig = resolveModelConfig(body);
    const count = Math.max(3, Math.min(5, Math.round(body.count ?? 4)));
    const quiz = await buildMicroQuizContent(files, body.topic, modelConfig, count, {
      currentChapter: body.currentChapter,
      examTimeRemaining: body.examTimeRemaining,
      studyMode: body.studyMode,
      examMode: body.examMode,
      userIntent: body.userIntent,
    });
    return NextResponse.json(quiz);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
