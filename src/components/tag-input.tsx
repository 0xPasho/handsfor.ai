"use client";

import { useState, type KeyboardEvent } from "react";
import { Badge } from "@/modules/shared/components/ui/badge";
import { Input } from "@/modules/shared/components/ui/input";
import { X } from "lucide-react";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
}

export function TagInput({
  tags,
  onChange,
  placeholder = "Add a tag...",
  maxTags = 10,
}: TagInputProps) {
  const [input, setInput] = useState("");

  const addTag = (value: string) => {
    const tag = value.trim().toLowerCase();
    if (!tag || tags.includes(tag) || tags.length >= maxTags) return;
    onChange([...tags, tag]);
    setInput("");
  };

  const removeTag = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag(input);
    }
    if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  return (
    <div>
      {tags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {tags.map((tag, i) => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(i)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      {tags.length < maxTags && (
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}
