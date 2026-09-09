import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { OwlMood } from "@/lib/owl/types";

type Props = {
  mood: OwlMood;
  speaking: boolean;
  size?: "hero" | "dock";
};

export function OwlFace({ mood, speaking, size = "hero" }: Props) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      const clamp = mood === "sleep" ? 0 : mood === "think" ? 0.35 : 1;
      el.style.setProperty("--px", `${(x * 7 * clamp).toFixed(2)}px`);
      el.style.setProperty("--py", `${(y * 5 * clamp).toFixed(2)}px`);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [mood]);

  const asleep = mood === "sleep";
  const listen = mood === "listen";
  const think = mood === "think";
  const tease = mood === "tease";

  return (
    <div
      ref={root}
      className={cn(
        "relative mx-auto select-none",
        size === "hero" ? "w-[min(420px,86vw)]" : "w-16",
        size === "hero" && "owl-breathe",
      )}
      style={{ ["--px" as string]: "0px", ["--py" as string]: think ? "-3px" : "0px" }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 200 228" className="block h-auto w-full">
        <defs>
          <radialGradient id="owl-glow" cx="50%" cy="42%" r="55%">
            <stop offset="0%" stopColor="var(--color-iris)" stopOpacity="0.18" />
            <stop offset="70%" stopColor="var(--color-iris)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="owl-iris" cx="45%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#b7ece8" />
            <stop offset="45%" stopColor="var(--color-iris)" />
            <stop offset="100%" stopColor="#163532" />
          </radialGradient>
          <linearGradient id="owl-head" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1c222c" />
            <stop offset="100%" stopColor="#0c0e13" />
          </linearGradient>
        </defs>

        {size === "hero" && (
          <>
            <circle cx="100" cy="108" r="94" fill="url(#owl-glow)" />
            <circle
              className="owl-ring"
              cx="100"
              cy="108"
              r="96"
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="0.6"
              strokeDasharray="3 10"
            />
            <circle
              className="owl-ring-rev"
              cx="100"
              cy="108"
              r="88"
              fill="none"
              stroke="color-mix(in oklab, var(--color-iris) 35%, transparent)"
              strokeWidth="0.4"
              strokeDasharray="1 14"
            />
          </>
        )}

        <path d="M52 38 L64 18 L78 42" fill="url(#owl-head)" stroke="var(--color-border)" strokeWidth="1.2" />
        <path d="M148 38 L136 18 L122 42" fill="url(#owl-head)" stroke="var(--color-border)" strokeWidth="1.2" />

        <ellipse cx="100" cy="112" rx="62" ry="70" fill="url(#owl-head)" stroke="var(--color-border)" strokeWidth="1.2" />
        <path
          d="M62 78 C78 62 122 62 138 78"
          fill="none"
          stroke="color-mix(in oklab, var(--color-fg) 10%, transparent)"
          strokeWidth="1"
        />

        <Eye cx={72} cy={104} mood={mood} tease={tease} lidClass="owl-lid" />
        <Eye cx={128} cy={104} mood={mood} tease={false} lidClass="owl-lid owl-lid-right" />

        <path
          d="M100 118 L92 132 L100 138 L108 132 Z"
          fill={asleep ? "#2a2e36" : "var(--color-accent)"}
          opacity={asleep ? 0.5 : 0.92}
        />

        <path
          d="M78 154 L100 166 L122 154"
          fill="none"
          stroke="color-mix(in oklab, var(--color-fg) 14%, transparent)"
          strokeWidth="1.4"
        />
        <path
          d="M84 168 L100 178 L116 168"
          fill="none"
          stroke="color-mix(in oklab, var(--color-fg) 10%, transparent)"
          strokeWidth="1.2"
        />

        {speaking && (
          <g className="origin-center" transform="translate(100 196)">
            {[0, 1, 2, 3, 4].map((i) => (
              <rect
                key={i}
                className="owl-eq"
                x={-16 + i * 7}
                y={-8}
                width="3"
                height="12"
                rx="1"
                fill="var(--color-iris)"
                style={{ animationDelay: `${i * 0.09}s`, transformOrigin: "center bottom" }}
              />
            ))}
          </g>
        )}

        {listen && (
          <circle
            cx="100"
            cy="108"
            r="78"
            fill="none"
            stroke="var(--color-iris)"
            strokeWidth="0.6"
            className="owl-iris-pulse"
            opacity="0.5"
          />
        )}
      </svg>
    </div>
  );
}

function Eye({
  cx,
  cy,
  mood,
  tease,
  lidClass,
}: {
  cx: number;
  cy: number;
  mood: OwlMood;
  tease: boolean;
  lidClass: string;
}) {
  const asleep = mood === "sleep";
  const irisR = mood === "listen" ? 16.5 : 15;
  const pupilR = mood === "focus" ? 6.2 : 7.4;

  return (
    <g transform={`translate(${cx} ${cy})`}>
      <circle r="24" fill="#0a0c10" stroke="var(--color-border)" strokeWidth="1.2" />
      <circle r="20" fill="#d9dde6" />
      {!asleep && (
        <g style={{ transform: `translate(var(--px, 0px), var(--py, 0px))` }}>
          <circle r={irisR} fill="url(#owl-iris)" />
          <circle r={irisR + 1} fill="none" stroke="color-mix(in oklab, var(--color-iris) 40%, transparent)" strokeWidth="0.6" />
          <circle r={pupilR} fill="#070809" />
          <circle cx="-3.5" cy="-4" r="2.1" fill="#f4f7f8" />
        </g>
      )}
      {asleep && <path d="M-16 2 Q0 10 16 2" fill="none" stroke="#1a1e26" strokeWidth="3" strokeLinecap="round" />}
      {tease && !asleep && (
        <path d="M-20 -4 Q0 -16 20 -4 L20 -24 L-20 -24 Z" fill="#0c0e13" />
      )}
      {!asleep && (
        <g className={lidClass}>
          <circle r="24" fill="#0c0e13" />
        </g>
      )}
    </g>
  );
}
