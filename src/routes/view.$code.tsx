import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Copy, FileDown, FileText, Check, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { TranscriptView } from "@/components/TranscriptView";
import { downloadPdf, downloadTxt, transcriptToText, type Segment } from "@/lib/transcript";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/view/$code")({
  component: ViewPage,
  head: ({ params }) => ({
    meta: [
      { title: `Live transcript ${params.code} — Meeting Scribe` },
      { name: "description", content: "Follow a live meeting transcript in real time." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function ViewPage() {
  const { code } = Route.useParams();
  const sessionCode = code.toUpperCase();

  const [segments, setSegments] = useState<Segment[]>([]);
  const [interim, setInterim] = useState("");
  const [connected, setConnected] = useState(false);
  const [hostOnline, setHostOnline] = useState(false);
  const [recording, setRecording] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const viewerKey = `viewer-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase.channel(`scribe:${sessionCode}`, {
      config: { broadcast: { self: false }, presence: { key: viewerKey } },
    });

    channel.on("broadcast", { event: "snapshot" }, ({ payload }) => {
      const p = payload as { segments?: Segment[]; interim?: string; recording?: boolean };
      if (p.segments) setSegments(p.segments);
      if (typeof p.interim === "string") setInterim(p.interim);
      if (typeof p.recording === "boolean") setRecording(p.recording);
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      setHostOnline(Object.prototype.hasOwnProperty.call(state, "host"));
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        setConnected(true);
        await channel.track({ role: "viewer", at: Date.now() });
        // Ask host to send current snapshot
        channel.send({ type: "broadcast", event: "request-sync", payload: {} });
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
        setConnected(false);
      }
    });

    return () => {
      channel.unsubscribe();
    };
  }, [sessionCode]);

  const transcriptText = useMemo(() => transcriptToText(segments), [segments]);

  const copyTranscript = async () => {
    if (!transcriptText) return;
    await navigator.clipboard.writeText(transcriptText);
    setCopied(true);
    toast.success("Transcript copied");
    setTimeout(() => setCopied(false), 1500);
  };

  const hasContent = segments.length > 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster position="top-center" />
      <div className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
        <div className="mb-8 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <div className="flex items-center gap-2 text-xs">
            <span
              className={[
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
                connected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              ].join(" ")}
            >
              <Radio className="h-3 w-3" />
              {connected ? "Connected" : "Connecting…"}
            </span>
          </div>
        </div>

        <header className="mb-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Live session</p>
          <h1 className="font-mono text-2xl font-semibold tracking-widest">{sessionCode}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {!hostOnline
              ? "Waiting for the speaker to join…"
              : recording
              ? "Speaker is recording. Transcript updates live below."
              : "Speaker is connected but not currently recording."}
          </p>
        </header>

        <section>
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
            </div>
          </div>
          <TranscriptView
            segments={segments}
            interim={interim}
            emptyHint={hostOnline ? "Listening for the speaker…" : "Waiting for the speaker to start the session."}
          />
        </section>
      </div>
    </div>
  );
}
