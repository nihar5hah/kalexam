/**
 * In-memory strategy job store for server-side API routes.
 *
 * Strategy job documents are created and updated exclusively from Next.js API
 * routes (server side). Using the Firebase client SDK server-side has no
 * authenticated user context, so every Firestore write would be rejected with
 * PERMISSION_DENIED by the security rules.  Keeping this state in memory
 * avoids that entirely — the `runtime = "nodejs"` on the route keeps the
 * process alive between requests so state is preserved for the lifetime of
 * a job.
 */

import { StrategyResult } from "@/lib/ai/types";

export type StrategyJobStage =
  | "queued"
  | "extracting_text"
  | "analyzing_chapters"
  | "generating_strategy"
  | "preparing_study_content"
  | "complete"
  | "failed";

export type StrategyJobStatus = "running" | "complete" | "failed";

export type StrategyJobDoc = {
  jobId: string;
  userId: string;
  status: StrategyJobStatus;
  stage: StrategyJobStage;
  progress: number;
  createdAt: number;
  updatedAt: number;
  strategy?: StrategyResult;
  error?: string;
};

// Module-level map — lives as long as the Node.js process.
const jobStore = new Map<string, StrategyJobDoc>();

export async function createStrategyJobDoc(input: {
  jobId: string;
  userId: string;
  stage: StrategyJobStage;
  progress: number;
}): Promise<void> {
  const now = Date.now();
  jobStore.set(input.jobId, {
    jobId: input.jobId,
    userId: input.userId,
    status: "running",
    stage: input.stage,
    progress: input.progress,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateStrategyJobDoc(
  _userId: string,
  jobId: string,
  patch: Partial<Pick<StrategyJobDoc, "status" | "stage" | "progress" | "error" | "strategy">>,
): Promise<void> {
  const existing = jobStore.get(jobId);
  if (!existing) return;
  jobStore.set(jobId, { ...existing, ...patch, updatedAt: Date.now() });
}

export async function getStrategyJobDoc(userId: string, jobId: string): Promise<StrategyJobDoc | null> {
  const job = jobStore.get(jobId);
  if (!job || job.userId !== userId) return null;
  return job;
}
