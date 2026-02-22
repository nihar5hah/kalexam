"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";

import { useAuth } from "@/components/AuthProvider";
import { FileUploadGroup } from "@/components/FileUploadGroup";
import { ModelSwitcher } from "@/components/ModelSwitcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomProviderConfig, FileCategory, ModelType, StrategyResult, UploadedFile } from "@/lib/ai/types";
import { getFirebaseStorage } from "@/lib/firebase";
import { createStrategy, saveStudyTopicCache } from "@/lib/firestore/strategies";
import { createStudySession, saveTopicCacheToSession } from "@/lib/firestore/study-sessions";

type GenerateStrategyApiResponse = {
  strategy: StrategyResult;
};

type CreateStrategyJobApiResponse = {
  jobId: string;
  stage: "queued";
  progress: number;
};

type StrategyJobStage =
  | "queued"
  | "extracting_text"
  | "analyzing_chapters"
  | "generating_strategy"
  | "preparing_study_content"
  | "complete"
  | "failed";

type StrategyJobStatusApiResponse = {
  job: {
    id: string;
    stage: StrategyJobStage;
    progress: number;
    error?: string;
    strategy?: StrategyResult;
    updatedAt: number;
  };
};

const SUPPORTED_EXTENSIONS = new Set(["pdf", "docx", "ppt", "pptx"]);

type ProgressStage =
  | "idle"
  | "uploading"
  | "extracting"
  | "analyzing"
  | "strategy"
  | "content"
  | "done";

const STAGE_LABELS: Record<ProgressStage, string> = {
  idle: "",
  uploading: "Uploading files...",
  extracting: "Extracting text from uploaded files...",
  analyzing: "Analyzing syllabus & chapters...",
  strategy: "Generating exam session...",
  content: "Building learning roadmap...",
  done: "Completed.",
};

const JOB_STAGE_TO_UI: Record<StrategyJobStage, ProgressStage> = {
  queued: "extracting",
  extracting_text: "extracting",
  analyzing_chapters: "analyzing",
  generating_strategy: "strategy",
  preparing_study_content: "content",
  complete: "done",
  failed: "strategy",
};

const STUDY_CACHE_SCHEMA_VERSION = "v2";

function getFileExtension(fileName: string): string {
  const pieces = fileName.split(".");
  return pieces.length > 1 ? pieces[pieces.length - 1].toLowerCase() : "";
}

function ensureSupportedFiles(files: File[]): string[] {
  return files
    .filter((file) => !SUPPORTED_EXTENSIONS.has(getFileExtension(file.name)))
    .map((file) => file.name);
}

function deriveSubjectName(strategy: StrategyResult, syllabusFiles: UploadedFile[]): string {
  const firstChapter = strategy.chapters[0]?.chapterTitle?.trim();
  if (firstChapter) {
    return firstChapter;
  }

  const firstSyllabus = syllabusFiles[0]?.name?.replace(/\.[^/.]+$/, "").trim();
  if (firstSyllabus) {
    return firstSyllabus;
  }

  return "Untitled Subject";
}

