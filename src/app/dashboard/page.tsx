"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

import { AppTopNav } from "@/components/AppTopNav";
import { RequireAuth } from "@/components/RequireAuth";
import { StrategyList, type DashboardSessionCard } from "@/components/dashboard/StrategyList";
import { useAuth } from "@/components/AuthProvider";
import { listRecentStrategies } from "@/lib/firestore/strategies";
import {
  listStudySessions,
  renameStudySession,
  softDeleteStudySession,
} from "@/lib/firestore/study-sessions";

function estimateStudyTime(totalTopics: number): string {
  if (totalTopics <= 2) {
    return "1-2 hours";
  }
  if (totalTopics <= 5) {
    return "3-6 hours";
  }
  return "6+ hours";
}

export default function DashboardPage() {
  return (
    <RequireAuth redirectTo="/dashboard">
      <DashboardContent />
    </RequireAuth>
  );
}

function DashboardContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<DashboardSessionCard[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      return;
    }

    const sessions = await listStudySessions(user.uid, 30);
    const mapped = sessions.map((item) => {
      const chaptersCount = item.data.generatedStrategy.chapters.length;
      const totalTopics = item.data.progress.totalTopics || item.data.generatedStrategy.topics.length;
      const createdAt = item.data.createdAt?.toDate?.();
      return {
        id: item.id,
        strategyId: item.data.strategyId,
        subjectName: item.data.subjectName,
        createdAtLabel: createdAt ? createdAt.toLocaleDateString() : "Recently",
        chaptersCount,
        progressPercent: item.data.progress.percentage,
        estimatedTotalStudyTime: estimateStudyTime(totalTopics),
        canManage: true,
      };
    });

    setItems(mapped);
    setNotice(null);
  }, [user]);

  useEffect(() => {
    async function load() {
      if (!user) {
        return;
      }

      try {
        await refresh();
      } catch {
        const recent = await listRecentStrategies(user.uid, 30);
        const mappedFallback = recent.map((item) => {
          const chaptersCount = "chapters" in item.data.strategy ? item.data.strategy.chapters.length : 0;
          const totalTopics = "topics" in item.data.strategy ? item.data.strategy.topics.length : 0;
          const completedTopics = Object.values(item.data.studyProgress ?? {}).filter((entry) => entry.completed).length;
          const progressPercent = totalTopics ? Math.round((completedTopics / totalTopics) * 100) : 0;
          const firstChapter =
            "chapters" in item.data.strategy ? item.data.strategy.chapters[0]?.chapterTitle : undefined;
          const firstSyllabus = item.data.syllabusFiles?.[0]?.name?.replace(/\.[^/.]+$/, "");
          const createdAt = item.data.createdAt?.toDate?.();

          return {
            id: `strategy-${item.id}`,
            strategyId: item.id,
            subjectName: firstChapter || firstSyllabus || "Untitled Subject",
            createdAtLabel: createdAt ? createdAt.toLocaleDateString() : "Recently",
            chaptersCount,
            progressPercent,
            estimatedTotalStudyTime: estimateStudyTime(totalTopics),
            canManage: false,
          } satisfies DashboardSessionCard;
        });

        setItems(mappedFallback);
        setNotice("Dashboard is running in fallback mode due Firestore session permissions. Resume works; rename/delete are temporarily disabled.");
      }
      setLoading(false);
    }

    void load();
  }, [refresh, user]);

  const empty = useMemo(() => !loading && items.length === 0, [items.length, loading]);

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-indigo-500/30 overflow-hidden relative">
      <AppTopNav />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.12, 0.26, 0.12] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-[10%] -left-[10%] w-[60%] h-[60%] rounded-full bg-indigo-500/20 blur-[120px]"
        />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-6 pt-24 pb-16 md:pt-28 md:pb-20 space-y-6">
        <div>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white via-neutral-300 to-[#050505] pb-2">
            Your Study Dashboard
          </h1>
          <p className="text-neutral-400 text-sm md:text-base">Revisit your previous strategies and continue learning.</p>
        </div>

        {notice ? (
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {notice}
          </div>
        ) : null}

        {loading ? <p className="text-neutral-400">Loading your study sessions...</p> : null}

        {empty ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 text-center text-neutral-300">
            No study sessions yet. Generate your first strategy from Upload.
          </div>
        ) : null}

        {!loading && items.length ? (
          <StrategyList
            items={items}
            onRename={async (sessionId, subjectName) => {
              if (!user) return;
              await renameStudySession(user.uid, sessionId, subjectName);
              await refresh();
            }}
            onDelete={async (sessionId) => {
              if (!user) return;
              await softDeleteStudySession(user.uid, sessionId);
              await refresh();
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
