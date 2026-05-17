import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { Mic, Square, Copy, FileDown, FileText, RotateCcw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { getSpeechRecognition, formatTime, type SR } from "@/lib/speech";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Scribe — Live Meeting & Interview Transcription" },
      { name: "description", content: "Record and transcribe meetings and interviews in your browser with auto language detection, speaker labels, and PDF/TXT export." },
    ],
  }),
});

interface Segment {
  speaker: number;
  startMs: number;
  text: string;
}

const SPEAKER_PAUSE_MS = 1800;

function Index() {
  const [supported, setSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [interim, setInterim] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);

  const recRef = useRef<SR | null>(null);
  const startedAtRef = useRef<number>(0);
  const lastResultAtRef = useRef<number>(0);
  const speakerRef = useRef<number>(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSupported(!!getSpeechRecognition());
  }, []);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setElapsed(Date.now() - startedAtRef.current), 250);
    return () => clearInterval(id);
  }, [recording]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [segments, interim]);

  const start = () => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      toast.error("Speech recognition not supported in this browser. Try Chrome or Edge.");
      return;
    }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";

    startedAtRef.current = Date.now();
    lastResultAtRef.current = Date.now();
    speakerRef.current = 1;
    setSegments([]);
    setInterim("");
    setElapsed(0);

    rec.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const txt = res[0].transcript;
        if (res.isFinal) {
          const now = Date.now();
          const gap = now - lastResultAtRef.current;
          const startMs = now - startedAtRef.current;
          const clean = txt.trim();
          if (!clean) continue;

          setSegments((prev) => {
            const last = prev[prev.length - 1];
            const newSpeaker = gap > SPEAKER_PAUSE_MS && prev.length > 0;
            if (newSpeaker) speakerRef.current = speakerRef.current === 1 ? 2 : 1;
            if (last && !newSpeaker) {
              const merged = [...prev];
              merged[merged.length - 1] = { ...last, text: (last.text + " " + clean).trim() };
              return merged;
            }
            return [...prev, { speaker: speakerRef.current, startMs, text: clean }];
          });
          lastResultAtRef.current = now;
        } else {
          interimText += txt;
        }
      }
      setInterim(interimText);
    };

    rec.onerror = (e) => {
      const err = e as Event & { error?: string };
      if (err.error === "not-allowed") {
        toast.error("Microphone permission denied.");
      } else if (err.error && err.error !== "no-speech" && err.error !== "aborted") {
        toast.error(`Recognition error: ${err.error}`);
      }
    };

    rec.onend = () => {
      if (recRef.current === rec && recording) {
        try { rec.start(); } catch { /* ignore */ }
      }
    };

    try {
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch (err) {
      console.error(err);
      toast.error("Could not start recording.");
    }
  };

  const stop = () => {
    const rec = recRef.current;
    recRef.current = null;
    setRecording(false);
    setInterim("");
    try { rec?.stop(); } catch { /* ignore */ }
  };

  const reset = () => {
    stop();
    setSegments([]);
    setInterim("");
    setElapsed(0);
  };

  const transcriptText = useMemo(
    () => segments.map((s) => `[${formatTime(s.startMs)}] Speaker ${s.speaker}: ${s.text}`).join("\n\n"),
    [segments]
  );

  const copy = async () => {
    if (!transcriptText) return;
    await navigator.clipboard.writeText(transcriptText);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  };

  const exportTxt = () => {
    const blob = new Blob([transcriptText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 48;
    const width = doc.internal.pageSize.getWidth() - margin * 2;
    const pageH = doc.internal.pageSize.getHeight();
    let y = margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Transcript", margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(new Date().toLocaleString(), margin, y);
    y += 24;
    doc.setTextColor(20);
    doc.setFontSize(11);

    for (const s of segments) {
      const header = `[${formatTime(s.startMs)}] Speaker ${s.speaker}`;
      doc.setFont("helvetica", "bold");
      const headLines = doc.splitTextToSize(header, width);
      if (y + 14 > pageH - margin) { doc.addPage(); y = margin; }
      doc.text(headLines, margin, y);
      y += headLines.length * 14;

      doc.setFont("helvetica", "normal");
      const bodyLines = doc.splitTextToSize(s.text, width);
      for (const line of bodyLines) {
        if (y + 14 > pageH - margin) { doc.addPage(); y = margin; }
        doc.text(line, margin, y);
        y += 14;
      }
      y += 10;
    }

    doc.save(`transcript-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const hasContent = segments.length > 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster position="top-center" />
      <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Scribe</h1>
          <p className="mt-3 text-muted-foreground">
            Live meeting & interview transcription — private, in your browser.
          </p>
        </header>

        {!supported && (
          <div className="mb-8 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Your browser doesn't support the Web Speech API. Please use Chrome, Edge, or Safari.
          </div>
        )}

        <section className="flex flex-col items-center gap-6 rounded-2xl border border-border bg-card p-10 shadow-sm">
          <button
            onClick={recording ? stop : start}
            disabled={!supported}
            aria-label={recording ? "Stop recording" : "Start recording"}
            className={[
              "relative flex h-28 w-28 items-center justify-center rounded-full transition-all",
              "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30",
              recording
                ? "bg-destructive text-destructive-foreground shadow-lg shadow-destructive/20"
                : "bg-primary text-primary-foreground hover:scale-105 hover:shadow-lg hover:shadow-primary/20",
              "disabled:opacity-40 disabled:cursor-not-allowed",
            ].join(" ")}
          >
            {recording ? <Square className="h-10 w-10" fill="currentColor" /> : <Mic className="h-10 w-10" />}
            {recording && (
              <span className="absolute inset-0 animate-ping rounded-full bg-destructive/40" />
            )}
          </button>

          <div className="flex items-center gap-3 text-sm">
            {recording && (
              <span className="flex items-center gap-2 text-destructive">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
                </span>
                Recording
              </span>
            )}
            <span className="font-mono tabular-nums text-muted-foreground">
              {formatTime(elapsed)}
            </span>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            {recording
              ? "Listening… speak naturally. Pauses signal speaker changes."
              : hasContent
              ? "Recording stopped. Export or start a new session below."
              : "Tap the mic to begin. Language is auto-detected from your browser."}
          </p>
        </section>

        {(hasContent || interim) && (
          <section className="mt-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-medium">Transcript</h2>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={copy} disabled={!hasContent}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  <span className="ml-2 hidden sm:inline">Copy</span>
                </Button>
                <Button variant="outline" size="sm" onClick={exportTxt} disabled={!hasContent}>
                  <FileText className="h-4 w-4" />
                  <span className="ml-2 hidden sm:inline">TXT</span>
                </Button>
                <Button variant="outline" size="sm" onClick={exportPdf} disabled={!hasContent}>
                  <FileDown className="h-4 w-4" />
                  <span className="ml-2 hidden sm:inline">PDF</span>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" disabled={!hasContent && !interim}>
                      <RotateCcw className="h-4 w-4" />
                      <span className="ml-2 hidden sm:inline">New</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Start a new recording?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will clear the current transcript. This action can't be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={reset}>Clear & restart</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            <div
              ref={scrollRef}
              className="max-h-[60vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 leading-relaxed"
            >
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
              {interim && (
                <p className="italic text-muted-foreground">{interim}</p>
              )}
            </div>
          </section>
        )}

        <footer className="mt-16 text-center text-xs text-muted-foreground">
          Audio never leaves your device. Powered by the Web Speech API.
        </footer>
      </div>
    </div>
  );
}
