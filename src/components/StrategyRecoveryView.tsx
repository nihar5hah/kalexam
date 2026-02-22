"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

type RecentStrategy = {
  id: string;
  createdAt?: string;
  topicCount?: number;
  coverage?: string;
};

export function StrategyRecoveryView({
  title,
  message,
  recentStrategies,
  mode,
}: {
  title: string;
  message: string;
  recentStrategies: RecentStrategy[];
  mode: "strategy" | "study";
}) {
  return (
    <div className="w-full text-white flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 md:p-8 space-y-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="text-neutral-300 text-sm md:text-base mt-2">{message}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button asChild className="rounded-full bg-white text-black hover:bg-neutral-200">
            <Link href="/upload">Create New Strategy</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10">
            <Link href={mode === "study" ? "/strategy" : "/upload"}>
              {mode === "study" ? "Back to Strategy" : "Upload Material"}
            </Link>
          </Button>
        </div>

        {recentStrategies.length ? (
          <div className="space-y-2">
            <p className="text-sm text-neutral-300">Recent strategies</p>
            <div className="space-y-2">
              {recentStrategies.map((item) => (
                <Link
                  key={item.id}
                  href={`/strategy?id=${item.id}`}
                  className="block rounded-xl border border-white/10 bg-black/20 px-4 py-3 hover:bg-black/30 transition"
                >
                  <p className="text-sm text-white">Strategy {item.id.slice(0, 8)}</p>
                  <p className="text-xs text-neutral-400 mt-1">
                    {item.createdAt ? `Created: ${item.createdAt}` : "Created recently"}
                    {typeof item.topicCount === "number" ? ` • Topics: ${item.topicCount}` : ""}
                    {item.coverage ? ` • Coverage: ${item.coverage}` : ""}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
