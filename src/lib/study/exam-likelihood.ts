import { ExamLikelihoodLabel } from "@/lib/ai/types";

/**
 * Weighted continuous signals for exam likelihood scoring.
 *
 * Each signal is a value between 0 and 100 representing the strength of that
 * indicator. The final score is computed as a weighted sum:
 *
 *   topicFrequency   × 0.35
 * + examHistory      × 0.30
 * + weakAreaWeight   × 0.20
 * + syllabusPriority × 0.15
 */
export type LikelihoodSignals = {
  /** How often this topic appears across all uploaded material (0-100). */
  topicFrequency: number;
  /** Strength of evidence from previous papers / question banks (0-100). */
  examHistory: number;
  /** How much this topic overlaps with identified weak areas (0-100). */
  weakAreaWeight: number;
  /** Syllabus / chapter weightage importance (0-100). */
  syllabusPriority: number;
};

/**
 * Legacy boolean signals accepted for backwards compatibility.
 * Internally converted to continuous LikelihoodSignals.
 */
export type LegacyLikelihoodSignals = {
  appearsInPreviousPaper: boolean;
  appearsInQuestionBank: boolean;
  repeatedInStudyMaterial: boolean;
  syllabusCoreTopic: boolean;
  highChapterWeightage: boolean;
};

function isLegacySignals(
  signals: LikelihoodSignals | LegacyLikelihoodSignals,
): signals is LegacyLikelihoodSignals {
  return "appearsInPreviousPaper" in signals;
}

function toLikelihoodSignals(legacy: LegacyLikelihoodSignals): LikelihoodSignals {
  return {
    topicFrequency: (legacy.repeatedInStudyMaterial ? 60 : 10),
    examHistory:
      (legacy.appearsInPreviousPaper ? 70 : 0) +
      (legacy.appearsInQuestionBank ? 30 : 0),
    weakAreaWeight: 0,
    syllabusPriority:
      (legacy.syllabusCoreTopic ? 60 : 10) +
      (legacy.highChapterWeightage ? 40 : 0),
  };
}

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

export function computeExamLikelihood(
  signals: LikelihoodSignals | LegacyLikelihoodSignals,
): {
  score: number;
  label: ExamLikelihoodLabel;
} {
  const s = isLegacySignals(signals) ? toLikelihoodSignals(signals) : signals;

  const clamp = (v: number) => Math.max(0, Math.min(100, v));

  const raw =
    clamp(s.topicFrequency) * 0.35 +
    clamp(s.examHistory) * 0.30 +
    clamp(s.weakAreaWeight) * 0.20 +
    clamp(s.syllabusPriority) * 0.15;

  const boundedScore = Math.max(0, Math.min(100, Math.round(raw)));
  return {
    score: boundedScore,
    label: examLikelihoodLabel(boundedScore),
  };
}
