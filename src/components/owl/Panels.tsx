import { useEffect, useRef, useState } from "react";
import { OWL_FEATURES, FEATURE_GROUPS } from "@/lib/owl/features";
import { attachVideo, detachVideo, ensureSenses } from "@/lib/owl/senses";
import { frameSrc, previewShot } from "@/lib/owl/sites";
import { parseNestPayload, useOwlStore } from "@/lib/owl/store";
import { RelicsPanel } from "./Relics";
import { cn } from "@/lib/utils";
import { PORTRAIT_STYLES, stillToDataUrl, type StyleId } from "@/lib/owl/portrait";
import { downloadSeed } from "@/lib/owl/seed";
import { Bluetooth, Music2, Smartphone, Laptop, Watch, Tablet, Pencil, Trash2, Download, Upload, Check } from "lucide-react";
import { owlPrint } from "@/lib/owl/ai";
import type { PrintReport } from "@/lib/owl/print";
import type { DeviceKind } from "@/lib/owl/types";

const KIND_ICON = {
  phone: Smartphone,
  tablet: Tablet,
  laptop: Laptop,
  watch: Watch,
} as const;

export function PanelBody({
  onInvoke,
  onImagine,
  onClip,
  onSee,
  onMint,
  onMintSeed,
  onForgeMe,
  onRestyle,
  onCode,
  onSite,
  onShare,
  onDropFile,
}: {
  onInvoke: (text: string) => void;
  onImagine: (prompt: string) => void;
  onClip: (prompt: string) => void;
  onSee: () => void;
  onMint: () => void;
  onMintSeed: () => void;
  onForgeMe: (prompt: string) => void;
  onRestyle: (style: StyleId) => void;
  onCode: (prompt: string) => void;
  onSite: (prompt: string) => void;
  onShare: (deviceId?: string) => void;
  onDropFile?: (file: File) => void;
}) {
  const panel = useOwlStore((s) => s.panel);
  if (panel === "mesh") return <PrintPanel />;
  if (panel === "studio")
    return <StudioPanel onImagine={onImagine} onClip={onClip} onRestyle={onRestyle} onMintSeed={onMintSeed} onForgeMe={onForgeMe} />;
  if (panel === "vision") return <VisionPanel onSee={onSee} onMint={onMint} onMintSeed={onMintSeed} />;
  if (panel === "codex") return <CodexPanel onInvoke={onInvoke} />;
  if (panel === "inbox") return <InboxPanel onInvoke={onInvoke} />;
  if (panel === "memory") return <MemoryPanel />;
  if (panel === "code") return <CodePanel onCode={onCode} />;
  if (panel === "site") return <SitePanel onSite={onSite} />;
  if (panel === "call") return <CallPanel />;
  if (panel === "browse") return <BrowsePanel />;
  if (panel === "relics") return <RelicsPanel onInvoke={onInvoke} onDropFile={onDropFile} />;
  return null;
}