async function uploadSingleFile(
  file: File,
  folderName: string,
  category: FileCategory,
  onProgress: (progress: number) => void
): Promise<UploadedFile> {
  const storage = getFirebaseStorage();
  const extension = getFileExtension(file.name);
  const safeName = `${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
  const fileRef = ref(storage, `${folderName}/${safeName}`);

  await new Promise<void>((resolve, reject) => {
    const uploadTask = uploadBytesResumable(fileRef, file, {
      contentType: file.type || "application/octet-stream",
    });

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const progress = snapshot.totalBytes
          ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
          : 0;
        onProgress(progress);
      },
      reject,
      () => resolve()
    );
  });

  const url = await getDownloadURL(fileRef);

  return {
    name: file.name,
    type: file.type || "application/octet-stream",
    url,
    extension,
    category,
  };
}

async function uploadCollection(
  files: File[],
  folderName: string,
  category: FileCategory,
  onCollectionProgress: (progress: number) => void
): Promise<UploadedFile[]> {
  if (!files.length) {
    return [];
  }

  const uploaded: UploadedFile[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const item = await uploadSingleFile(file, folderName, category, (fileProgress) => {
      const progress = Math.round(((index + fileProgress / 100) / files.length) * 100);
      onCollectionProgress(progress);
    });
    uploaded.push(item);
  }

  onCollectionProgress(100);
  return uploaded;
}

function getModelCacheKey(
  modelType: ModelType,
  customConfig: CustomProviderConfig,
): string {
  if (modelType === "custom") {
    return `custom:${customConfig.modelName || "custom-model"}`;
  }

  return "gemini";
}

export function UploadForm() {
  const router = useRouter();
  const { user } = useAuth();

  const [syllabusFiles, setSyllabusFiles] = useState<File[]>([]);
  const [syllabusTextInput, setSyllabusTextInput] = useState("");
  const [studyMaterialFiles, setStudyMaterialFiles] = useState<File[]>([]);
  const [previousPaperFiles, setPreviousPaperFiles] = useState<File[]>([]);
  const [hoursLeft, setHoursLeft] = useState<number>(6);
  const [examDate, setExamDate] = useState("");

  const [modelType, setModelType] = useState<ModelType>("gemini");
  const [customConfig, setCustomConfig] = useState<CustomProviderConfig>({
    baseUrl: "",
    apiKey: "",
    modelName: "",
  });

  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [progressStage, setProgressStage] = useState<ProgressStage>("idle");
  const [error, setError] = useState<string | null>(null);

  const uploadStep = useMemo(() => {
    const hasSyllabus = syllabusFiles.length > 0 || syllabusTextInput.trim().length > 0;
    const hasStudyMaterial = studyMaterialFiles.length > 0;
    if (!hasSyllabus || !hasStudyMaterial) return 1;
    if (hoursLeft <= 0) return 2;
    return 3;
  }, [syllabusFiles.length, syllabusTextInput, studyMaterialFiles.length, hoursLeft]);

  async function animateProgressTo(target: number, durationMs = 600) {
    const start = uploadProgress;
    const delta = Math.max(0, target - start);
    if (!delta) {
      return;
    }

    const startTs = Date.now();
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        const elapsed = Date.now() - startTs;
        const ratio = Math.min(1, elapsed / durationMs);
        const next = Math.round(start + delta * ratio);
        setUploadProgress(next);
        if (ratio >= 1) {
          clearInterval(timer);
          resolve();
        }
      }, 40);
    });
  }

  async function handleGenerateStrategy() {
    setError(null);
    setUploadProgress(0);
    setProgressStage("idle");

    const normalizedSyllabusText = syllabusTextInput.trim();

    if ((!syllabusFiles.length && !normalizedSyllabusText) || !studyMaterialFiles.length || !hoursLeft) {
      setError("Please provide syllabus file(s) or syllabus text, one study material file, and hours left.");
      return;
    }

    const invalid = ensureSupportedFiles([
      ...syllabusFiles,
      ...studyMaterialFiles,
      ...previousPaperFiles,
    ]);
    if (invalid.length) {
      setError(`Unsupported format found: ${invalid.join(", ")}. Supported: PDF, DOCX, PPT, PPTX.`);
      return;
    }

    if (modelType === "custom") {
      if (!customConfig.baseUrl || !customConfig.apiKey || !customConfig.modelName) {
        setError("Please fill all custom model fields.");
        return;
      }
    }

    setLoading(true);

    try {
      if (!user) {
        throw new Error("You must be signed in to generate a session.");
      }

      setProgressStage("uploading");

      const progressBySection = {
        syllabus: syllabusFiles.length ? 0 : 100,
        material: studyMaterialFiles.length ? 0 : 100,
        previous: previousPaperFiles.length ? 0 : 100,
      };

      const updateOverallProgress = () => {
        const total =
          progressBySection.syllabus + progressBySection.material + progressBySection.previous;
        const uploadPhaseProgress = Math.round((total / 3) * 0.3);
        setUploadProgress((current) => Math.max(current, uploadPhaseProgress));
      };

      const [uploadedSyllabus, uploadedMaterial, uploadedPrevious] = await Promise.all([
        uploadCollection(syllabusFiles, `users/${user.uid}/syllabus`, "syllabus", (progress) => {
          progressBySection.syllabus = progress;
          updateOverallProgress();
        }),
        uploadCollection(
          studyMaterialFiles,
          `users/${user.uid}/study-material`,
          "studyMaterial",
          (progress) => {
            progressBySection.material = progress;
            updateOverallProgress();
          }
        ),
        uploadCollection(
          previousPaperFiles,
          `users/${user.uid}/previous-papers`,
          "previousPapers",
          (progress) => {
            progressBySection.previous = progress;
            updateOverallProgress();
          }
        ),
      ]);

      setProgressStage("extracting");
      await animateProgressTo(45, 500);

      setProgressStage("analyzing");
      await animateProgressTo(60, 500);

      setProgressStage("strategy");
      await animateProgressTo(72, 450);

      const jobResponse = await fetch("/api/generate-strategy/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.uid,
          hoursLeft,
          syllabusFiles: uploadedSyllabus,
          syllabusTextInput: normalizedSyllabusText,
          studyMaterialFiles: uploadedMaterial,
          previousPaperFiles: uploadedPrevious,
          modelType,
          modelConfig: modelType === "custom" ? customConfig : null,
        }),
      });

      if (!jobResponse.ok) {
        const responseText = await jobResponse.text();
        throw new Error(responseText || "Failed to start session generation");
      }

      const createdJob = (await jobResponse.json()) as CreateStrategyJobApiResponse;
      let data: GenerateStrategyApiResponse | null = null;

      for (let attempt = 0; attempt < 180; attempt += 1) {
        const statusResponse = await fetch(
          `/api/generate-strategy/jobs?id=${encodeURIComponent(createdJob.jobId)}&userId=${encodeURIComponent(user.uid)}`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
          }
        );

        if (!statusResponse.ok) {
          throw new Error("Unable to fetch session job status");
        }

        const statusData = (await statusResponse.json()) as StrategyJobStatusApiResponse;
        const job = statusData.job;

        setProgressStage(JOB_STAGE_TO_UI[job.stage]);
        const cappedProgress = Math.min(99, Math.max(35, job.progress));
        setUploadProgress((current) => Math.max(current, cappedProgress));

        if (job.stage === "failed") {
          throw new Error(job.error || "Session generation job failed.");
        }

        if (job.stage === "complete") {
          if (!job.strategy) {
            throw new Error("Session job completed without content payload.");
          }

          data = { strategy: job.strategy };
          break;
        }

        await new Promise<void>((resolve) => {
          setTimeout(() => resolve(), 1200);
        });
      }

      if (!data) {
        throw new Error("Session generation timed out. Please try again.");
      }

      const strategyId = await createStrategy({
        uid: user.uid,
        strategy: data.strategy,
        hoursLeft,
        modelType,
        syllabusFiles: uploadedSyllabus,
        studyMaterialFiles: uploadedMaterial,
        previousPaperFiles: uploadedPrevious,
      });

      const subjectName = deriveSubjectName(data.strategy, uploadedSyllabus);
      await createStudySession({
        userId: user.uid,
        strategyId,
        subjectName,
        syllabusFiles: uploadedSyllabus,
        materialFiles: uploadedMaterial,
        generatedStrategy: data.strategy,
        examDate: examDate || null,
      });

      const fileSignature = `${STUDY_CACHE_SCHEMA_VERSION}:${uploadedSyllabus
        .concat(uploadedMaterial, uploadedPrevious)
        .map((file) => file.url)
        .join("|")}:${normalizedSyllabusText.toLowerCase().replace(/\s+/g, " ")}`;

      const topTopics = [...data.strategy.topics]
        .sort((a, b) => {
          const scoreA = a.examLikelihoodScore ?? 0;
          const scoreB = b.examLikelihoodScore ?? 0;
          if (scoreA !== scoreB) {
            return scoreB - scoreA;
          }

          const priorityRank = { high: 3, medium: 2, low: 1 } as const;
          return priorityRank[b.priority] - priorityRank[a.priority];
        })
        .slice(0, 3);

      void Promise.allSettled(
        topTopics.map(async (topic) => {
          const precomputeResponse = await fetch("/api/study/topic", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              topic: topic.title,
              priority: topic.priority,
              outlineOnly: false,
              files: [...uploadedSyllabus, ...uploadedMaterial, ...uploadedPrevious],
              modelType,
              modelConfig: modelType === "custom" ? customConfig : undefined,
            }),
          });

          if (!precomputeResponse.ok) {
            return;
          }

          const precomputed = await precomputeResponse.json();
          const modelCache = getModelCacheKey(modelType, customConfig);

          await Promise.all([
            saveStudyTopicCache(user.uid, strategyId, topic.slug, {
              signature: fileSignature,
              schemaVersion: STUDY_CACHE_SCHEMA_VERSION,
              generatedAt: new Date().toISOString(),
              content: precomputed,
            }),
            saveTopicCacheToSession(user.uid, strategyId, topic.slug, {
              signature: fileSignature,
              schemaVersion: STUDY_CACHE_SCHEMA_VERSION,
              model: modelCache,
              content: precomputed,
            }),
          ]);
        })
      );

      await animateProgressTo(100, 500);
      setProgressStage("done");

      const studyModelContext =
        modelType === "custom"
          ? {
              modelType: "custom" as const,
              modelConfig: customConfig,
            }
          : {
              modelType: "gemini" as const,
            };

      if (typeof window !== "undefined") {
        sessionStorage.setItem(`study-model:${strategyId}`, JSON.stringify(studyModelContext));
      }

      router.push(`/dashboard?id=${strategyId}`);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Failed to generate session.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-2xl bg-white/5 border border-white/10 backdrop-blur-xl shadow-2xl rounded-3xl">
      <CardHeader>
        <CardTitle className="text-white text-2xl">Upload & Generate</CardTitle>
        {/* 3-step UX progress indicator */}
        <div className="flex items-center gap-1 pt-3">
          {(
            [
              { step: 1, label: "Upload Files" },
              { step: 2, label: "Configure" },
              { step: 3, label: "Generate" },
            ] as const
          ).flatMap(({ step, label }, idx) => {
            const pill = (
              <div
                key={step}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  uploadStep === step
                    ? "bg-orange-500 text-white shadow-[0_0_12px_rgba(249,115,22,0.3)]"
                    : uploadStep > step
                    ? "bg-white/8 text-neutral-300 border border-white/15"
                    : "bg-white/5 text-neutral-500 border border-white/10"
                }`}
              >
                <span className={`text-[10px] flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${uploadStep > step ? "bg-white/20" : ""}`}>
                  {uploadStep > step ? "✓" : step}
                </span>
                <span className="hidden sm:inline">{label}</span>
              </div>
            );
            if (idx < 2) {
              return [
                pill,
                <div key={`line-${step}`} className={`flex-1 h-px ${uploadStep > step ? "bg-white/30" : "bg-white/10"}`} />,
              ];
            }
            return [pill];
          })}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <FileUploadGroup
          title="Syllabus Files"
          helperText="Supported: PDF, DOCX, PPT, PPTX"
          files={syllabusFiles}
          required
          onFilesAdd={(files) => setSyllabusFiles((current) => [...current, ...files])}
          onFileRemove={(index) =>
            setSyllabusFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))
          }
        />

        <div className="space-y-2">
          <label className="text-sm text-neutral-300 font-medium">Or paste syllabus text (optional)</label>
          <textarea
            value={syllabusTextInput}
            onChange={(event) => setSyllabusTextInput(event.target.value)}
            placeholder="Paste chapter list / syllabus outline here..."
            rows={5}
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none transition focus:border-white/30 placeholder:text-neutral-500"
          />
          <p className="text-xs text-neutral-400">
            Use this if you do not have a syllabus file. You can also combine both for better extraction.
          </p>
        </div>

        <FileUploadGroup
          title="Study Material Files"
          helperText="Supported: PDF, DOCX, PPT, PPTX"
          files={studyMaterialFiles}
          required
          onFilesAdd={(files) => setStudyMaterialFiles((current) => [...current, ...files])}
          onFileRemove={(index) =>
            setStudyMaterialFiles((current) =>
              current.filter((_, itemIndex) => itemIndex !== index)
            )
          }
        />

        <FileUploadGroup
          title="Previous Year Papers (Optional)"
          helperText="Supported: PDF, DOCX, PPT, PPTX"
          files={previousPaperFiles}
          onFilesAdd={(files) => setPreviousPaperFiles((current) => [...current, ...files])}
          onFileRemove={(index) =>
            setPreviousPaperFiles((current) =>
              current.filter((_, itemIndex) => itemIndex !== index)
            )
          }
        />

        <div className="space-y-2">
          <label className="text-sm text-neutral-300 font-medium">Hours left before exam</label>
          <input
            type="number"
            min={1}
            value={hoursLeft}
            onChange={(event) => setHoursLeft(Number(event.target.value))}
            className="h-11 w-full rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-white/30"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm text-neutral-300 font-medium">Exam date (optional)</label>
          <input
            type="date"
            value={examDate}
            onChange={(event) => setExamDate(event.target.value)}
            className="h-11 w-full rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-white/30"
          />
        </div>

        <ModelSwitcher
          modelType={modelType}
          customConfig={customConfig}
          onModelTypeChange={setModelType}
          onCustomConfigChange={setCustomConfig}
        />

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        {loading ? (
          <div className="space-y-2">
            <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden relative">
              <div
                className="h-full bg-orange-500 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            </div>
            <p className="text-xs text-neutral-400">{STAGE_LABELS[progressStage]} {uploadProgress}%</p>
          </div>
        ) : null}

        <Button
          type="button"
          size="lg"
          disabled={loading}
          onClick={handleGenerateStrategy}
          className="w-full rounded-2xl bg-orange-500 hover:bg-orange-400 text-white py-6 font-medium shadow-[0_0_20px_rgba(249,115,22,0.25)] hover:shadow-[0_0_30px_rgba(249,115,22,0.45)] transition-all"
        >
          {loading ? "Uploading & Generating..." : "Generate Session"}
        </Button>
      </CardContent>
    </Card>
  );
}
