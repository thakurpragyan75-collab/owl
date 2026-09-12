export type OwlSeed = {
  kind: "OWL-SEED/1";
  at: number;
  dim: 512;
  vector: number[];
  sheet?: string;
  crop?: string;
};

export function isOwlSeed(v: unknown): v is OwlSeed {
  if (!v || typeof v !== "object") return false;
  const o = v as OwlSeed;
  return o.kind === "OWL-SEED/1" && Array.isArray(o.vector) && o.vector.length === 512;
}

export function parseSeedText(raw: string): OwlSeed | null {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json|owl-seed)?\s*([\s\S]*?)```/i);
  const body = fence?.[1]?.trim() ?? trimmed;
  try {
    const parsed = JSON.parse(body);
    if (isOwlSeed(parsed)) return parsed;
    if (Array.isArray(parsed) && parsed.length === 512 && parsed.every((n) => typeof n === "number")) {
      return { kind: "OWL-SEED/1", at: Date.now(), dim: 512, vector: parsed.map(Number) };
    }
  } catch {
    /* not json */
  }
  return null;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("img"));
    el.src = src;
  });
}

/** Tight portrait crop — upper-center square, typical selfie. */
export async function cropFace(dataUrl: string, size = 256): Promise<string> {
  const img = await loadImage(dataUrl);
  const side = Math.min(img.width, img.height) * 0.78;
  const cx = img.width / 2;
  const cy = img.height * 0.42;
  const x = Math.max(0, Math.min(img.width - side, cx - side / 2));
  const y = Math.max(0, Math.min(img.height - side, cy - side / 2));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, x, y, side, side, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.82);
}

/** 512-d unit vector from the crop (32×16 luma). Portable fingerprint of this still, not ArcFace InstantID. */
export async function embed512(dataUrl: string): Promise<number[]> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 16;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new Array(512).fill(0);
  ctx.drawImage(img, 0, 0, 32, 16);
  const pix = ctx.getImageData(0, 0, 32, 16).data;
  const v = new Array<number>(512);
  let sum = 0;
  for (let i = 0; i < 512; i++) {
    const o = i * 4;
    const y = (0.2126 * pix[o] + 0.7152 * pix[o + 1] + 0.0722 * pix[o + 2]) / 255;
    v[i] = y;
    sum += y;
  }
  const mean = sum / 512;
  let n2 = 0;
  for (let i = 0; i < 512; i++) {
    v[i] -= mean;
    n2 += v[i] * v[i];
  }
  const n = Math.sqrt(n2) || 1;
  return v.map((x) => Number((x / n).toFixed(8)));
}

export async function mintSeed(opts: { image: string; sheet?: string }): Promise<OwlSeed> {
  const crop = await cropFace(opts.image, 256);
  const vector = await embed512(crop);
  return {
    kind: "OWL-SEED/1",
    at: Date.now(),
    dim: 512,
    vector,
    sheet: opts.sheet,
    crop,
  };
}

export function seedJson(seed: OwlSeed) {
  return JSON.stringify(seed, null, 2);
}

/** NumPy .npy for a float32 (512,) vector. */
export function seedNpy(seed: OwlSeed): Uint8Array {
  const magic = new Uint8Array([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 0x01, 0x00]);
  let header = "{'descr': '<f4', 'fortran_order': False, 'shape': (512,), }";
  const pad = 16 - ((magic.length + 2 + header.length + 1) % 16);
  header = header + " ".repeat(pad) + "\n";
  const hlen = header.length;
  const out = new Uint8Array(magic.length + 2 + hlen + 512 * 4);
  out.set(magic, 0);
  out[8] = hlen & 0xff;
  out[9] = (hlen >> 8) & 0xff;
  for (let i = 0; i < hlen; i++) out[10 + i] = header.charCodeAt(i);
  const view = new DataView(out.buffer);
  const base = magic.length + 2 + hlen;
  for (let i = 0; i < 512; i++) view.setFloat32(base + i * 4, seed.vector[i] ?? 0, true);
  return out;
}

export function downloadBlob(name: string, blob: Blob) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 1500);
}

export function downloadSeed(seed: OwlSeed, kind: "json" | "npy") {
  if (kind === "npy") {
    const bytes = seedNpy(seed);
    const copy = Uint8Array.from(bytes);
    downloadBlob("owl-face-512.npy", new Blob([copy], { type: "application/octet-stream" }));
    return;
  }
  downloadBlob("owl-seed.json", new Blob([seedJson(seed)], { type: "application/json" }));
}

export async function readNpy512(buf: ArrayBuffer): Promise<number[] | null> {
  const u8 = new Uint8Array(buf);
  if (u8.length < 128 || u8[0] !== 0x93 || u8[1] !== 0x4e) return null;
  const major = u8[6];
  const hlen = major === 1 ? u8[8] + (u8[9] << 8) : new DataView(buf).getUint32(8, true);
  const hstart = major === 1 ? 10 : 12;
  const data = buf.slice(hstart + hlen);
  if (data.byteLength < 512 * 4) return null;
  const view = new DataView(data);
  const v = new Array<number>(512);
  for (let i = 0; i < 512; i++) v[i] = view.getFloat32(i * 4, true);
  return v;
}
