import type { Person } from "./types";

export function digitsPhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return d;
}

export function waHref(opts: { phone?: string; text?: string }): string {
  const text = opts.text?.trim() ? encodeURIComponent(opts.text.trim()) : "";
  const phone = opts.phone ? digitsPhone(opts.phone) : "";
  const mobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (phone && text) {
    return mobile
      ? `https://wa.me/${phone}?text=${text}`
      : `https://web.whatsapp.com/send?phone=${phone}&text=${text}&type=phone_number&app_absent=0`;
  }
  if (phone) {
    return mobile ? `https://wa.me/${phone}` : `https://web.whatsapp.com/send?phone=${phone}&type=phone_number&app_absent=0`;
  }
  if (text) return `https://wa.me/?text=${text}`;
  return mobile ? "https://wa.me/" : "https://web.whatsapp.com/";
}

export function launchHref(url: string): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (window.self !== window.top) return false;
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (!w || w.closed) return false;
    try {
      w.opener = null;
    } catch {
      /* ignore */
    }
    return true;
  } catch {
    return false;
  }
}

export function findPerson(people: Person[], name: string): Person | undefined {
  const n = name.toLowerCase().trim();
  if (!n) return undefined;
  const exact = people.find((p) => p.name.toLowerCase() === n);
  if (exact) return exact;
  return people.find((p) => {
    const pn = p.name.toLowerCase();
    return pn.includes(n) || n.includes(pn);
  });
}
