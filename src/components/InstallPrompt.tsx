import { useEffect, useState } from "react";
import { Download, Share, Plus, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios" | "android-chrome" | "desktop" | "other";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
  if (isIOS) return "ios";
  if (/Android/.test(ua)) return "android-chrome";
  return "desktop";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallPrompt() {
  const [platform, setPlatform] = useState<Platform>("other");
  const [installed, setInstalled] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(isStandalone());
    setDismissed(localStorage.getItem("scribe-install-dismissed") === "1");

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => setInstalled(true);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  if (installed || dismissed) return null;

  const handleClick = async () => {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setDeferred(null);
      return;
    }
    setOpen(true);
  };

  const handleDismiss = () => {
    localStorage.setItem("scribe-install-dismissed", "1");
    setDismissed(true);
  };

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">Install Meeting Scribe</p>
            <p className="text-xs text-muted-foreground">
              {platform === "ios"
                ? "Add to your iPhone home screen for one-tap access."
                : "Install for a quicker, app-like experience."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" onClick={handleClick}>
            <Download className="h-4 w-4" />
            <span className="ml-2 hidden sm:inline">Install</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDismiss} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {platform === "ios" ? "Add to iPhone Home Screen" : "Install Meeting Scribe"}
            </DialogTitle>
            <DialogDescription>
              {platform === "ios"
                ? "iOS installs are done from Safari's Share menu — just two taps."
                : "Open this page in Chrome or Edge and use the install option in the address bar or menu."}
            </DialogDescription>
          </DialogHeader>

          {platform === "ios" ? (
            <ol className="space-y-4 text-sm">
              <li className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  1
                </span>
                <p>
                  Make sure you're using <strong>Safari</strong> (not Chrome or in-app browsers).
                  If you're in another app, tap the <strong>•••</strong> menu and choose
                  "Open in Safari".
                </p>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  2
                </span>
                <p className="flex items-center gap-1.5 flex-wrap">
                  Tap the <Share className="inline h-4 w-4" /> <strong>Share</strong> button
                  at the bottom of Safari.
                </p>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  3
                </span>
                <p className="flex items-center gap-1.5 flex-wrap">
                  Scroll down and tap <Plus className="inline h-4 w-4" />{" "}
                  <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
                </p>
              </li>
            </ol>
          ) : (
            <ol className="space-y-4 text-sm">
              <li className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  1
                </span>
                <p>
                  Tap the browser menu (<strong>⋮</strong> in Chrome, <strong>•••</strong> in Edge).
                </p>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  2
                </span>
                <p>
                  Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                </p>
              </li>
            </ol>
          )}

          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Heads up: live recording uses the Web Speech API, which works on desktop Chrome/Edge
            and Android. iPhone install is great for <strong>joining sessions as a reader</strong>.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
