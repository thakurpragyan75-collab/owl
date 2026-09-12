export type StyleId =
  | "sketch"
  | "ghibli"
  | "realistic"
  | "noir"
  | "oil"
  | "watercolor"
  | "clay"
  | "comic"
  | "pixel"
  | "ink";

export const PORTRAIT_STYLES: { id: StyleId; label: string; prompt: string }[] = [
  {
    id: "sketch",
    label: "Sketch",
    prompt:
      "Keep the same person and pose. Render as a realistic graphite portrait sketch on cream paper, fine hatching, accurate features, no extra people, no text.",
  },
  {
    id: "ghibli",
    label: "Ghibli",
    prompt:
      "Keep the same person. Soft Japanese animated-film still: hand-painted watercolor air, gentle face, large clear eyes, pastoral light. Original character, not a copy of any existing film figure. No text.",
  },
  {
    id: "realistic",
    label: "Realistic",
    prompt:
      "Keep the same person. Photoreal portrait, natural skin texture, true lighting, 50mm look, no beauty filter, no extra people, no text.",
  },
  {
    id: "noir",
    label: "Noir",
    prompt:
      "Keep the same person. High-contrast black-and-white noir still, rim light, film grain, same face, no text.",
  },
  {
    id: "oil",
    label: "Oil",
    prompt: "Keep the same person. Classical oil portrait, visible brushwork, warm studio light, same likeness, no text.",
  },
  {
    id: "watercolor",
    label: "Watercolor",
    prompt: "Keep the same person. Loose watercolor portrait, paper tooth, soft edges, same likeness, no text.",
  },
  {
    id: "clay",
    label: "Clay",
    prompt: "Keep the same person as a clay-stop-motion figure, studio light, same face structure, no text.",
  },
  {
    id: "comic",
    label: "Comic",
    prompt: "Keep the same person. Bold ink comic portrait, flat color, clean line, same likeness, no text, no extra people.",
  },
  {
    id: "pixel",
    label: "Pixel",
    prompt: "Keep the same person as a detailed 64-pixel-tall portrait sprite, readable face, no text.",
  },
  {
    id: "ink",
    label: "Ink",
    prompt: "Keep the same person. Sumi-e ink wash portrait, few strokes, same likeness, cream paper, no text.",
  },
];

export function styleByName(raw: string): StyleId | undefined {
  const t = raw.toLowerCase().replace(/[^a-z]+/g, " ").trim();
  if (/\b(ghibli|gibli|miyazaki|anime film)\b/.test(t)) return "ghibli";
  if (/\b(sketch|pencil|graphite|drawing)\b/.test(t)) return "sketch";
  if (/\b(realistic|photo|photoreal)\b/.test(t)) return "realistic";
  if (/\b(noir|black and white|mono)\b/.test(t)) return "noir";
  if (/\b(oil|painterly)\b/.test(t)) return "oil";
  if (/\bwatercolor\b/.test(t)) return "watercolor";
  if (/\b(clay|claymation)\b/.test(t)) return "clay";
  if (/\b(comic|cartoon ink)\b/.test(t)) return "comic";
  if (/\bpixel\b/.test(t)) return "pixel";
  if (/\b(ink|sumi)\b/.test(t)) return "ink";
  return undefined;
}

export function stylePrompt(id: StyleId) {
  return PORTRAIT_STYLES.find((s) => s.id === id)?.prompt ?? PORTRAIT_STYLES[0].prompt;
}

export async function stillToDataUrl(file: File, max = 768): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("read"));
    r.readAsDataURL(file);
  });
  return shrinkDataUrl(raw, max);
}

export async function shrinkDataUrl(dataUrl: string, max = 768): Promise<string> {
  if (!dataUrl.startsWith("data:image")) return dataUrl;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("img"));
    el.src = dataUrl;
  });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function parseFaceCode(raw: string): string | null {
  const fenced = raw.match(/```(?:owl-face|text)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? raw).trim();
  if (!/^OWL-FACE\/1\b/m.test(body)) return null;
  return body.slice(0, 1800);
}

export function faceToImaginePrompt(code: string) {
  return [
    "Photoreal portrait of ONE person matching this appearance sheet. Eye-level, 50mm, natural light.",
    "Do not add extra people. Do not invent a celebrity. No text, no watermark, no logo.",
    code,
  ].join("\n");
}
