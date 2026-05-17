import { useEffect, useRef } from "react";
import { formatTime } from "@/lib/speech";
import type { Segment } from "@/lib/transcript";

interface Props {
  segments: Segment[];
  interim?: string;
  emptyHint?: string;
}

export function TranscriptView({ segments, interim, emptyHint }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [segments, interim]);

  const empty = segments.length === 0 && !interim;

  return (
    <div
      ref={ref}
      className="max-h-[60vh] min-h-[200px] overflow-y-auto rounded-2xl border border-border bg-card p-6 leading-relaxed"
    >
      {empty && (
        <p className="text-center text-sm text-muted-foreground">{emptyHint ?? "Waiting…"}</p>
      )}
      {segments.map((s, i) => (
        <div key={i} className="mb-5 last:mb-0">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="font-mono tabular-nums">[{formatTime(s.startMs)}]</span>
            <span
              className={
                s.speaker === 1
                  ? "rounded-full bg-primary/10 px-2 py-0.5 text-primary"
                  : "rounded-full bg-accent px-2 py-0.5 text-accent-foreground"
              }
            >
              Speaker {s.speaker}
            </span>
          </div>
          <p className="text-foreground">{s.text}</p>
        </div>
      ))}
      {interim && <p className="italic text-muted-foreground">{interim}</p>}
    </div>
  );
}
