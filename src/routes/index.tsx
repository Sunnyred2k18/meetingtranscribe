import { createFileRoute, Link } from "@tanstack/react-router";
import { Mic, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InstallPrompt } from "@/components/InstallPrompt";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Scribe — Live Meeting & Interview Transcription" },
      { name: "description", content: "Record and transcribe meetings live in your browser. Share a session link so others can read the transcript in real time." },
    ],
  }),
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
        <header className="mb-14 text-center">
          <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">Meeting Scribe</h1>
          <p className="mt-4 text-muted-foreground">
            Live transcription you can share. Speak on one device, read on another.
          </p>
        </header>

        <div className="grid gap-5 sm:grid-cols-2">
          <Link
            to="/record"
            className="group rounded-2xl border border-border bg-card p-8 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Mic className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-medium">Start recording</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Capture the meeting and get a shareable link for live readers.
            </p>
          </Link>

          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Eye className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-medium">Join a session</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Have a session code? Paste it to follow along in real time.
            </p>
            <JoinForm />
          </div>
        </div>

        <p className="mt-12 text-center text-xs text-muted-foreground">
          Audio is processed in the speaker's browser. Only the transcript is shared.
        </p>
      </div>
    </div>
  );
}

function JoinForm() {
  return (
    <form
      className="mt-4 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const code = String(fd.get("code") || "").trim().toUpperCase();
        if (code) window.location.href = `/view/${encodeURIComponent(code)}`;
      }}
    >
      <input
        name="code"
        placeholder="SESSION CODE"
        className="flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm uppercase tracking-wider outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        maxLength={12}
      />
      <Button type="submit" size="sm">Join</Button>
    </form>
  );
}
