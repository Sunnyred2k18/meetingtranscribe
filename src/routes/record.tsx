import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Square, Copy, FileDown, FileText, RotateCcw, Check, Share2, Users, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { getSpeechRecognition, formatTime, type SR } from "@/lib/speech";
import { downloadPdf, downloadTxt, generateSessionCode, transcriptToText, type Segment } from "@/lib/transcript";
import { TranscriptView } from "@/components/TranscriptView";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export const Route = createFileRoute("/record")({
  component: RecordPage,
  head: () => ({
    meta: [
      { title: "Record — Meeting Scribe" },
      { name: "description", content: "Record a meeting and share a live transcript link with others." },
    ],
  }),
});

const SPEAKER_PAUSE_MS = 1800;

function RecordPage() {
  const [supported, setSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [interim, setInterim] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);
  const [sessionCode] = useState(() => generateSessionCode());
  const [viewers, setViewers] = useState(0);

  const recRef = useRef<SR | null>(null);
  const startedAtRef = useRef<number>(0);
  const lastResultAtRef = useRef<number>(0);
  const speakerRef = useRef<number>(1);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const segmentsRef = useRef<Segment[]>([]);

  useEffect(() => { segmentsRef.current = segments; }, [segments]);

  useEffect(() => {
    setSupported(!!getSpeechRecognition());
  }, []);

  // Realtime channel: broadcast updates to viewers
  useEffect(() => {
    const channel = supabase.channel(`scribe:${sessionCode}`, {
      config: { broadcast: { self: false }, presence: { key: "host" } },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      let count = 0;
      for (const key of Object.keys(state)) {
        if (key.startsWith("viewer")) count += state[key].length;
      }
      setViewers(count);
    });

    // Respond to viewer requests for current snapshot
    channel.on("broadcast", { event: "request-sync" }, () => {
      channel.send({
        type: "broadcast",
        event: "snapshot",
        payload: { segments: segmentsRef.current, interim: "", recording },
      });
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ role: "host", at: Date.now() });
      }
    });

    channelRef.current = channel;
    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionCode]);

  const broadcast = (nextSegments: Segment[], nextInterim: string, isRecording: boolean) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "snapshot",
      payload: { segments: nextSegments, interim: nextInterim, recording: isRecording },
    });
  };

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setElapsed(Date.now() - startedAtRef.current), 250);
    return () => clearInterval(id);
  }, [recording]);

  const start = () => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      toast.error("Speech recognition not supported. Try Chrome or Edge.");
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
    broadcast([], "", true);

    rec.onresult = (e) => {
      let interimText = "";
      let nextSegs = segmentsRef.current;
      let changed = false;

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const txt = res[0].transcript;
        if (res.isFinal) {
          const now = Date.now();
          const gap = now - lastResultAtRef.current;
          const startMs = now - startedAtRef.current;
          const clean = txt.trim();
          if (!clean) continue;
          const last = nextSegs[nextSegs.length - 1];
          const newSpeaker = gap > SPEAKER_PAUSE_MS && nextSegs.length > 0;
          if (newSpeaker) speakerRef.current = speakerRef.current === 1 ? 2 : 1;
          if (last && !newSpeaker) {
            nextSegs = [...nextSegs.slice(0, -1), { ...last, text: (last.text + " " + clean).trim() }];
          } else {
            nextSegs = [...nextSegs, { speaker: speakerRef.current, startMs, text: clean }];
          }
          lastResultAtRef.current = now;
          changed = true;
        } else {
          interimText += txt;
        }
      }
      if (changed) {
        segmentsRef.current = nextSegs;
        setSegments(nextSegs);
      }
      setInterim(interimText);
      broadcast(nextSegs, interimText, true);
    };

    rec.onerror = (e) => {
      const err = e as Event & { error?: string };
      if (err.error === "not-allowed") toast.error("Microphone permission denied.");
      else if (err.error && err.error !== "no-speech" && err.error !== "aborted") {
        toast.error(`Recognition error: ${err.error}`);
      }
    };

    rec.onend = () => {
      if (recRef.current === rec) {
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
    broadcast(segmentsRef.current, "", false);
  };

  const reset = () => {
    stop();
    setSegments([]);
    segmentsRef.current = [];
    setInterim("");
    setElapsed(0);
    broadcast([], "", false);
  };

  const transcriptText = useMemo(() => transcriptToText(segments), [segments]);

  const copyTranscript = async () => {
    if (!transcriptText) return;
    await navigator.clipboard.writeText(transcriptText);
    setCopied(true);
    toast.success("Transcript copied");
    setTimeout(() => setCopied(false), 1500);
  };

  const copyShareLink = async () => {
    const url = `${window.location.origin}/view/${sessionCode}`;
    await navigator.clipboard.writeText(url);
    toast.success("Share link copied");
  };

  const hasContent = segments.length > 0;
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/view/${sessionCode}` : "";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster position="top-center" />
      <div className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
        <div className="mb-8 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span>{viewers} {viewers === 1 ? "viewer" : "viewers"}</span>
          </div>
        </div>

        {!supported && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Speech recognition not available. Try Chrome, Edge, or Safari.
          </div>
        )}

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Session code</p>
              <p className="font-mono text-2xl font-semibold tracking-widest">{sessionCode}</p>
            </div>
            <Button variant="outline" size="sm" onClick={copyShareLink}>
              <Share2 className="h-4 w-4" />
              <span className="ml-2 hidden sm:inline">Copy link</span>
            </Button>
          </div>
          <p className="break-all rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{shareUrl}</p>
        </section>

        <section className="mt-6 flex flex-col items-center gap-5 rounded-2xl border border-border bg-card p-10 shadow-sm">
          <button
            onClick={recording ? stop : start}
            disabled={!supported}
            aria-label={recording ? "Stop recording" : "Start recording"}
            className={[
              "relative flex h-24 w-24 items-center justify-center rounded-full transition-all",
              "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30",
              recording
                ? "bg-destructive text-destructive-foreground shadow-lg shadow-destructive/20"
                : "bg-primary text-primary-foreground hover:scale-105 hover:shadow-lg hover:shadow-primary/20",
              "disabled:opacity-40 disabled:cursor-not-allowed",
            ].join(" ")}
          >
            {recording ? <Square className="h-9 w-9" fill="currentColor" /> : <Mic className="h-9 w-9" />}
            {recording && <span className="absolute inset-0 animate-ping rounded-full bg-destructive/40" />}
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
            <span className="font-mono tabular-nums text-muted-foreground">{formatTime(elapsed)}</span>
          </div>
        </section>

        {(hasContent || interim) && (
          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-medium">Transcript</h2>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={copyTranscript} disabled={!hasContent}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="sm" onClick={() => downloadTxt(segments)} disabled={!hasContent}>
                  <FileText className="h-4 w-4" />
                  <span className="ml-2 hidden sm:inline">TXT</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => downloadPdf(segments)} disabled={!hasContent}>
                  <FileDown className="h-4 w-4" />
                  <span className="ml-2 hidden sm:inline">PDF</span>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Start a new recording?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will clear the current transcript for you and any viewers.
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
            <TranscriptView segments={segments} interim={interim} />
          </section>
        )}
      </div>
    </div>
  );
}
