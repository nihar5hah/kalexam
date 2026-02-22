"use client";

import Link from "next/link";
import { motion, Variants } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StrategyResult } from "@/lib/ai/types";

type StrategyProgress = Record<
  string,
  {
    completed: boolean;
  }
>;

const fadeIn: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } },
};

function priorityClass(priority: "high" | "medium" | "low") {
  if (priority === "high") {
    return "bg-red-500/20 text-red-200";
  }
  if (priority === "medium") {
    return "bg-amber-500/20 text-amber-200";
  }
  return "bg-emerald-500/20 text-emerald-200";
}

function chapterCompleted(
  topics: StrategyResult["chapters"][number]["topics"],
  progress: StrategyProgress
): boolean {
  if (!topics.length) {
    return false;
  }

  return topics.every((topic) => Boolean(progress[topic.slug]?.completed));
}

function chapterStartTopic(
  topics: StrategyResult["chapters"][number]["topics"],
  progress: StrategyProgress
): StrategyResult["chapters"][number]["topics"][number] | null {
  if (!topics.length) {
    return null;
  }

  const nextPending = topics.find((topic) => !progress[topic.slug]?.completed);
  return nextPending ?? topics[0] ?? null;
}

export function StrategyReport({
  result,
  strategyId,
  studyProgress,
}: {
  result: StrategyResult;
  strategyId: string;
  studyProgress?: StrategyProgress;
}) {
  const progress = studyProgress ?? {};
  const chapters = [...result.chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);
  const completedCount = chapters.filter((chapter) => chapterCompleted(chapter.topics, progress)).length;

  async function handleDownloadPdf() {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "pt", format: "a4" });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 44;
    const lineHeight = 16;
    let cursorY = margin;

    const ensureSpace = (requiredHeight = lineHeight) => {
      if (cursorY + requiredHeight <= pageHeight - margin) {
        return;
      }

      pdf.addPage();
      cursorY = margin;
    };

    const writeWrapped = (text: string, fontSize = 11, isBold = false) => {
      const safeText = text || "";
      pdf.setFont("helvetica", isBold ? "bold" : "normal");
      pdf.setFontSize(fontSize);
      const lines = pdf.splitTextToSize(safeText, pageWidth - margin * 2) as string[];
      for (const line of lines) {
        ensureSpace(lineHeight);
        pdf.text(line, margin, cursorY);
        cursorY += lineHeight;
      }
    };

    writeWrapped("KalExam — Exam Strategy Report", 18, true);
    cursorY += 4;
    writeWrapped(`Model: ${result.modelUsed}`, 11, false);
    writeWrapped(`Coverage: ${result.strategySummary.estimatedCoverage}`, 11, false);
    writeWrapped(`High impact topics: ${result.strategySummary.highImpactTopics}`, 11, false);
    writeWrapped(`Chapters completed: ${completedCount}/${chapters.length}`, 11, false);
    cursorY += 8;

    for (const chapter of chapters) {
      ensureSpace(44);
      writeWrapped(
        `Chapter ${chapter.chapterNumber}: ${chapter.chapterTitle} (${chapter.priority.toUpperCase()} priority, ${chapter.estimatedTime})`,
        12,
        true,
      );
      if (chapter.weightage) {
        writeWrapped(`Weightage: ${chapter.weightage}`, 10, false);
      }
      if (typeof chapter.materialCoverage === "number") {
        writeWrapped(`Material coverage: ${chapter.materialCoverage}%`, 10, false);
      }

      chapter.topics.forEach((topic, index) => {
        const done = Boolean(progress[topic.slug]?.completed);
        writeWrapped(
          `${index + 1}. ${topic.title} (${topic.priority})${done ? " — completed" : ""}`,
          10,
          false,
        );
        writeWrapped(`   Estimated time: ${topic.estimatedTime}`, 10, false);
      });

      cursorY += 6;
    }

    const fileName = `kalexam-strategy-${strategyId || "report"}.pdf`;
    pdf.save(fileName);
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
      className="space-y-6"
    >
      <motion.div variants={fadeIn} className="space-y-3">
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white via-neutral-300 to-[#050505] pb-2">
          Your Chapter Study Plan
        </h1>
        <p className="text-sm text-neutral-400">Generated using: {result.modelUsed}</p>
        <Button
          type="button"
          onClick={() => void handleDownloadPdf()}
          className="rounded-full bg-white text-black hover:bg-neutral-200"
        >
          Download PDF Report
        </Button>
      </motion.div>

      <motion.div variants={fadeIn}>
        <Card className="bg-white/5 border border-white/10 backdrop-blur-xl shadow-2xl rounded-3xl">
          <CardHeader>
            <CardTitle className="text-white text-xl">Chapter Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-neutral-200 text-sm">{completedCount} / {chapters.length} chapters completed</p>
            <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-indigo-400 transition-all duration-300"
                style={{ width: `${chapters.length ? Math.round((completedCount / chapters.length) * 100) : 0}%` }}
              />
            </div>
            <p className="text-xs text-neutral-400">Follow the chapter order to keep revision aligned to your syllabus.</p>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={fadeIn} className="space-y-4">
        {chapters.map((chapter) => {
          const startTopic = chapterStartTopic(chapter.topics, progress);
          const isDone = chapterCompleted(chapter.topics, progress);
          const hasStarted = chapter.topics.some((topic) => progress[topic.slug]?.completed);
          const chapterActionLabel = isDone ? "Review Chapter" : hasStarted ? "Continue Chapter" : "Start Chapter";

          return (
            <Card
              key={`${chapter.chapterNumber}-${chapter.chapterTitle}`}
              className="bg-white/5 border border-white/10 backdrop-blur-xl shadow-2xl rounded-3xl"
            >
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-white text-2xl">
                      Chapter {chapter.chapterNumber} — {chapter.chapterTitle}
                    </CardTitle>
                    <p className="text-sm text-neutral-400 mt-1">Roadmap aligned to your syllabus structure.</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge className={`${priorityClass(chapter.priority)} border-none uppercase`}>Priority: {chapter.priority}</Badge>
                    <Badge className="bg-white/10 text-white border-none">Estimated Time: {chapter.estimatedTime}</Badge>
                    {typeof chapter.materialCoverage === "number" ? (
                      <Badge className="bg-blue-500/20 text-blue-200 border-none">Coverage: {chapter.materialCoverage}%</Badge>
                    ) : null}
                    {chapter.examLikelihoodSummary ? (
                      <Badge className="bg-fuchsia-500/20 text-fuchsia-200 border-none">
                        🔥 Avg Likelihood: {chapter.examLikelihoodSummary.averageLikelihood}%
                      </Badge>
                    ) : null}
                    {chapter.weightage ? (
                      <Badge className="bg-indigo-500/20 text-indigo-200 border-none">Weightage: {chapter.weightage}</Badge>
                    ) : null}
                    {isDone ? <Badge className="bg-emerald-500/20 text-emerald-200 border-none">Completed</Badge> : null}
                  </div>
                </div>
                {chapter.materialWarning ? (
                  <p className="text-amber-200 text-sm rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2">
                    ⚠ {chapter.materialWarning}
                  </p>
                ) : null}
                {chapter.lowMaterialConfidence ? (
                  <p className="text-amber-200 text-xs">Low material confidence — upload more notes.</p>
                ) : null}
              </CardHeader>

              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-white mb-2">Topics</p>
                  <ul className="space-y-2 text-neutral-300 text-sm">
                    {chapter.topics.map((topic) => (
                      <li
                        key={topic.slug}
                        className="rounded-xl bg-black/25 border border-white/10 px-3 py-2 flex items-center justify-between gap-2"
                      >
                        <span>{topic.title}</span>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-white/10 text-white border-none">{topic.estimatedTime}</Badge>
                          {progress[topic.slug]?.completed ? (
                            <Badge className="bg-emerald-500/20 text-emerald-200 border-none">Done</Badge>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <Button
                  asChild
                  className="rounded-full bg-white text-black hover:bg-neutral-200"
                  disabled={!startTopic}
                >
                  <Link href={startTopic ? `/study/${startTopic.slug}?id=${strategyId}` : `/strategy?id=${strategyId}`}>
                    {chapterActionLabel}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
