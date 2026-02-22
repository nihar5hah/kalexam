"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, CalendarClock, Clock, Files, Gauge, ShieldAlert, Sparkles, Target, Zap } from "lucide-react";

import { AuthenticatedNavBar } from "@/components/AuthenticatedNavBar";
import { RequireAuth } from "@/components/RequireAuth";
import { StrategyRecoveryView } from "@/components/StrategyRecoveryView";
import { StrategyReport } from "@/components/StrategyReport";
import { StrategyList, type DashboardSessionCard } from "@/components/dashboard/StrategyList";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TextShimmerWave } from "@/components/ui/text-shimmer-wave";
import { useAuth } from "@/components/AuthProvider";
import { StrategyResult, normalizeStrategyResult } from "@/lib/ai/types";
import { getStrategyById, listRecentStrategies } from "@/lib/firestore/strategies";
import {
  listStudySessions,
  type StudySession,
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

type DashboardIntel = {
  examCountdown: string;
  completionPercent: number;
  readinessScore: number;
  weakestChapter: string;
  todaysFocusTopic: string;
  weakestTopic: string;
  estimatedHoursRemaining: number;
  suggestedStudyPath: string[];
  readinessTrend: number[];
};

function toCountdownLabel(examDate?: string | null): string {
  if (!examDate) {
    return "Date not set";
  }

  const target = new Date(examDate).getTime();
  if (Number.isNaN(target)) {
    return "Date not set";
  }

  const days = Math.max(0, Math.ceil((target - Date.now()) / (1000 * 60 * 60 * 24)));
  return days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"} left`;
}

function buildDashboardIntel(session?: StudySession): DashboardIntel {
  const completionPercent = session?.progress.percentage ?? 0;
  const readinessScore = session?.readinessScore ?? 0;
  const metrics = session?.dashboardMetrics;
  const readinessTrend = (session?.examReadinessTimeline ?? []).map((point) => point.score).slice(-10);

  return {
    examCountdown: toCountdownLabel(session?.examDate),
    completionPercent,
    readinessScore,
    weakestChapter: metrics?.weakestChapter ?? "Not enough data",
    todaysFocusTopic: metrics?.todaysFocusTopic ?? "Not enough data",
    weakestTopic: metrics?.weakestTopic ?? "Not enough data",
    estimatedHoursRemaining: metrics?.estimatedHoursRemaining ?? 0,
    suggestedStudyPath: metrics?.suggestedStudyPath ?? [],
    readinessTrend,
  };
}

function TrendSparkline({ values }: { values: number[] }) {
  if (!values.length) {
    return <p className="text-xs text-neutral-500">No readiness trend yet.</p>;
  }

  const width = 220;
  const height = 56;
  const max = Math.max(...values, 100);
  const min = Math.min(...values, 0);
  const range = Math.max(1, max - min);

  const points = values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="opacity-90">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-orange-400"
        points={points}
      />
    </svg>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const strategyId = searchParams.get("id");
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<DashboardSessionCard[]>([]);
  const [sessions, setSessions] = useState<Array<{ id: string; data: StudySession }>>([]);
  const [detailResult, setDetailResult] = useState<StrategyResult | null>(null);
  const [detailStudyProgress, setDetailStudyProgress] = useState<Record<string, { completed: boolean }>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [recentStrategies, setRecentStrategies] = useState<Array<{ id: string; createdAt?: string; topicCount?: number; coverage?: string }>>([]);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const mapRecentStrategies = useCallback((items: Awaited<ReturnType<typeof listRecentStrategies>>) => {
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
  }, []);

  const refresh = useCallback(async () => {
    if (!user) {
      return;
    }

    const sessions = await listStudySessions(user.uid, 30);
    setSessions(sessions);
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
        setSessions([]);
        setNotice("Dashboard is running in fallback mode due Firestore session permissions. Resume works; rename/delete are temporarily disabled.");
      }
      setLoading(false);
    }

    void load();
  }, [refresh, user]);

  useEffect(() => {
    async function loadDetail() {
      if (!user || !strategyId) {
        setDetailResult(null);
        setDetailStudyProgress({});
        setRecoveryMessage(null);
        return;
      }

      setDetailLoading(true);
      try {
        const stored = await getStrategyById(user.uid, strategyId);
        if (!stored) {
          const recent = await listRecentStrategies(user.uid, 5);
          setRecentStrategies(mapRecentStrategies(recent));
          setRecoveryMessage("This session was not found. Open a recent session or create a new one.");
          setDetailResult(null);
          setDetailStudyProgress({});
          return;
        }

        const modelLabel = stored.modelType === "custom" ? "Custom Model" : "Gemini";
        const normalized = normalizeStrategyResult(stored.strategy, stored.hoursLeft, modelLabel);
        setDetailResult(normalized);
        setDetailStudyProgress(stored.studyProgress ?? {});
        setRecoveryMessage(null);
      } finally {
        setDetailLoading(false);
      }
    }

    void loadDetail();
  }, [mapRecentStrategies, strategyId, user]);

  const empty = useMemo(() => !loading && items.length === 0, [items.length, loading]);
  const latestSession = sessions[0]?.data;
  const intel = useMemo(() => buildDashboardIntel(latestSession), [latestSession]);

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-orange-500/20 overflow-hidden relative">
      <AuthenticatedNavBar />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Top-left primary warm blob */}
        <motion.div
          animate={{ scale: [1, 1.12, 0.97, 1.08, 1], opacity: [0.07, 0.13, 0.06, 0.11, 0.07] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-[10%] -left-[10%] w-[55%] h-[55%] rounded-full"
          style={{ background: "radial-gradient(ellipse at center, rgba(249,115,22,0.35) 0%, rgba(249,115,22,0.10) 50%, transparent 75%)", filter: "blur(100px)" }}
        />
        {/* Bottom-right amber drift */}
        <motion.div
          animate={{ scale: [1, 1.15, 0.95, 1], opacity: [0.06, 0.11, 0.05, 0.06] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 3 }}
          className="absolute -bottom-[15%] -right-[8%] w-[50%] h-[50%] rounded-full"
          style={{ background: "radial-gradient(ellipse at center, rgba(245,158,11,0.28) 0%, rgba(245,158,11,0.08) 55%, transparent 78%)", filter: "blur(120px)" }}
        />
        {/* Center mid-page subtle pulse */}
        <motion.div
          animate={{ scaleX: [1, 1.2, 1], scaleY: [1, 0.9, 1], opacity: [0.04, 0.08, 0.04] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut", delay: 7 }}
          className="absolute top-[35%] left-[20%] w-[60%] h-[30%] rounded-full"
          style={{ background: "radial-gradient(ellipse at center, rgba(249,115,22,0.18) 0%, transparent 70%)", filter: "blur(90px)" }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-6 pt-24 pb-16 md:pt-28 md:pb-20 space-y-6">
        <div>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-neutral-400 pb-2">
            Your Study Dashboard
          </h1>
          <p className="text-neutral-400 text-sm md:text-base">Revisit your previous sessions and continue learning.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <Card className="bg-orange-500/10 border border-orange-400/20 backdrop-blur-xl rounded-3xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-orange-300 flex items-center gap-2"><CalendarClock className="h-4 w-4" />Exam Countdown</CardTitle>
            </CardHeader>
            <CardContent className="text-xl font-semibold text-orange-100">{intel.examCountdown}</CardContent>
          </Card>

          <Card className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-3xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-neutral-400 flex items-center gap-2"><BarChart3 className="h-4 w-4" />Completion</CardTitle>
            </CardHeader>
            <CardContent className="text-xl font-semibold text-white">{intel.completionPercent}%</CardContent>
          </Card>

          <Card className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-3xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-neutral-400 flex items-center gap-2"><Gauge className="h-4 w-4" />Readiness</CardTitle>
            </CardHeader>
            <CardContent className="text-xl font-semibold text-white">{intel.readinessScore}%</CardContent>
          </Card>

          <Card className="bg-amber-500/10 border border-amber-400/20 backdrop-blur-xl rounded-3xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-amber-300 flex items-center gap-2"><ShieldAlert className="h-4 w-4" />Weakest Chapter</CardTitle>
            </CardHeader>
            <CardContent className="text-sm font-medium text-amber-100">{intel.weakestChapter}</CardContent>
          </Card>

          <Card className="bg-emerald-500/10 border border-emerald-400/20 backdrop-blur-xl rounded-3xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-emerald-300 flex items-center gap-2"><Target className="h-4 w-4" />Today&apos;s Focus</CardTitle>
            </CardHeader>
            <CardContent className="text-sm font-medium text-emerald-100">{intel.todaysFocusTopic}</CardContent>
          </Card>
        </div>

        <Card className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-3xl">
          <CardHeader>
            <CardTitle className="text-white text-lg">Adaptive Coach Insights</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-neutral-400 uppercase tracking-wide">Weakest Topic</p>
              <p className="text-sm text-neutral-100 mt-1">{intel.weakestTopic}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-400 uppercase tracking-wide">Estimated Hours Remaining</p>
              <p className="text-sm text-neutral-100 mt-1">{intel.estimatedHoursRemaining}h</p>
            </div>
            <div>
              <p className="text-xs text-neutral-400 uppercase tracking-wide">Suggested Study Path</p>
              <p className="text-sm text-neutral-100 mt-1">{intel.suggestedStudyPath.length ? intel.suggestedStudyPath.join(" → ") : "Generate more interaction data"}</p>
            </div>
            <div className="md:col-span-3">
              <p className="text-xs text-neutral-400 uppercase tracking-wide mb-2">Readiness Trend</p>
              <TrendSparkline values={intel.readinessTrend} />
            </div>
          </CardContent>
        </Card>

        {notice && !strategyId ? (
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {notice}
          </div>
        ) : null}

        {strategyId && detailLoading ? (
          <TextShimmerWave className="text-sm [--base-color:#a3a3a3] [--base-gradient-color:#ffffff]" duration={1}>
            Loading your session details...
          </TextShimmerWave>
        ) : null}

        {strategyId && !detailLoading && !detailResult ? (
          <StrategyRecoveryView
            title="Session context missing"
            message={recoveryMessage ?? "Open a recent session or create a new one to continue."}
            recentStrategies={recentStrategies}
            mode="strategy"
          />
        ) : null}

        {strategyId && !detailLoading && detailResult ? (
          <div className="space-y-5">
            <Button asChild variant="outline" className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10">
              <Link href="/dashboard">Back to Dashboard</Link>
            </Button>
            <StrategyReport result={detailResult} strategyId={strategyId} studyProgress={detailStudyProgress} />
          </div>
        ) : null}

        {!strategyId && loading ? (
          <TextShimmerWave className="text-sm [--base-color:#a3a3a3] [--base-gradient-color:#ffffff]" duration={1}>
            Loading your study sessions...
          </TextShimmerWave>
        ) : null}

        {!strategyId && empty ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-10 md:p-14 text-center relative overflow-hidden">
            <div className="relative z-10 flex flex-col items-center gap-6">
              <div className="w-20 h-20 rounded-2xl bg-orange-500/15 border border-orange-400/20 flex items-center justify-center shadow-[0_0_40px_rgba(249,115,22,0.2)]">
                <Sparkles className="w-10 h-10 text-orange-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
                  Ready for your exam?
                </h3>
                <p className="text-neutral-400 text-sm md:text-base max-w-md mx-auto">
                  Upload your syllabus and notes — we&apos;ll build a personalized study session ranked by priority.
                </p>
              </div>
              <Button
                asChild
                size="lg"
                className="rounded-full bg-orange-500 hover:bg-orange-400 text-white px-8 py-6 text-base font-medium shadow-[0_0_30px_rgba(249,115,22,0.3)] hover:shadow-[0_0_40px_rgba(249,115,22,0.5)] transition-all"
              >
                <Link href="/upload">Start Preparing →</Link>
              </Button>
              <div className="flex items-center gap-6 text-xs text-neutral-400 pt-2">
                <div className="flex items-center gap-1.5"><Files className="w-3.5 h-3.5" /><span>Multiple files</span></div>
                <div className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /><span>AI-powered</span></div>
                <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /><span>Time-based</span></div>
              </div>
            </div>
          </div>
        ) : null}

        {!strategyId && !loading && items.length ? (
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
