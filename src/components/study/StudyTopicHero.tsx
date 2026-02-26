"use client";

import { memo } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function StudyTopicHeroComponent({
  topicTitle,
  chapterLabel,
  estimatedTime,
  examLikelihoodScore,
  examLikelihoodLabel,
  onBack,
  onComplete,
  onNext,
  nextLabel,
  isCompleted,
}: {
  topicTitle: string;
  chapterLabel?: string;
  estimatedTime: string;
  examLikelihoodScore?: number;
  examLikelihoodLabel?: "VERY LIKELY" | "HIGH" | "MEDIUM" | "LOW";
  onBack: () => void;
  onComplete: () => void;
  onNext?: () => void;
  nextLabel?: string;
  isCompleted?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm md:backdrop-blur-xl p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {chapterLabel ? <p className="text-sm text-indigo-200/90">{chapterLabel}</p> : null}
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white mt-1">Topic: {topicTitle}</h1>
          <p className="text-neutral-400 mt-2">Structured notes from your uploaded material.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 max-w-full">
          {/* Navigation buttons — mobile only; desktop uses the bottom bar */}
          <div className="flex items-center gap-2 md:hidden">
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={onBack}
              className="h-9 w-9 rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10"
              aria-label="Back to dashboard"
              title="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={onComplete}
              className={`h-9 w-9 rounded-full border-white/10 ${isCompleted ? "bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30" : "bg-white/5 text-white hover:bg-white/10"}`}
              aria-label={isCompleted ? "Topic completed" : "Mark topic completed"}
              title={isCompleted ? "Completed" : "Complete"}
            >
              <Check className="h-4 w-4" />
            </Button>
            {onNext ? (
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={onNext}
                className="h-9 w-9 rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10"
                aria-label={nextLabel ?? "Next"}
                title={nextLabel ?? "Next"}
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          {/* Badges — always visible */}
          <Badge className="bg-white/10 text-white border-none">Study Time: {estimatedTime}</Badge>
          {typeof examLikelihoodScore === "number" ? (
            <Badge className="bg-fuchsia-500/20 text-fuchsia-200 border-none">
              Exam Likelihood: {examLikelihoodScore}% {examLikelihoodLabel ? `(${examLikelihoodLabel})` : ""}
            </Badge>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const StudyTopicHero = memo(StudyTopicHeroComponent);