function PrintPanel() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [report, setReport] = useState<PrintReport | null>(null);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
      <p className="text-sm text-muted">
        Print reads <strong className="font-medium text-fg">public</strong> traces of an email or handle you own —
        Gravatar, open-web mentions, and a door to Have I Been Pwned. Not a private dossier. Not someone else's phone.
      </p>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={async (e) => {
          e.preventDefault();
          const query = q.trim();
          if (!query) return;
          setBusy(true);
          setErr("");
          try {
            const res = await owlPrint({ data: { query } });
            if (!res.ok) setErr(res.error);
            else setReport(res.report);
          } catch {
            setErr("Print missed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="you@mail.com or @yourhandle"
          className="min-h-11 flex-1 rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none placeholder:text-subtle focus:ring-1 focus:ring-accent"
        />
        <button type="submit" disabled={busy} className="min-h-11 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50">
          {busy ? "Reading…" : "Print"}
        </button>
      </form>
      {err && <p className="text-sm text-warn">{err}</p>}
      {report && (
        <div className="flex flex-col gap-3">
          {report.gravatar && (
            <div className="flex items-center gap-3 rounded-md border border-border bg-bg-subtle px-3 py-2">
              {report.gravatar.thumbnail && (
                <img src={report.gravatar.thumbnail} alt="" className="size-12 rounded-sm bg-bg object-cover" />
              )}
              <div className="min-w-0">
                <p className="text-sm text-fg">{report.gravatar.hasProfile ? report.gravatar.displayName || "Gravatar profile" : "No Gravatar profile"}</p>
                <p className="font-mono text-[11px] text-muted">{report.gravatar.hash.slice(0, 16)}…</p>
              </div>
            </div>
          )}
          <ul className="flex flex-col gap-2">
            {report.hits.map((h) => (
              <li key={h.url} className="rounded-md border border-border px-3 py-2">
                <a href={h.url} target="_blank" rel="noreferrer" className="text-sm text-iris underline-offset-2 hover:underline">
                  {h.title}
                </a>
                {h.blurb && <p className="mt-1 text-xs text-muted">{h.blurb}</p>}
              </li>
            ))}
          </ul>
          <div className="rounded-md border border-border bg-bg-subtle px-3 py-2">
            <p className="text-sm font-medium text-fg">Lock this down</p>
            <ul className="mt-1 list-disc pl-4 text-xs text-muted">
              {report.lockDown.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function MeshPanel({ onShare }: { onShare: (deviceId?: string) => void }) {
  const devices = useOwlStore((s) => s.devices);
  const addDevice = useOwlStore((s) => s.addDevice);
  const markBluetooth = useOwlStore((s) => s.markBluetooth);
  const receiveImage = useOwlStore((s) => s.receiveImage);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<DeviceKind>("phone");
  const [btNote, setBtNote] = useState("");

  return (
    <div className="flex h-full flex-col gap-4">
      <p className="text-sm text-muted">
        Paired roost. Play across devices, or send a still over share / Bluetooth.
      </p>
      <ul className="flex flex-col gap-2">
        {devices.map((d) => {
          const Icon = KIND_ICON[d.kind];
          return (
            <li
              key={d.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-bg-subtle px-3 py-3"
            >
              <Icon className="size-4 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{d.name}</p>
                <p className="font-mono text-xs tabular-nums text-subtle">
                  {d.bluetooth ? "bluetooth" : "paired"}
                  {d.playing ? " · playing" : ""}
                </p>
              </div>
              {d.playing && <Music2 className="size-4 text-iris" />}
              {d.lastImage && (
                <img src={d.lastImage} alt="" className="size-8 rounded-sm object-cover" />
              )}
              <button
                type="button"
                className="min-h-11 rounded-md px-2 text-xs text-muted hover:text-fg"
                onClick={() => onShare(d.id)}
              >
                Send still
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="min-h-11 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg active:scale-[0.96]"
          onClick={() => onShare()}
        >
          Share still
        </button>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 text-sm text-fg active:scale-[0.96]"
          onClick={async () => {
            const nav = navigator as Navigator & {
              bluetooth?: { requestDevice: (opts: { acceptAllDevices: boolean }) => Promise<{ id: string; name?: string }> };
            };
            if (!nav.bluetooth) {
              setBtNote("This nest has no Bluetooth radio. Share still uses the system sheet instead.");
              onShare();
              return;
            }
            try {
              const dev = await nav.bluetooth.requestDevice({ acceptAllDevices: true });
              const id = devices[0]?.id ?? "primary";
              markBluetooth(id);
              setBtNote(`Linked ${dev.name || "a nearby radio"}. Sending the still.`);
              onShare(id);
            } catch {
              setBtNote("Bluetooth pairing cancelled.");
            }
          }}
        >
          <Bluetooth className="size-4" />
          Bluetooth
        </button>
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-border px-4 text-sm text-fg">
          Receive still
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const url = URL.createObjectURL(file);
              const id = devices[0]?.id ?? "primary";
              receiveImage(id, url);
              setBtNote(`Still landed on ${devices[0]?.name ?? "Primary"}.`);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {btNote && <p className="text-xs text-muted">{btNote}</p>}
      <form
        className="mt-auto flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim();
          if (!n) return;
          addDevice({
            id: crypto.randomUUID(),
            name: n,
            kind,
            playing: false,
            lastPing: new Date().toISOString(),
          });
          setName("");
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Pair a device name"
          className="min-h-11 flex-1 rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none placeholder:text-subtle focus:ring-1 focus:ring-accent"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as DeviceKind)}
          className="min-h-11 rounded-md border border-border bg-bg px-3 text-sm text-fg"
        >
          <option value="phone">phone</option>
          <option value="tablet">tablet</option>
          <option value="laptop">laptop</option>
          <option value="watch">watch</option>
        </select>
        <button type="submit" className="min-h-11 rounded-md bg-bg-subtle px-4 text-sm text-fg">
          Pair
        </button>
      </form>
    </div>
  );
}

function StudioPanel({
  onImagine,
  onClip,
  onRestyle,
  onMintSeed,
  onForgeMe,
}: {
  onImagine: (prompt: string) => void;
  onClip: (prompt: string) => void;
  onRestyle: (style: StyleId) => void;
  onMintSeed: () => void;
  onForgeMe: (prompt: string) => void;
}) {
  const images = useOwlStore((s) => s.studioImages);
  const lastClip = useOwlStore((s) => s.lastClip);
  const lastSeed = useOwlStore((s) => s.lastSeed);
  const addImage = useOwlStore((s) => s.addImage);
  const [prompt, setPrompt] = useState("a geometric owl of moonlight and teal glass, night HUD");
  const [busy, setBusy] = useState<"still" | "clip" | "style" | "seed" | "me" | null>(null);

  return (
    <div className="flex h-full flex-col gap-4">
      <p className="text-sm text-muted">
        Forge stills, weave clips, restyle a photo, or mint a 512-d face seed.
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        className="resize-none rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:ring-1 focus:ring-accent"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!busy}
          className="min-h-11 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50"
          onClick={async () => {
            setBusy("still");
            await onImagine(prompt);
            setBusy(null);
          }}
        >
          {busy === "still" ? "Forging…" : "Forge still"}
        </button>
        <button
          type="button"
          disabled={!!busy}
          className="min-h-11 rounded-md border border-border px-4 text-sm text-fg disabled:opacity-50"
          onClick={async () => {
            setBusy("clip");
            await onClip(prompt);
            setBusy(null);
          }}
        >
          {busy === "clip" ? "Weaving…" : "Weave clip"}
        </button>
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-border px-4 text-sm text-fg">
          Upload photo
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const url = await stillToDataUrl(file, 768);
              addImage({ id: crypto.randomUUID(), url, prompt: file.name, at: Date.now() });
            }}
          />
        </label>
        <button
          type="button"
          disabled={!!busy}
          className="min-h-11 rounded-md border border-border px-4 text-sm text-fg disabled:opacity-50"
          onClick={async () => {
            setBusy("seed");
            await onMintSeed();
            setBusy(null);
          }}
        >
          {busy === "seed" ? "Extracting…" : "Mint seed"}
        </button>
        <button
          type="button"
          disabled={!!busy || !lastSeed?.crop}
          className="min-h-11 rounded-md border border-iris/40 px-4 text-sm text-fg disabled:opacity-50"
          onClick={async () => {
            setBusy("me");
            await onForgeMe(prompt);
            setBusy(null);
          }}
        >
          {busy === "me" ? "As me…" : "As me"}
        </button>
      </div>
      {lastSeed && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-subtle px-3 py-2">
          {lastSeed.crop && <img src={lastSeed.crop} alt="" className="size-10 rounded-sm object-cover" />}
          <p className="min-w-0 flex-1 font-mono text-[11px] text-muted">
            OWL-SEED/1 · 512-d · {lastSeed.vector.slice(0, 4).map((n) => n.toFixed(3)).join(" ")}…
          </p>
          <button type="button" className="text-xs text-iris" onClick={() => downloadSeed(lastSeed, "json")}>
            json
          </button>
          <button type="button" className="text-xs text-iris" onClick={() => downloadSeed(lastSeed, "npy")}>
            npy
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {PORTRAIT_STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={!!busy || !images[0]}
            className="min-h-9 rounded-full border border-border px-3 text-xs text-fg disabled:opacity-40"
            onClick={async () => {
              setBusy("style");
              await onRestyle(s.id);
              setBusy(null);
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      {lastClip && (
        <video
          src={lastClip}
          controls
          autoPlay
          playsInline
          data-owl-clip
          className="aspect-video w-full rounded-md border border-border bg-bg"
        />
      )}
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto">
        {images.map((img) => (
          <figure key={img.id} className="overflow-hidden rounded-md border border-border">
            <img src={img.url} alt={img.prompt} referrerPolicy="no-referrer" className="aspect-square w-full bg-bg object-contain" />
            <figcaption className="truncate px-2 py-1 font-mono text-xs text-subtle">{img.prompt}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

function VisionPanel({ onSee, onMint, onMintSeed }: { onSee: () => void; onMint: () => void; onMintSeed: () => void }) {
  const camera = useOwlStore((s) => s.permissions.camera);
  const lastFace = useOwlStore((s) => s.lastFaceCode);
  return (
    <div className="flex h-full flex-col gap-4">
      <p className="text-sm text-muted">
        Living Gaze. Observe the frame, or mint a face sheet you can copy into OWL or any other image AI.
      </p>
      <VisionPreview />
      {!camera && (
        <p className="text-xs text-warn">Allow the camera when the nest asks. Then tap observe.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSee}
          className="min-h-11 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg"
        >
          Observe this frame
        </button>
        <button
          type="button"
          onClick={onMint}
          className="min-h-11 rounded-md border border-border px-4 text-sm text-fg"
        >
          Mint face sheet
        </button>
        <button
          type="button"
          onClick={onMintSeed}
          className="min-h-11 rounded-md border border-border px-4 text-sm text-fg"
        >
          Mint seed
        </button>
      </div>
      {lastFace && (
        <pre className="max-h-40 overflow-auto rounded-md border border-border bg-bg p-2 font-mono text-[11px] leading-relaxed text-muted">
          {lastFace}
        </pre>
      )}
    </div>
  );
}

export function VisionPreview() {
  const el = useRef<HTMLVideoElement>(null);
  const setPermission = useOwlStore((s) => s.setPermission);

  useEffect(() => {
    let gone = false;
    void (async () => {
      const s = await ensureSenses();
      if (gone) return;
      setPermission("camera", s.camera);
      setPermission("mic", s.mic);
      attachVideo(el.current);
    })();
    const id = window.setInterval(() => attachVideo(el.current), 1500);
    return () => {
      gone = true;
      window.clearInterval(id);
      detachVideo(el.current);
    };
  }, [setPermission]);

  return (
    <video
      ref={el}
      className="aspect-video w-full rounded-lg border border-border bg-bg object-cover"
      playsInline
      muted
      autoPlay
    />
  );
}

function BrowsePanel() {
  const url = useOwlStore((s) => s.browseUrl);
  const playing = useOwlStore((s) => s.nowPlaying);
  const src = playing?.embed || (url ? frameSrc(url) : null);
  const shot = !src && url ? previewShot(url) : null;
  const href = playing?.watchUrl || playing?.musicUrl || url;
  const [shotBroke, setShotBroke] = useState(false);
  useEffect(() => {
    setShotBroke(false);
  }, [url, playing?.embed]);
  if (!url && !playing) {
    return <p className="text-sm text-muted">Nothing open. Say “open instagram” or “play believer”.</p>;
  }
  const label = playing ? playing.title : (() => {
    try {
      return url ? new URL(url).hostname.replace(/^www\./, "") : "site";
    } catch {
      return url ?? "site";
    }
  })();
  return (
    <div className="flex h-full min-h-[280px] flex-col gap-2">
      <p className="truncate font-mono text-xs text-subtle">{playing ? playing.title : url}</p>
      {src ? (
        <iframe
          title={playing ? playing.title : "Opened site"}
          src={src}
          className="min-h-[240px] w-full flex-1 rounded-md border border-border bg-bg"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="origin"
        />
      ) : shot && !shotBroke ? (
        <a href={href ?? url ?? "#"} target="_blank" rel="noopener noreferrer" className="block min-h-[240px] flex-1 overflow-hidden rounded-md border border-border">
          <img src={shot} alt="" className="h-full w-full object-cover object-top" onError={() => setShotBroke(true)} />
        </a>
      ) : (
        <div className="flex min-h-[240px] flex-1 flex-col items-start justify-center gap-3 rounded-md border border-border bg-bg-subtle p-5">
          <p className="font-display text-2xl text-fg capitalize">{label}</p>
          <p className="text-sm text-muted">This site will not sit inside the roost. Open it beside OWL.</p>
        </div>
      )}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-accent px-4 text-base font-medium text-accent-fg"
        >
          {playing ? "Open on YouTube" : `Open ${label}`}
        </a>
      )}
    </div>
  );
}

function CodexPanel({ onInvoke }: { onInvoke: (text: string) => void }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  return (
    <div className="flex h-full flex-col gap-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search abilities"
        className="min-h-11 rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none placeholder:text-subtle focus:ring-1 focus:ring-accent"
      />
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
        {FEATURE_GROUPS.map((g) => {
          const items = OWL_FEATURES.filter(
            (f) => f.group === g && (!query || f.name.toLowerCase().includes(query) || f.blurb.toLowerCase().includes(query)),
          );
          if (!items.length) return null;
          return (
            <section key={g}>
              <h3 className="mb-2 font-mono text-xs tracking-[0.18em] text-subtle uppercase">{g}</h3>
              <ul className="flex flex-col gap-1.5">
                {items.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => onInvoke(f.invoke)}
                      className="w-full rounded-md border border-border bg-bg-subtle px-3 py-2.5 text-left transition-colors hover:border-accent/40"
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-fg">{f.name}</span>
                        <span className="font-mono text-[0.65rem] tracking-wider text-subtle uppercase">{f.kind}</span>
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted">{f.blurb}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function InboxPanel({ onInvoke }: { onInvoke: (text: string) => void }) {
  const [paste, setPaste] = useState("");
  return (
    <div className="flex h-full flex-col gap-3">
      <p className="text-sm text-muted">
        Paste a message, caption, or reel description. OWL reads what you bring here and drafts a reply in your voice.
      </p>
      <textarea
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
        rows={8}
        placeholder="Paste the thread or describe the reel…"
        className="min-h-0 flex-1 resize-none rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg outline-none placeholder:text-subtle focus:ring-1 focus:ring-accent"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!paste.trim()}
          className="min-h-11 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50"
          onClick={() => onInvoke(`Read this and tell me what it actually is:\n\n${paste}`)}
        >
          Read it
        </button>
        <button
          type="button"
          disabled={!paste.trim()}
          className="min-h-11 rounded-md border border-border px-4 text-sm text-fg disabled:opacity-50"
          onClick={() => onInvoke(`Draft a reply in my voice, human, short:\n\n${paste}`)}
        >
          Reply like me
        </button>
      </div>
    </div>
  );
}

function MemoryPanel() {
  const memory = useOwlStore((s) => s.memory);
  const setMemory = useOwlStore((s) => s.setMemory);
  const addPerson = useOwlStore((s) => s.addPerson);
  const updatePerson = useOwlStore((s) => s.updatePerson);
  const removePerson = useOwlStore((s) => s.removePerson);
  const addNote = useOwlStore((s) => s.addNote);
  const updateNote = useOwlStore((s) => s.updateNote);
  const removeNote = useOwlStore((s) => s.removeNote);
  const importMemory = useOwlStore((s) => s.importMemory);

  const [boss, setBoss] = useState(memory.bossName);
  const [city, setCity] = useState(memory.city ?? "");
  const [song, setSong] = useState(memory.favoriteSong);
  const [note, setNote] = useState("");
  const [editNote, setEditNote] = useState<{ index: number; text: string } | null>(null);
  const [pname, setPname] = useState("");
  const [prel, setPrel] = useState("friend");
  const [pphone, setPphone] = useState("");
  const [editPerson, setEditPerson] = useState<string | null>(null);
  const [epName, setEpName] = useState("");
  const [epRel, setEpRel] = useState("");
  const [epNotes, setEpNotes] = useState("");
  const [epPhone, setEpPhone] = useState("");
  const [importNote, setImportNote] = useState("");

  useEffect(() => {
    setBoss(memory.bossName);
    setCity(memory.city ?? "");
    setSong(memory.favoriteSong);
  }, [memory.bossName, memory.city, memory.favoriteSong]);

  const saveField = (patch: Parameters<typeof setMemory>[0]) => {
    setMemory(patch);
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      <p className="text-sm text-muted">
        Nest is yours. Change anything here — name, city, song, notes, people. It stays on this device.
      </p>

      <label className="block text-sm text-muted">
        What OWL calls you
        <input
          value={boss}
          onChange={(e) => setBoss(e.target.value)}
          onBlur={() => {
            const v = boss.trim();
            if (v && v !== memory.bossName) saveField({ bossName: v });
            else setBoss(memory.bossName);
          }}
          className="mt-1 min-h-11 w-full rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none focus:ring-1 focus:ring-accent"
        />
      </label>

      <label className="block text-sm text-muted">
        City
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          onBlur={() => saveField({ city: city.trim() || undefined })}
          placeholder="Where you roost"
          className="mt-1 min-h-11 w-full rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none placeholder:text-subtle focus:ring-1 focus:ring-accent"
        />
      </label>

      <label className="block text-sm text-muted">
        Favorite song
        <input
          value={song}
          onChange={(e) => setSong(e.target.value)}
          onBlur={() => {
            const v = song.trim();
            if (v) saveField({ favoriteSong: v });
            else setSong(memory.favoriteSong);
          }}
          placeholder="Play this when you say play my song"
          className="mt-1 min-h-11 w-full rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none placeholder:text-subtle focus:ring-1 focus:ring-accent"
        />
      </label>

      <div>
        <p className="mb-2 text-sm text-muted">Voice</p>
        <div className="flex gap-2">
          {(["precise", "partner", "tease"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => saveField({ personality: p })}
              className={cn(
                "min-h-11 flex-1 rounded-md text-sm capitalize",
                memory.personality === p ? "bg-accent text-accent-fg" : "border border-border text-muted",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!note.trim()) return;
          addNote(note.trim());
          setNote("");
        }}
      >
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Remember this"
          className="min-h-11 flex-1 rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none placeholder:text-subtle focus:ring-1 focus:ring-accent"
        />
        <button type="submit" className="min-h-11 rounded-md bg-bg-subtle px-4 text-sm text-fg">
          Keep
        </button>
      </form>

      <ul className="space-y-1.5">
        {memory.notes
          .map((n, index) => ({ n, index }))
          .reverse()
          .map(({ n, index }) => (
            <li key={`${index}-${n.slice(0, 12)}`} className="rounded-md border border-border bg-bg-subtle px-3 py-2">
              {editNote?.index === index ? (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = editNote.text.trim();
                    if (v) updateNote(index, v);
                    setEditNote(null);
                  }}
                >
                  <input
                    value={editNote.text}
                    onChange={(e) => setEditNote({ index, text: e.target.value })}
                    className="min-h-11 flex-1 rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none"
                    autoFocus
                  />
                  <button type="submit" className="grid size-11 place-items-center text-iris" aria-label="Save note">
                    <Check className="size-4" />
                  </button>
                </form>
              ) : (
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 text-sm text-fg">{n}</p>
                  <button
                    type="button"
                    className="grid size-11 shrink-0 place-items-center text-muted hover:text-fg"
                    aria-label="Edit note"
                    onClick={() => setEditNote({ index, text: n })}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="grid size-11 shrink-0 place-items-center text-muted hover:text-danger"
                    aria-label="Delete note"
                    onClick={() => removeNote(index)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}
            </li>
          ))}
      </ul>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!pname.trim()) return;
          addPerson({
            id: crypto.randomUUID(),
            name: pname.trim(),
            relation: prel.trim() || "friend",
            notes: "",
            phone: pphone.trim() || undefined,
            lastSeen: "rostered in this nest",
          });
          setPname("");
          setPrel("friend");
          setPphone("");
        }}
      >
        <input
          value={pname}
          onChange={(e) => setPname(e.target.value)}
          placeholder="Person’s name"
          className="min-h-11 flex-1 rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none placeholder:text-subtle"
        />
        <input
          value={prel}
          onChange={(e) => setPrel(e.target.value)}
          placeholder="relation"
          className="min-h-11 w-32 rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none placeholder:text-subtle"
        />
        <input
          value={pphone}
          onChange={(e) => setPphone(e.target.value)}
          placeholder="WhatsApp number"
          inputMode="tel"
          className="min-h-11 w-40 rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none placeholder:text-subtle"
        />
        <button type="submit" className="min-h-11 rounded-md bg-bg-subtle px-4 text-sm text-fg">
          Ledger
        </button>
      </form>

      <ul className="space-y-1.5">
        {memory.people.map((p) => (
          <li key={p.id} className="rounded-md border border-border px-3 py-2">
            {editPerson === p.id ? (
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!epName.trim()) return;
                  updatePerson(p.id, {
                    name: epName.trim(),
                    relation: epRel.trim() || "friend",
                    notes: epNotes.trim(),
                    phone: epPhone.trim() || undefined,
                  });
                  setEditPerson(null);
                }}
              >
                <input
                  value={epName}
                  onChange={(e) => setEpName(e.target.value)}
                  className="min-h-11 rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none"
                />
                <input
                  value={epRel}
                  onChange={(e) => setEpRel(e.target.value)}
                  className="min-h-11 rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none"
                />
                <input
                  value={epPhone}
                  onChange={(e) => setEpPhone(e.target.value)}
                  placeholder="WhatsApp number"
                  inputMode="tel"
                  className="min-h-11 rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none placeholder:text-subtle"
                />
                <input
                  value={epNotes}
                  onChange={(e) => setEpNotes(e.target.value)}
                  placeholder="Notes about them"
                  className="min-h-11 rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none placeholder:text-subtle"
                />
                <div className="flex gap-2">
                  <button type="submit" className="min-h-11 flex-1 rounded-md bg-accent text-sm text-accent-fg">
                    Save
                  </button>
                  <button
                    type="button"
                    className="min-h-11 rounded-md border border-border px-4 text-sm text-muted"
                    onClick={() => setEditPerson(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg">{p.name}</p>
                  <p className="font-mono text-xs text-muted">
                    {p.relation}
                    {p.phone ? ` · ${p.phone}` : ""}
                    {p.notes ? ` · ${p.notes}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="grid size-11 shrink-0 place-items-center text-muted hover:text-fg"
                  aria-label={`Edit ${p.name}`}
                  onClick={() => {
                    setEditPerson(p.id);
                    setEpName(p.name);
                    setEpRel(p.relation);
                    setEpNotes(p.notes);
                    setEpPhone(p.phone ?? "");
                  }}
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="grid size-11 shrink-0 place-items-center text-muted hover:text-danger"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => removePerson(p.id)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-wrap gap-2 pt-2">
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 text-sm text-fg"
          onClick={() => {
            const blob = new Blob([JSON.stringify({ memory }, null, 2)], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "owl-nest.json";
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          <Download className="size-4" />
          Export
        </button>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-4 text-sm text-fg">
          <Upload className="size-4" />
          Import
          <input
            type="file"
            accept="application/json"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                const raw = JSON.parse(await file.text()) as unknown;
                const next = parseNestPayload(raw);
                if (!next) {
                  setImportNote("That file is not a nest.");
                  return;
                }
                importMemory(next);
                setImportNote("Nest updated.");
              } catch {
                setImportNote("Could not read that file.");
              }
            }}
          />
        </label>
      </div>
      {importNote && <p className="text-xs text-muted">{importNote}</p>}
    </div>
  );
}

function CodePanel({ onCode }: { onCode: (prompt: string) => void }) {
  const last = useOwlStore((s) => s.lastCode);
  const [prompt, setPrompt] = useState("a javascript function that fuzzy-matches commands");
  const [out, setOut] = useState("");

  return (
    <div className="flex h-full flex-col gap-3">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        className="resize-none rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg outline-none"
      />
      <div className="flex gap-2">
        <button
          type="button"
          className="min-h-11 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg"
          onClick={() => onCode(prompt)}
        >
          Write
        </button>
        {last?.language === "javascript" && (
          <button
            type="button"
            className="min-h-11 rounded-md border border-border px-4 text-sm"
            onClick={() => {
              try {
                const fn = new Function(`${last.source}\n; return typeof main === 'function' ? main() : 'loaded';`);
                setOut(String(fn()));
              } catch (err) {
                setOut(err instanceof Error ? err.message : "run failed");
              }
            }}
          >
            Run JS
          </button>
        )}
      </div>
      {last && (
        <pre className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-bg p-3 font-mono text-xs leading-relaxed text-fg">
          {last.source}
        </pre>
      )}
      {out && <p className="font-mono text-xs text-iris">{out}</p>}
    </div>
  );
}

function SitePanel({ onSite }: { onSite: (prompt: string) => void }) {
  const html = useOwlStore((s) => s.lastSite);
  const [prompt, setPrompt] = useState("a one-page night roost for an owl named OWL");
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex gap-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="min-h-11 flex-1 rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none"
        />
        <button
          type="button"
          className="min-h-11 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg"
          onClick={() => onSite(prompt)}
        >
          Spin
        </button>
      </div>
      {html ? (
        <iframe title="Spun site" className="min-h-0 flex-1 w-full rounded-md border border-border bg-white" srcDoc={html} />
      ) : (
        <p className="text-sm text-muted">Ask for a site. OWL returns a full page you can preview here.</p>
      )}
    </div>
  );
}

function CallPanel() {
  const target = useOwlStore((s) => s.callTarget);
  const wire = useOwlStore((s) => s.whatsapp);
  const setCall = useOwlStore((s) => s.setCall);
  const setWhatsapp = useOwlStore((s) => s.setWhatsapp);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <p className="font-mono text-xs tracking-[0.2em] text-subtle uppercase">{wire ? "WhatsApp" : "Phantom line"}</p>
      <p className="font-display text-4xl text-fg">{target ?? "—"}</p>
      {wire?.text && <p className="text-sm text-muted">“{wire.text}”</p>}
      {wire?.href && (
        <a
          href={wire.href}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-11 rounded-md bg-accent px-6 text-sm font-medium leading-[2.75rem] text-accent-fg"
        >
          Open WhatsApp
        </a>
      )}
      <button
        type="button"
        className="min-h-11 rounded-full bg-danger px-8 text-sm font-medium text-fg"
        onClick={() => {
          setCall(null);
          setWhatsapp(null);
        }}
      >
        End
      </button>
    </div>
  );
}

