"use client";

import { memo } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TopicConfidence } from "@/lib/ai/types";

type ExamModeSnapshot = {
  likelyQuestions: Array<{
    question: string;
    expectedAnswer: string;
    difficulty: "easy" | "medium" | "hard";
    timeLimitMinutes: number;
  }>;
  readinessScore: number;
  confidence: TopicConfidence;
  weakAreas: string[];
  examTip: string;
};

function StudyKeyExamCardComponent({
  keyExamPoints,
  fallbackMessage,
  examMode,
  confidenceClass,
}: {
  keyExamPoints: string[];
  fallbackMessage: string;
  examMode: ExamModeSnapshot | null;
  confidenceClass: (confidence: TopicConfidence) => string;
}) {
  return (
    <Card className="bg-white/5 border border-white/10 backdrop-blur-sm md:backdrop-blur-xl shadow-2xl rounded-3xl">
      <CardHeader>
        <CardTitle className="text-white text-xl">Key Exam Points</CardTitle>
      </CardHeader>
      <CardContent>
        {keyExamPoints.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {keyExamPoints.map((item, index) => (
              <div key={`${item}-${index}`} className="rounded-xl bg-indigo-500/10 border border-indigo-400/20 px-3 py-3 text-sm text-indigo-50 leading-6">
                {item}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-neutral-300 text-sm">{fallbackMessage}</p>
        )}

        {examMode ? (
          <div className="mt-5 space-y-3 rounded-2xl bg-black/25 border border-white/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white">Exam Mode Snapshot</p>
              <Badge className={`${confidenceClass(examMode.confidence)} border-none capitalize`}>
                Readiness: {examMode.readinessScore}/100
              </Badge>
            </div>

            <div className="space-y-2">
              {examMode.likelyQuestions.map((question, index) => (
                <div key={`${question.question}-${index}`} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-sm text-white font-medium">Q{index + 1}. {question.question}</p>
                  <p className="mt-1 text-xs text-neutral-300">Expected: {question.expectedAnswer}</p>
                  <p className="mt-1 text-[11px] text-neutral-400">
                    Difficulty: {question.difficulty} • Time: {question.timeLimitMinutes} min
                  </p>
                </div>
              ))}
            </div>

            {examMode.weakAreas.length ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-indigo-200/80 mb-2">Weak Areas</p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-neutral-300">
                  {examMode.weakAreas.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="text-xs text-indigo-100">Tip: {examMode.examTip}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export const StudyKeyExamCard = memo(StudyKeyExamCardComponent);
