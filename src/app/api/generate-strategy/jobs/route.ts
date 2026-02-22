import { NextResponse } from "next/server";

import { createStrategyJob, getStrategyJob, type StrategyPipelineRequest } from "@/lib/ai/strategy-orchestrator";

export const runtime = "nodejs";

type CreateJobRequestBody = StrategyPipelineRequest & {
  userId?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateJobRequestBody;

    if (!body.userId?.trim()) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const job = await createStrategyJob(body.userId, {
      hoursLeft: body.hoursLeft,
      syllabusFiles: body.syllabusFiles ?? [],
      syllabusTextInput: body.syllabusTextInput ?? "",
      studyMaterialFiles: body.studyMaterialFiles ?? [],
      previousPaperFiles: body.previousPaperFiles ?? [],
      modelType: body.modelType,
      modelConfig: body.modelConfig ?? null,
    });

    return NextResponse.json({
      jobId: job.id,
      stage: job.stage,
      progress: job.progress,
    });
  } catch {
    return NextResponse.json({ error: "Unable to create strategy job" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("id");
  const userId = searchParams.get("userId");

  if (!jobId || !userId?.trim()) {
    return NextResponse.json({ error: "Missing job id or userId" }, { status: 400 });
  }

  const job = await getStrategyJob(userId, jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    job: {
      id: job.id,
      stage: job.stage,
      progress: job.progress,
      error: job.error,
      strategy: job.result,
      updatedAt: job.updatedAt,
    },
  });
}
