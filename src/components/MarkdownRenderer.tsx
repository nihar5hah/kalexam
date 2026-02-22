"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="leading-7 text-sm text-neutral-200">{children}</p>,
        h1: ({ children }) => <h1 className="text-xl font-semibold text-white mt-3 mb-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-lg font-semibold text-white mt-3 mb-2">{children}</h2>,
        h3: ({ children }) => <h3 className="text-base font-semibold text-white mt-3 mb-2">{children}</h3>,
        ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 text-sm text-neutral-200">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 text-sm text-neutral-200">{children}</ol>,
        strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
        table: ({ children }) => <table className="w-full text-sm border-collapse my-2">{children}</table>,
        th: ({ children }) => <th className="text-left border-b border-white/10 py-2 pr-2 text-indigo-200">{children}</th>,
        td: ({ children }) => <td className="border-b border-white/5 py-2 pr-2 text-neutral-200 align-top">{children}</td>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
