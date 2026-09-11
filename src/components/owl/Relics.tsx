import { useEffect, useState } from "react";
import { downloadHref, moonPhase, qrSrc, roostSigil, skyBrief } from "@/lib/owl/relics";
import { useOwlStore } from "@/lib/owl/store";

const TEN: Array<[string, string, string]> = [
  ["Drop nest", "open relics", "Drop a file onto the roost."],
  ["Sky ledger", "sky", "Moon phase, computed here."],
  ["Hourglass", "start hourglass", "25 minutes. The ring drains."],
  ["Tilt perch", "tilt perch", "The familiar leans with you."],
  ["Breath ring", "listen", "Iris pulses with your voice."],
  ["Cover eye", "cover my eye", "Cover the camera. OWL hushes."],
  ["Roost sigil", "roost sigil", "A mark minted from this nest."],
  ["Color talon", "what color is this", "HUD takes the scene's color."],
  ["Shake tease", "tease me", "Shake the device."],
  ["Idle walk", "open relics", "Go quiet. A miniature walks."],
];

export function RelicsPanel({
  onInvoke,
  onDropFile,
}: {
  onInvoke: (text: string) => void;
  onDropFile?: (file: File) => void;
}) {
  const memory = useOwlStore((s) => s.memory);
  const qrPayload = useOwlStore((s) => s.qrPayload);
  const focusUntil = useOwlStore((s) => s.focusUntil);
  const images = useOwlStore((s) => s.studioImages);
  const lastClip = useOwlStore((s) => s.lastClip);
  const moon = moonPhase();
  const sigil = roostSigil(`${memory.bossName}|${memory.city ?? ""}|${memory.favoriteSong}`);
  const [left, setLeft] = useState("");

  useEffect(() => {
    const tick = () => {
      if (!focusUntil) {
        setLeft("");
        return;
      }
      const ms = focusUntil - Date.now();
      if (ms <= 0) {
        setLeft("done");
        return;
      }
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setLeft(`${m}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [focusUntil]);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
      <p className="text-sm text-muted">
        Ten relics a chat box cannot do. They live in this HUD — tilt, sky, drop, shake — not in a transcript.
      </p>

      <div className="flex items-center gap-3 rounded-md border border-border bg-bg-subtle px-3 py-2">
        <svg viewBox="0 0 80 80" className="size-12 shrink-0" aria-hidden>
          <polygon
            points={sigil.points}
            fill="none"
            stroke="var(--color-iris)"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
        <div className="min-w-0">
          <p className="font-display text-lg text-fg">{memory.bossName}'s sigil</p>
          <p className="font-mono text-xs text-subtle">
            {skyBrief(memory.city)} · {moon.name}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {TEN.map(([label, cmd, blurb]) => (
          <button
            key={label}
            type="button"
            className="min-h-14 rounded-md border border-border px-3 py-2 text-left"
            onClick={() => onInvoke(cmd)}
          >
            <span className="block text-sm text-fg">{label}</span>
            <span className="mt-0.5 block text-xs text-muted">{blurb}</span>
          </button>
        ))}
      </div>

      {left && (
        <p className="font-display text-2xl tabular-nums text-iris">{left === "done" ? "Hourglass spent." : left}</p>
      )}

      <label className="block text-sm text-muted">
        QR spindle
        <form
          className="mt-1 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const v = String(fd.get("q") || "").trim();
            if (v) onInvoke(`qr for ${v}`);
          }}
        >
          <input
            name="q"
            placeholder="a link or a line"
            className="min-h-11 flex-1 rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none"
          />
          <button type="submit" className="min-h-11 rounded-md bg-accent px-3 text-sm text-accent-fg">
            Spin
          </button>
        </form>
      </label>
      {qrPayload && (
        <img src={qrSrc(qrPayload)} alt="" className="mx-auto size-40 rounded-md border border-border bg-bg" />
      )}

      <div
        className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f && onDropFile) onDropFile(f);
        }}
      >
        Drop nest — drop a file or still here.
        <input
          type="file"
          className="mt-2 block w-full text-xs"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f && onDropFile) onDropFile(f);
          }}
        />
      </div>

      {(images[0] || lastClip) && (
        <button
          type="button"
          className="min-h-11 rounded-md border border-border text-sm text-fg"
          onClick={() => {
            if (images[0]) downloadHref(images[0].url, "owl-still.jpg");
            else if (lastClip) downloadHref(lastClip, "owl-clip.mp4");
          }}
        >
          Polaroid — save last still
        </button>
      )}
      <p className="font-mono text-xs text-subtle">Also: clipboard, battery, dim gaze — say the words.</p>
    </div>
  );
}

export function RelicsSigil({ seed }: { seed: string }) {
  const sigil = roostSigil(seed);
  return (
    <svg viewBox="0 0 80 80" className="size-8" aria-hidden>
      <polygon points={sigil.points} fill="none" stroke="var(--color-iris)" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
