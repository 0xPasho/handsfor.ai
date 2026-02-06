"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={`text-muted-foreground hover:text-foreground shrink-0 transition-colors ${className}`}
      title="Copy"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}
