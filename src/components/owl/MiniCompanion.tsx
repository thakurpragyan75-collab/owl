import { OwlFace } from "./OwlFace";
import { cn } from "@/lib/utils";

type Props = {
  clones: number;
  onWake: () => void;
  roaming: boolean;
};

export function MiniCompanion({ clones, onWake, roaming }: Props) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex items-end gap-3 px-3">
      {Array.from({ length: clones }).map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={onWake}
          className={cn(
            "pointer-events-auto w-[4.5rem] origin-bottom drop-shadow-lg",
            roaming && i === 0 && "owl-roam owl-hop",
            roaming && i === 1 && "owl-hop",
          )}
          style={i > 0 && roaming ? { translate: `${12 + i * 18}vw 0` } : undefined}
          aria-label="Wake OWL"
        >
          <OwlFace mood={roaming ? "sleep" : "idle"} speaking={false} size="dock" />
        </button>
      ))}
    </div>
  );
}
