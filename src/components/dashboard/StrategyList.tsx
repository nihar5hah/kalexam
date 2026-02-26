"use client";

import Link from "next/link";
import { memo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type DashboardSessionCard = {
  id: string;
  strategyId: string;
  subjectName: string;
  createdAtLabel: string;
  chaptersCount: number;
  progressPercent: number;
  estimatedTotalStudyTime: string;
  canManage: boolean;
};

export function StrategyList({
  items,
  onRename,
  onDelete,
}: {
  items: DashboardSessionCard[];
  onRename: (sessionId: string, subjectName: string) => Promise<void>;
  onDelete: (sessionId: string) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  return (
    <div className="flex w-full flex-col gap-4">
      {items.map((item) => (
        <SessionCard
          key={item.id}
          item={item}
          busy={busyId === item.id}
          onRename={onRename}
          onDelete={onDelete}
          setBusyId={setBusyId}
        />
      ))}
    </div>
  );
}

const SessionCard = memo(function SessionCard({
  item,
  busy,
  onRename,
  onDelete,
  setBusyId,
}: {
  item: DashboardSessionCard;
  busy: boolean;
  onRename: (sessionId: string, subjectName: string) => Promise<void>;
  onDelete: (sessionId: string) => Promise<void>;
  setBusyId: (value: string | null) => void;
}) {
  return (
    <Card className="bg-white/5 border border-white/10 backdrop-blur-sm shadow-lg rounded-3xl transition-all hover:border-white/20 hover:bg-white/8">
      <CardHeader className="space-y-2">
        <CardTitle className="text-white text-xl">{item.subjectName}</CardTitle>
        <p className="text-sm text-neutral-400">Created: {item.createdAtLabel}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-neutral-300">
            Chapters: {item.chaptersCount}
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-neutral-300">
            Progress: {item.progressPercent}%
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-neutral-300">
            Study time: {item.estimatedTotalStudyTime}
          </div>
        </div>

        <div className="space-y-1">
          <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-orange-500 transition-all duration-500"
              style={{ width: `${item.progressPercent}%` }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild className="rounded-full bg-orange-500 hover:bg-orange-400 text-white shadow-[0_0_16px_rgba(249,115,22,0.2)] hover:shadow-[0_0_24px_rgba(249,115,22,0.35)] transition-all">
            <Link href={`/dashboard?id=${item.strategyId}`}>Resume Study</Link>
          </Button>

          <Button
            type="button"
            variant="outline"
            className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10"
            disabled={busy || !item.canManage}
            onClick={async () => {
              const nextName = window.prompt("Rename subject", item.subjectName)?.trim();
              if (!nextName || nextName === item.subjectName) {
                return;
              }

              setBusyId(item.id);
              try {
                await onRename(item.id, nextName);
              } finally {
                setBusyId(null);
              }
            }}
          >
            Rename
          </Button>

          <Button
            type="button"
            variant="outline"
            className="rounded-full border-red-300/30 bg-red-500/10 text-red-200 hover:bg-red-500/20"
            disabled={busy || !item.canManage}
            onClick={async () => {
              const confirmed = window.confirm("Move this study session to deleted items?");
              if (!confirmed) {
                return;
              }

              setBusyId(item.id);
              try {
                await onDelete(item.id);
              } finally {
                setBusyId(null);
              }
            }}
          >
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});
