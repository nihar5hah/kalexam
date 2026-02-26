import { NextResponse } from "next/server";

import { UploadedFile } from "@/lib/ai/types";
import { resolveModelConfig } from "@/lib/ai/modelRouter";
import { buildLearnItemContent } from "@/lib/study/rag";
import { buildLearnItemContentStream } from "@/lib/study/rag";

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
  stream?: boolean;
  userId?: string;
  strategyId?: string;
};

function createSseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function enqueueSseEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  payload: Record<string, unknown>,
) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
}

export async function POST(request: Request) {
  try {
    const debugRetrieval = new URL(request.url).searchParams.get("debugRetrieval") === "true";
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
    if (!body.stream) {
      const content = await buildLearnItemContent(files, body.topic, body.item, modelConfig, {
        currentChapter: body.currentChapter,
        examTimeRemaining: body.examTimeRemaining,
        studyMode: body.studyMode,
        examMode: body.examMode,
        userIntent: body.userIntent,
        userId: body.userId,
        strategyId: body.strategyId,
        debugRetrieval,
      });

      return NextResponse.json(content);
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          enqueueSseEvent(controller, encoder, { type: "started" });

          const content = await buildLearnItemContentStream(
            files,
            body.topic!,
            body.item!,
            modelConfig,
            {
              currentChapter: body.currentChapter,
              examTimeRemaining: body.examTimeRemaining,
              studyMode: body.studyMode,
              examMode: body.examMode,
              userIntent: body.userIntent,
              userId: body.userId,
              strategyId: body.strategyId,
              debugRetrieval,
            },
            (chunk) => {
              enqueueSseEvent(controller, encoder, { type: "delta", chunk });
            },
          );

          enqueueSseEvent(controller, encoder, {
            type: "done",
            payload: content,
          });
        } catch {
          enqueueSseEvent(controller, encoder, {
            type: "error",
            message: "Unable to generate this learning block.",
          });
        } finally {
          controller.close();
        }
      },
    });

    return createSseResponse(stream);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
