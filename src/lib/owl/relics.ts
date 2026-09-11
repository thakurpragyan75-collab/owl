export function moonPhase(at = new Date()) {
  const synodic = 29.53058867;
  const known = Date.UTC(2000, 0, 6, 18, 14, 0);
  const days = (at.getTime() - known) / 86400000;
  const age = ((days % synodic) + synodic) % synodic;
  const frac = age / synodic;
  const names = [
    [0.03, "new"],
    [0.22, "waxing crescent"],
    [0.28, "first quarter"],
    [0.47, "waxing gibbous"],
    [0.53, "full"],
    [0.72, "waning gibbous"],
    [0.78, "last quarter"],
    [0.97, "waning crescent"],
    [1, "new"],
  ] as const;
  const name = names.find(([t]) => frac <= t)?.[1] ?? "new";
  const illum = Math.round((1 - Math.cos(2 * Math.PI * frac)) * 50);
  return { name, age: Number(age.toFixed(1)), illum, frac };
}

export function skyBrief(city?: string) {
  const moon = moonPhase();
  const h = new Date().getHours();
  const night = h < 6 || h >= 19;
  const where = city?.trim() || "this roost";
  return `Sky over ${where}: ${moon.name} moon, about ${moon.illum}% lit, ${moon.age} days old. ${night ? "Night watch." : "Daylight still."}`;
}

export function qrSrc(payload: string) {
  const q = encodeURIComponent(payload.slice(0, 400));
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${q}&bgcolor=08090c&color=e8e6e1`;
}

export async function readBattery(): Promise<string> {
  const nav = navigator as Navigator & {
    getBattery?: () => Promise<{ level: number; charging: boolean }>;
  };
  if (!nav.getBattery) {
    const c = (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number } }).connection;
    const net = c?.effectiveType ? `Link ${c.effectiveType}${c.downlink ? ` · ${c.downlink} Mbps` : ""}.` : "No battery API on this roost.";
    return net;
  }
  const b = await nav.getBattery();
  const pct = Math.round(b.level * 100);
  return `${pct}% ${b.charging ? "charging" : "on the cell"}.`;
}

export async function batteryPct(): Promise<number | null> {
  const nav = navigator as Navigator & {
    getBattery?: () => Promise<{ level: number; charging: boolean }>;
  };
  if (!nav.getBattery) return null;
  try {
    const b = await nav.getBattery();
    return Math.round(b.level * 100);
  } catch {
    return null;
  }
}

export function downloadHref(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function roostSigil(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = h >>> 0;
  const pts: string[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + ((u % 360) * Math.PI) / 180;
    const r = 22 + ((u >>> (i * 4)) % 16);
    pts.push(`${(40 + Math.cos(a) * r).toFixed(1)},${(40 + Math.sin(a) * r).toFixed(1)}`);
  }
  return { points: pts.join(" "), hue: u % 40 };
}

export function sampleFrame(video: HTMLVideoElement | null): { luma: number; hex: string } | null {
  if (!video || video.readyState < 2 || !video.videoWidth) return null;
  const c = document.createElement("canvas");
  c.width = 48;
  c.height = 28;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, 48, 28);
  const d = ctx.getImageData(0, 0, 48, 28).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
    n += 1;
  }
  r /= n;
  g /= n;
  b /= n;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const lift = luma < 40 ? 40 - luma : 0;
  const hex = `#${[r + lift, g + lift, b + lift]
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
    .join("")}`;
  return { luma, hex };
}

export function chime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 528;
    g.gain.value = 0.07;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.15);
    o.stop(ctx.currentTime + 1.2);
    window.setTimeout(() => void ctx.close(), 1600);
  } catch {
    /* ignore */
  }
}

export async function enableTilt(): Promise<boolean> {
  const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
  try {
    if (typeof DOE.requestPermission === "function") {
      const s = await DOE.requestPermission();
      return s === "granted";
    }
    return true;
  } catch {
    return false;
  }
}
