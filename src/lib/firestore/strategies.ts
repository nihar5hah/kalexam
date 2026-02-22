import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import {
  ModelType,
  SourceCitation,
  StrategyResult,
  StrategyResultV1,
  StudyQuestionCard,
  UploadedFile,
} from "@/lib/ai/types";
import { getFirebaseDb } from "@/lib/firebase";

export type StoredStrategy = {
  strategy: StrategyResult | StrategyResultV1;
  createdAt: Timestamp;
  hoursLeft: number;
  modelType: ModelType;
  syllabusFiles: UploadedFile[];
  studyMaterialFiles: UploadedFile[];
  previousPaperFiles: UploadedFile[];
  studyCache?: Record<
    string,
    {
      signature: string;
      schemaVersion?: string;
      generatedAt: string;
      content: {
        whatToLearn: string[];
        explanation: {
          concept: string;
          simpleExplanation: string;
          example: string;
          examTip: string;
        };
        keyDefinitions?: string[];
        differences?: Array<{
          conceptA: string;
          conceptB: string;
          definition: string;
          role: string;
          example: string;
          examImportance: string;
        }>;
        examplesFromMaterial?: string[];
        examTips?: string[];
        typicalExamQuestions?: StudyQuestionCard[];
        keyExamPoints: string[];
        confidence: "high" | "medium" | "low";
        estimatedTime: string;
        examLikelihoodScore?: number;
        examLikelihoodLabel?: "VERY LIKELY" | "HIGH" | "MEDIUM" | "LOW";
        sourceRefs?: SourceCitation[];
        materialCoverage?: number;
        lowMaterialConfidence?: boolean;
      };
    }
  >;
  studyProgress?: Record<
    string,
    {
      completed: boolean;
      completedAt?: Timestamp;
    }
  >;
};

type CreateStrategyInput = {
  uid: string;
  strategy: StrategyResult;
  hoursLeft: number;
  modelType: ModelType;
  syllabusFiles: UploadedFile[];
  studyMaterialFiles: UploadedFile[];
  previousPaperFiles: UploadedFile[];
};

export async function createStrategy(input: CreateStrategyInput): Promise<string> {
  const db = getFirebaseDb();
  const strategyRef = await addDoc(collection(db, "users", input.uid, "strategies"), {
    strategy: input.strategy,
    createdAt: serverTimestamp(),
    hoursLeft: input.hoursLeft,
    modelType: input.modelType,
    syllabusFiles: input.syllabusFiles,
    studyMaterialFiles: input.studyMaterialFiles,
    previousPaperFiles: input.previousPaperFiles,
  });

  return strategyRef.id;
}

export async function getStrategyById(uid: string, strategyId: string): Promise<StoredStrategy | null> {
  const db = getFirebaseDb();
  const strategyDocRef = doc(db, "users", uid, "strategies", strategyId);
  const snapshot = await getDoc(strategyDocRef);

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data() as StoredStrategy;
}

export async function listRecentStrategies(uid: string, maxItems = 5): Promise<Array<{ id: string; data: StoredStrategy }>> {
  const db = getFirebaseDb();
  const strategiesRef = collection(db, "users", uid, "strategies");
  const recentQuery = query(strategiesRef, orderBy("createdAt", "desc"), limit(maxItems));
  const snapshot = await getDocs(recentQuery);

  return snapshot.docs.map((item) => ({
    id: item.id,
    data: item.data() as StoredStrategy,
  }));
}

export async function saveStudyTopicCache(
  uid: string,
  strategyId: string,
  topicSlug: string,
  cacheEntry: NonNullable<StoredStrategy["studyCache"]>[string]
) {
  const db = getFirebaseDb();
  const strategyDocRef = doc(db, "users", uid, "strategies", strategyId);

  await updateDoc(strategyDocRef, {
    [`studyCache.${topicSlug}`]: cacheEntry,
  });
}

export async function markTopicCompleted(uid: string, strategyId: string, topicSlug: string) {
  const db = getFirebaseDb();
  const strategyDocRef = doc(db, "users", uid, "strategies", strategyId);

  await updateDoc(strategyDocRef, {
    [`studyProgress.${topicSlug}.completed`]: true,
    [`studyProgress.${topicSlug}.completedAt`]: serverTimestamp(),
  });
}
