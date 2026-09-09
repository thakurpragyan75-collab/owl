import { OwlFace } from "./OwlFace";

type Props = {
  onAwaken: () => void;
  onOpenEar: () => void;
  listening: boolean;
  earError: string | null;
};

export function BootSequence({ onAwaken, onOpenEar, listening, earError }: Props) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-bg px-6 pb-24 text-fg">
      <div className="owl-grain" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,color-mix(in_oklab,var(--color-iris)_12%,transparent),transparent_58%)]" />

      <div className="owl-enter relative flex w-full max-w-lg flex-col items-center text-center">
        <OwlFace mood={listening ? "listen" : "idle"} speaking={false} />
        <p className="mt-2 font-mono text-xs tracking-[0.28em] text-muted uppercase">
          {listening ? "Ear open" : "First light"}
        </p>
        <h1 className="mt-3 font-display text-6xl tracking-[-0.04em] text-fg sm:text-7xl">OWL</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
          Wake word is <span className="text-fg">hey owl</span>. Tap once to open the ear and camera, then speak.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onOpenEar}
            className="min-h-11 rounded-full bg-accent px-8 text-sm font-medium text-accent-fg transition-transform duration-150 ease-out hover:opacity-90 active:scale-[0.96]"
          >
            {listening ? "Listening for hey owl" : "Open the ear"}
          </button>
          <button
            type="button"
            onClick={onAwaken}
            className="min-h-11 rounded-full border border-border px-6 text-sm text-fg transition-transform duration-150 ease-out active:scale-[0.96]"
          >
            Enter roost
          </button>
        </div>
        <p className="mt-4 font-mono text-xs text-subtle">
          {earError ?? "Mic stays on after you grant it. Camera stays live in Gaze."}
        </p>
      </div>
    </div>
  );
}
