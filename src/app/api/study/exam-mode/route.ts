import { NextResponse } from "next/server";

import { UploadedFile } from "@/lib/ai/types";
import { resolveModelConfig } from "@/lib/ai/modelRouter";
import { RequestAuthError, getAuthenticatedUid } from "@/lib/server/auth";
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
  currentChapter?: string;
  examTimeRemaining?: string;
  studyMode?: string;
  examMode?: boolean;
  userIntent?: string;
  userId?: string;
  strategyId?: string;
};

export async function POST(request: Request) {
  try {
    const authenticatedUid = await getAuthenticatedUid(request);
    const debugRetrieval = new URL(request.url).searchParams.get("debugRetrieval") === "true";
    const body = (await request.json()) as ExamModeRequest;

    if (body.userId && body.userId !== authenticatedUid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!body.topic?.trim()) {
      return NextResponse.json({ error: "Missing topic" }, { status: 400 });
    }

    const files = body.files ?? [];
    if (!files.length) {
      return NextResponse.json({ error: "Missing uploaded files context" }, { status: 400 });
    }

    const modelConfig = resolveModelConfig(body);
    const result = await buildExamModeContent(files, body.topic, modelConfig, {
      currentChapter: body.currentChapter,
      examTimeRemaining: body.examTimeRemaining,
      studyMode: body.studyMode,
      examMode: body.examMode,
      userIntent: body.userIntent,
      userId: authenticatedUid,
      strategyId: body.strategyId,
      debugRetrieval,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
