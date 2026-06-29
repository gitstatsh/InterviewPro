"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  body: string;
  difficulty?: string;
  category?: string;
  tags?: string[];
  expectedAnswer?: string;
}

const DIFF_COLOR: Record<string, string> = {
  EASY: "bg-emerald-100 text-emerald-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  HARD: "bg-red-100 text-red-700",
};

export function QuestionDetailDialog({ title, body, difficulty, category, tags, expectedAnswer }: Props) {
  const [open, setOpen] = useState(false);

  const isLong = body && body.length > 120;
  if (!isLong) return null;

  return (
    <>
      <button
        onClick={e => { e.stopPropagation(); setOpen(true); }}
        className="ml-1 inline-flex items-center text-xs text-muted-foreground hover:text-foreground transition shrink-0 align-bottom"
        title="View full question"
      >
        ···
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-background border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-5 border-b border-border">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {difficulty && (
                    <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded", DIFF_COLOR[difficulty] ?? "bg-muted text-muted-foreground")}>
                      {difficulty}
                    </span>
                  )}
                  {category && (
                    <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{category}</span>
                  )}
                  {tags?.map(t => (
                    <span key={t} className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{t}</span>
                  ))}
                </div>
                <p className="font-semibold text-sm text-foreground leading-snug">{title}</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="shrink-0 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Question</p>
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{body}</p>
              </div>

              {expectedAnswer && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Expected Answer</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{expectedAnswer}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
