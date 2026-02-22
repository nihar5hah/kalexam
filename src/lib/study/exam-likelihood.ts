import { ExamLikelihoodLabel } from "@/lib/ai/types";

export type LikelihoodSignals = {
  appearsInPreviousPaper: boolean;
  appearsInQuestionBank: boolean;
  repeatedInStudyMaterial: boolean;
  syllabusCoreTopic: boolean;
  highChapterWeightage: boolean;
};

export function examLikelihoodLabel(score: number): ExamLikelihoodLabel {
  if (score >= 80) {
    return "VERY LIKELY";
  }
  if (score >= 60) {
    return "HIGH";
  }
  if (score >= 40) {
    return "MEDIUM";
  }
  return "LOW";
}

export function computeExamLikelihood(signals: LikelihoodSignals): {
  score: number;
  label: ExamLikelihoodLabel;
} {
  let score = 0;

  if (signals.appearsInPreviousPaper) {
    score += 40;
  }
  if (signals.appearsInQuestionBank) {
    score += 25;
  }
  if (signals.repeatedInStudyMaterial) {
    score += 15;
  }
  if (signals.syllabusCoreTopic) {
    score += 10;
  }
  if (signals.highChapterWeightage) {
    score += 10;
  }

  const boundedScore = Math.max(0, Math.min(100, score));
  return {
    score: boundedScore,
    label: examLikelihoodLabel(boundedScore),
  };
}
