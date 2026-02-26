"use client";

import { memo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StudySourceRecord } from "@/lib/firestore/sources";

type SourceAddStatus =
  | "idle"
  | "validating"
  | "fetching"
  | "fetching-transcript"
  | "fetching-metadata"
  | "ai-reconstruction"
  | "extracting"
  | "chunking"
  | "indexing"
  | "completed"
  | "failed";

const TYPE_ICON: Record<string, string> = {
  pdf: "📄",
  ppt: "📊",
  docx: "📊",
  youtube: "🎥",
  url: "🌐",
  text: "📝",
};

const ADD_STATUS_LABEL: Record<SourceAddStatus, string> = {
  idle: "Add Source",
  validating: "Validating…",
  fetching: "Fetching…",
  "fetching-transcript": "Fetching transcript…",
  "fetching-metadata": "Analyzing video…",
  "ai-reconstruction": "AI reconstruction…",
  extracting: "Extracting…",
  chunking: "Chunking…",
  indexing: "Indexing…",
  completed: "Ready ✔",
  failed: "Retry",
};

function SourceListItem({
  source,
  onToggle,
  onRemove,
}: {
  source: StudySourceRecord;
  onToggle: (sourceId: string, enabled: boolean) => void;
  onRemove: (sourceId: string) => void;
}) {
  const icon = TYPE_ICON[source.type] ?? "📄";
  return (
    <div className={`rounded-xl border border-white/10 bg-black/25 px-3 py-2 ${source.enabled ? "opacity-100" : "opacity-45"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={`min-w-0 max-w-full overflow-hidden ${source.enabled ? "pointer-events-auto" : "pointer-events-none"}`}>
          <p className="text-sm text-white break-words">{icon} {source.title}</p>
          <p className="text-[11px] text-neutral-400 uppercase tracking-wide">
            {source.type} • {source.status} • {source.chunkCount} chunks
          </p>
          {!source.enabled ? (
            <p className="inline-flex mt-1 text-[10px] rounded-full bg-red-500/20 px-2 py-0.5 text-red-300 uppercase tracking-wide">DISABLED</p>
          ) : null}
          {source.type === "youtube" ? (
            <p className="text-[11px] text-violet-300">🎥 Video Source</p>
          ) : null}
          {source.type === "youtube" && source.status === "indexed" && !source.aiGeneratedTranscript && source.transcriptSource !== "ai-reconstructed" ? (
            <p className="text-[11px] text-sky-300">Captions Transcript</p>
          ) : null}
          {source.type === "youtube" && (source.transcriptSource === "ai-reconstructed" || source.aiGeneratedTranscript) ? (
            <>
              <p className="text-[11px] text-emerald-300">AI Reconstructed</p>
              <p className="text-[11px] text-neutral-400">AI generated from video metadata</p>
            </>
          ) : null}
          {source.type === "youtube" && source.translatedToEnglish && source.videoLanguage === "hindi" ? (
            <p className="text-[11px] text-cyan-300">🌐 Hindi → English</p>
          ) : null}
          {source.errorMessage ? <p className="text-[11px] text-amber-300">{source.errorMessage}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10"
            onClick={() => onToggle(source.id, !source.enabled)}
          >
            {source.enabled ? "Disable" : "Enable"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full border-red-400/20 bg-red-500/10 text-red-200 hover:bg-red-500/20"
            onClick={() => onRemove(source.id)}
          >
            Remove
          </Button>
        </div>
      </div>
    </div>
  );
}

function StudySourcesCardComponent({
  sources,
  addStatus,
  onAddSource,
  onToggleSource,
  onRemoveSource,
}: {
  sources: StudySourceRecord[];
  addStatus: SourceAddStatus;
  onAddSource: (url: string) => void;
  onToggleSource: (sourceId: string, enabled: boolean) => void;
  onRemoveSource: (sourceId: string) => void;
}) {
  const [localUrl, setLocalUrl] = useState("");
  const isBusy = addStatus !== "idle" && addStatus !== "completed" && addStatus !== "failed";

  function handleSubmit() {
    const trimmed = localUrl.trim();
    if (!trimmed || isBusy) return;
    onAddSource(trimmed);
    setLocalUrl("");
  }

  return (
    <Card className="bg-white/5 border border-white/10 backdrop-blur-sm rounded-3xl">
      <CardHeader>
        <CardTitle className="text-white text-lg">Sources</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 md:flex-row">
          <input
            value={localUrl}
            onChange={(event) => setLocalUrl(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") handleSubmit(); }}
            placeholder="Add website, YouTube URL, or quick text note"
            className="h-10 flex-1 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-white/30"
          />
          <Button
            type="button"
            variant="outline"
            className="rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/10"
            onClick={handleSubmit}
            disabled={isBusy}
          >
            {ADD_STATUS_LABEL[addStatus]}
          </Button>
        </div>

        {sources.length ? (
          <div className="space-y-2">
            {sources.map((source) => (
              <SourceListItem
                key={source.id}
                source={source}
                onToggle={onToggleSource}
                onRemove={onRemoveSource}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-400">No sources indexed yet for this session.</p>
        )}
      </CardContent>
    </Card>
  );
}

export const StudySourcesCard = memo(StudySourcesCardComponent);
