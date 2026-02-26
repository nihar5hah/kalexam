"use client";

import { RefObject, memo } from "react";
import { MessageCircle, X } from "lucide-react";

import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { AIInputWithLoading } from "@/components/ui/ai-input-with-loading";
import { AnimatedGlowingBorder } from "@/components/ui/animated-glowing-search-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SourceCitation, TopicConfidence } from "@/lib/ai/types";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  confidence?: TopicConfidence;
  citations?: SourceCitation[];
  usedVideoContext?: boolean;
};

function ChatMessageList({
  chatHistory,
  showAssistantMeta,
  chatEndRef,
}: {
  chatHistory: ChatMessage[];
  showAssistantMeta: boolean;
  chatEndRef?: RefObject<HTMLDivElement | null>;
}) {
  const visibleMessages = chatHistory.length > 80 ? chatHistory.slice(-80) : chatHistory;

  return (
    <>
      {visibleMessages.length ? (
        visibleMessages.map((message) => (
          <div
            key={message.id}
            className={`rounded-xl px-3 py-2 text-sm leading-6 border ${
              message.role === "user"
                ? "bg-orange-500/15 border-orange-400/25 text-orange-50"
                : "bg-black/25 border-white/10 text-neutral-100"
            }`}
          >
            <MarkdownRenderer content={message.content} />
            {showAssistantMeta && message.role === "assistant" && message.citations?.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {message.citations.slice(0, 3).map((citation, index) => (
                  <span
                    key={`${citation.sourceName}-${index}`}
                    className="text-[10px] rounded-xl bg-white/10 px-2 py-1 text-neutral-300 leading-snug"
                  >
                    {citation.sourceType}: {citation.sourceName}
                    {citation.sourceYear ? ` (${citation.sourceYear})` : ""}
                  </span>
                ))}
                {message.usedVideoContext ? (
                  <span className="text-[10px] rounded-xl bg-violet-500/20 px-2 py-1 text-violet-200 leading-snug">
                    Used video explanation
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        ))
      ) : (
        <p className="text-sm text-neutral-400">Ask a question and get concise, topic-specific answers.</p>
      )}
      {chatEndRef ? <div ref={chatEndRef} /> : null}
    </>
  );
}

function ChatInput({
  inputId,
  minHeight,
  asking,
  onSubmit,
}: {
  inputId: string;
  minHeight: number;
  asking: boolean;
  onSubmit: (value: string) => Promise<void>;
}) {
  const isDesktop = minHeight >= 56;

  return (
    <AnimatedGlowingBorder className={isDesktop ? "w-full h-[62px]" : "w-full h-[56px]"} innerClassName="h-full bg-[#010201]">
      <AIInputWithLoading
        id={inputId}
        placeholder="Ask about this topic"
        loadingDuration={1200}
        thinkingDuration={500}
        minHeight={minHeight}
        className="py-0"
        textareaClassName={
          isDesktop
            ? "h-[56px] min-h-[56px] rounded-lg bg-[#010201] dark:bg-[#010201] text-white placeholder:text-neutral-400"
            : "h-[48px] min-h-[48px] rounded-lg bg-[#010201] dark:bg-[#010201] text-white placeholder:text-neutral-400"
        }
        onSubmit={onSubmit}
        disabled={asking}
        showStatusText={false}
      />
    </AnimatedGlowingBorder>
  );
}

function DesktopStudyChatPanelComponent({
  chatHistory,
  asking,
  onSubmit,
  chatEndRef,
}: {
  chatHistory: ChatMessage[];
  asking: boolean;
  onSubmit: (value: string) => Promise<void>;
  chatEndRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="hidden md:flex w-[380px] xl:w-[420px] flex-shrink-0 flex-col px-4 pt-4 pb-[68px]">
      <Card className="flex-1 flex flex-col min-h-0 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl overflow-hidden">
        <CardHeader className="px-5 pt-5 pb-3 flex-shrink-0 border-b border-white/[0.07]">
          <CardTitle className="text-white text-base font-semibold tracking-tight">Ask about this topic</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden px-4 py-4">
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
            <ChatMessageList chatHistory={chatHistory} showAssistantMeta chatEndRef={chatEndRef} />
          </div>

          <div className="pt-1 pb-1">
            <ChatInput inputId="study-topic-chat" minHeight={56} asking={asking} onSubmit={onSubmit} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MobileStudyChatPanelComponent({
  open,
  chatHistory,
  asking,
  onSubmit,
  onToggle,
  onClose,
}: {
  open: boolean;
  chatHistory: ChatMessage[];
  asking: boolean;
  onSubmit: (value: string) => Promise<void>;
  onToggle: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <Button
        type="button"
        size="icon"
        className="fixed md:hidden bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] right-4 z-[60] h-12 w-12 rounded-full bg-orange-500 hover:bg-orange-400 text-white shadow-lg shadow-orange-500/20"
        onClick={onToggle}
        aria-label={open ? "Close chat" : "Open chat"}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </Button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-[59] bg-black/50 md:hidden"
            aria-hidden="true"
            onClick={onClose}
          />
          <div className="fixed md:hidden inset-x-0 bottom-0 z-[60] border-t border-white/10 bg-black/90 backdrop-blur-sm max-h-[65vh] flex flex-col pb-safe">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <p className="text-sm text-white font-medium">Ask about this topic</p>
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10"
              onClick={onClose}
            >
              Done
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            <ChatMessageList chatHistory={chatHistory} showAssistantMeta={false} />
          </div>

          <div className="px-4 py-3 border-t border-white/10">
            <ChatInput inputId="study-topic-chat-mobile" minHeight={48} asking={asking} onSubmit={onSubmit} />
          </div>
          </div>
        </>
      ) : null}
    </>
  );
}

export const DesktopStudyChatPanel = memo(DesktopStudyChatPanelComponent);
export const MobileStudyChatPanel = memo(MobileStudyChatPanelComponent);
