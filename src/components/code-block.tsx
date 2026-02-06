"use client";

import { CopyButton } from "@/components/copy-button";

export function CodeBlock({
  code,
  language,
  title,
}: {
  code: string;
  language?: string;
  title?: string;
}) {
  return (
    <div className="overflow-hidden rounded-md bg-zinc-900">
      {(title || language) && (
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
          <span className="text-[11px] font-medium text-zinc-400">
            {title || language}
          </span>
          <CopyButton text={code} className="text-zinc-500 hover:text-zinc-300" />
        </div>
      )}
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed text-zinc-300">
        <code>{code}</code>
      </pre>
      {!title && !language && (
        <div className="absolute right-2 top-2">
          <CopyButton text={code} className="text-zinc-500 hover:text-zinc-300" />
        </div>
      )}
    </div>
  );
}
