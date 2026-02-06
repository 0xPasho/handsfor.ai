"use client";

import { useRef, useCallback } from "react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/modules/shared/components/ui/tabs";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Bold, Italic, Link, List, Heading2 } from "lucide-react";
import { cn } from "@/modules/shared/utils";

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
  rows?: number;
  className?: string;
  variant?: "dark" | "light";
};

export function MarkdownEditor({
  value,
  onChange,
  maxLength,
  placeholder,
  rows = 4,
  className,
  variant = "light",
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertMarkdown = useCallback(
    (before: string, after: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = value.slice(start, end);
      const newValue =
        value.slice(0, start) + before + selected + after + value.slice(end);
      if (maxLength && newValue.length > maxLength) return;
      onChange(newValue);
      requestAnimationFrame(() => {
        textarea.selectionStart = start + before.length;
        textarea.selectionEnd = start + before.length + selected.length;
        textarea.focus();
      });
    },
    [value, onChange, maxLength],
  );

  const insertLinePrefix = useCallback(
    (prefix: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      // Find the beginning of the current line
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const newValue =
        value.slice(0, lineStart) + prefix + value.slice(lineStart);
      if (maxLength && newValue.length > maxLength) return;
      onChange(newValue);
      requestAnimationFrame(() => {
        textarea.selectionStart = start + prefix.length;
        textarea.selectionEnd = start + prefix.length;
        textarea.focus();
      });
    },
    [value, onChange, maxLength],
  );

  const handleChange = (newValue: string) => {
    if (maxLength && newValue.length > maxLength) return;
    onChange(newValue);
  };

  const isDark = variant === "dark";

  return (
    <div className={cn("rounded-md border", isDark ? "border-zinc-700 bg-zinc-900" : "border-border bg-background", className)}>
      <Tabs defaultValue="write">
        {/* Header: tabs + toolbar */}
        <div
          className={cn(
            "flex items-center justify-between border-b px-2",
            isDark ? "border-zinc-700" : "border-border",
          )}
        >
          <TabsList variant="line" className="h-8">
            <TabsTrigger
              value="write"
              className={cn(
                "h-7 px-2 text-xs",
                isDark && "text-zinc-400 data-[state=active]:text-white after:bg-white",
              )}
            >
              Write
            </TabsTrigger>
            <TabsTrigger
              value="preview"
              className={cn(
                "h-7 px-2 text-xs",
                isDark && "text-zinc-400 data-[state=active]:text-white after:bg-white",
              )}
            >
              Preview
            </TabsTrigger>
          </TabsList>

          {/* Toolbar */}
          <div className="flex items-center gap-0.5">
            {[
              { icon: Bold, action: () => insertMarkdown("**", "**"), label: "Bold" },
              { icon: Italic, action: () => insertMarkdown("_", "_"), label: "Italic" },
              { icon: Heading2, action: () => insertLinePrefix("## "), label: "Heading" },
              { icon: List, action: () => insertLinePrefix("- "), label: "List" },
              {
                icon: Link,
                action: () => {
                  const textarea = textareaRef.current;
                  if (!textarea) return;
                  const start = textarea.selectionStart;
                  const end = textarea.selectionEnd;
                  const selected = value.slice(start, end);
                  if (selected) {
                    insertMarkdown("[", "](url)");
                  } else {
                    insertMarkdown("[link text](", ")");
                  }
                },
                label: "Link",
              },
            ].map(({ icon: Icon, action, label }) => (
              <button
                key={label}
                type="button"
                onClick={action}
                className={cn(
                  "rounded p-1 transition-colors",
                  isDark
                    ? "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
                title={label}
              >
                <Icon className="size-3.5" />
              </button>
            ))}
          </div>
        </div>

        {/* Write tab */}
        <TabsContent value="write" className="mt-0">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            className={cn(
              "w-full resize-none px-3 py-2 text-sm outline-none placeholder:text-muted-foreground",
              isDark
                ? "bg-zinc-900 text-white placeholder:text-zinc-500"
                : "bg-background text-foreground",
            )}
          />
        </TabsContent>

        {/* Preview tab */}
        <TabsContent value="preview" className="mt-0">
          <div
            className={cn(
              "min-h-[calc(1.5rem*var(--rows)+1rem)] max-h-96 overflow-y-auto px-3 py-2",
              isDark && "prose-invert",
            )}
            style={{ "--rows": rows } as React.CSSProperties}
          >
            {value ? (
              <MarkdownRenderer
                content={value}
                className={cn("text-sm", isDark && "prose-invert")}
              />
            ) : (
              <p
                className={cn(
                  "text-sm",
                  isDark ? "text-zinc-500" : "text-muted-foreground",
                )}
              >
                Nothing to preview
              </p>
            )}
          </div>
        </TabsContent>

        {/* Footer: character count */}
        {maxLength && (
          <div
            className={cn(
              "border-t px-3 py-1 text-right text-xs",
              isDark
                ? "border-zinc-700 text-zinc-500"
                : "border-border text-muted-foreground",
            )}
          >
            {value.length}/{maxLength}
          </div>
        )}
      </Tabs>
    </div>
  );
}
