"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";

import { AppTopNav } from "@/components/AppTopNav";
import { useAuth } from "@/components/AuthProvider";
import { RequireAuth } from "@/components/RequireAuth";
import { StrategyRecoveryView } from "@/components/StrategyRecoveryView";
import { StrategyReport } from "@/components/StrategyReport";
import { StrategyResult, normalizeStrategyResult } from "@/lib/ai/types";
import { getStrategyById, listRecentStrategies } from "@/lib/firestore/strategies";

export default function StrategyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
          <p className="text-neutral-400">Loading your strategy...</p>
        </div>
      }
    >
      <StrategyPageContent />
    </Suspense>
  );
}

function StrategyPageContent() {
  const searchParams = useSearchParams();
  const strategyId = searchParams.get("id");

  return (
    <RequireAuth redirectTo={strategyId ? `/strategy?id=${strategyId}` : "/strategy"}>
      <StrategyContent />
    </RequireAuth>
  );
}

function StrategyContent() {
  const searchParams = useSearchParams();
  const strategyId = searchParams.get("id");
  const { user } = useAuth();
  const [result, setResult] = useState<StrategyResult | null>(null);
  const [studyProgress, setStudyProgress] = useState<Record<string, { completed: boolean }>>({});
  const [recentStrategies, setRecentStrategies] = useState<Array<{ id: string; createdAt?: string; topicCount?: number; coverage?: string }>>([]);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function mapRecentStrategies(items: Awaited<ReturnType<typeof listRecentStrategies>>) {
    return items.map((item) => {
      const created = item.data.createdAt?.toDate?.();
      return {
        id: item.id,
        createdAt: created ? created.toLocaleDateString() : undefined,
        topicCount: "topics" in item.data.strategy ? item.data.strategy.topics.length : undefined,
        coverage:
          "strategySummary" in item.data.strategy
            ? item.data.strategy.strategySummary.estimatedCoverage
            : item.data.strategy.estimatedCoverage,
      };
    });
  }

  useEffect(() => {
    async function loadStrategy() {
      if (!user) {
        return;
      }

      if (!strategyId) {
        const recent = await listRecentStrategies(user.uid, 5);
        setRecentStrategies(mapRecentStrategies(recent));
        setRecoveryMessage("Strategy ID is missing. Open a recent strategy or create a new one.");
        setLoading(false);
        return;
      }

      const stored = await getStrategyById(user.uid, strategyId);
      if (!stored) {
        const recent = await listRecentStrategies(user.uid, 5);
        setRecentStrategies(mapRecentStrategies(recent));
        setRecoveryMessage("This strategy was not found. Open a recent strategy or create a new one.");
        setLoading(false);
        return;
      }

      const modelLabel = stored.modelType === "custom" ? "Custom Model" : "Gemini";
      const normalized = normalizeStrategyResult(stored.strategy, stored.hoursLeft, modelLabel);
      setResult(normalized);
      setStudyProgress(stored.studyProgress ?? {});
      setRecoveryMessage(null);
      setLoading(false);
    }

    void loadStrategy();
  }, [strategyId, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
        <p className="text-neutral-400">Loading your strategy...</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-[#050505] text-white selection:bg-indigo-500/30 overflow-hidden relative">
        <AppTopNav strategyId={strategyId} />
        <div className="relative z-10 pt-20">
          <StrategyRecoveryView
            title="Strategy context missing"
            message={recoveryMessage ?? "Open a recent strategy or create a new one to continue."}
            recentStrategies={recentStrategies}
            mode="strategy"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-indigo-500/30 overflow-hidden relative">
      <AppTopNav strategyId={strategyId} />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.15, 0.3, 0.15] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-[10%] -left-[10%] w-[60%] h-[60%] rounded-full bg-indigo-500/20 blur-[120px]"
        />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-6 pt-24 pb-16 md:pt-28 md:pb-20">
        <StrategyReport result={result} strategyId={strategyId ?? ""} studyProgress={studyProgress} />
      </div>
    </div>
  );
}
