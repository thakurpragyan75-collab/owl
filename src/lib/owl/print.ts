export type PrintHit = {
  title: string;
  url: string;
  blurb: string;
};

export type PrintReport = {
  query: string;
  kind: "email" | "handle" | "name";
  gravatar?: { hash: string; hasProfile: boolean; displayName?: string; about?: string; thumbnail?: string };
  hits: PrintHit[];
  lockDown: string[];
};

export function looksLikeEmail(q: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.trim());
}

export function looksLikeHandle(q: string) {
  return /^@?[a-z0-9._]{2,32}$/i.test(q.trim()) && !looksLikeEmail(q);
}

export const LOCKDOWN = [
  "Open Have I Been Pwned with this address and change any reused password.",
  "Turn on 2FA on mail, GitHub, Instagram, and the bank.",
  "If Gravatar has a photo or name, that is public — trim it or use a blank avatar.",
  "Google yourself in quotes once a season. Remove what you can from the source site.",
  "Do not paste other people's private mail into Print. This roost only reads public traces.",
];
