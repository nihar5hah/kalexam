"use client";

import { ModelType, CustomProviderConfig } from "@/lib/ai/types";

type ModelSwitcherProps = {
  modelType: ModelType;
  customConfig: CustomProviderConfig;
  onModelTypeChange: (modelType: ModelType) => void;
  onCustomConfigChange: (config: CustomProviderConfig) => void;
};

export function ModelSwitcher({
  modelType,
  customConfig,
  onModelTypeChange,
  onCustomConfigChange,
}: ModelSwitcherProps) {
  return (
    <div className="space-y-4">
      <label className="text-sm text-neutral-300 font-medium">Model Provider</label>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onModelTypeChange("gemini")}
          className={`rounded-2xl border px-4 py-3 text-sm transition-all ${
            modelType === "gemini"
              ? "border-indigo-400/60 bg-indigo-500/20 text-white"
              : "border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10"
          }`}
        >
          Gemini (default)
        </button>
        <button
          type="button"
          onClick={() => onModelTypeChange("custom")}
          className={`rounded-2xl border px-4 py-3 text-sm transition-all ${
            modelType === "custom"
              ? "border-indigo-400/60 bg-indigo-500/20 text-white"
              : "border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10"
          }`}
        >
          Custom Model
        </button>
      </div>

      {modelType === "custom" ? (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="space-y-2">
            <label className="text-xs text-neutral-400">Base URL</label>
            <input
              value={customConfig.baseUrl}
              onChange={(event) =>
                onCustomConfigChange({ ...customConfig, baseUrl: event.target.value })
              }
              placeholder="https://openrouter.ai/api/v1"
              className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-indigo-400/60"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-neutral-400">API Key</label>
            <input
              type="password"
              value={customConfig.apiKey}
              onChange={(event) =>
                onCustomConfigChange({ ...customConfig, apiKey: event.target.value })
              }
              placeholder="sk-..."
              className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-indigo-400/60"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-neutral-400">Model Name</label>
            <input
              value={customConfig.modelName}
              onChange={(event) =>
                onCustomConfigChange({ ...customConfig, modelName: event.target.value })
              }
              placeholder="openai/gpt-4o-mini"
              className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-indigo-400/60"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
