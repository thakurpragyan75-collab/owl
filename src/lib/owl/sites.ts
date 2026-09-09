export const SITE_ALIASES: Record<string, string> = {
  instagram: "https://www.instagram.com/",
  insta: "https://www.instagram.com/",
  ig: "https://www.instagram.com/",
  "instagram.com": "https://www.instagram.com/",
  youtube: "https://www.youtube.com/",
  yt: "https://www.youtube.com/",
  "you tube": "https://www.youtube.com/",
  "youtube.com": "https://www.youtube.com/",
  "yt music": "https://music.youtube.com/",
  "youtube music": "https://music.youtube.com/",
  ytm: "https://music.youtube.com/",
  youtubemusic: "https://music.youtube.com/",
  twitter: "https://x.com/",
  x: "https://x.com/",
  "x.com": "https://x.com/",
  facebook: "https://www.facebook.com/",
  fb: "https://www.facebook.com/",
  whatsapp: "https://web.whatsapp.com/",
  wa: "https://web.whatsapp.com/",
  gmail: "https://mail.google.com/",
  google: "https://www.google.com/",
  github: "https://github.com/",
  reddit: "https://www.reddit.com/",
  netflix: "https://www.netflix.com/",
  spotify: "https://open.spotify.com/",
  maps: "https://maps.google.com/",
  "google maps": "https://maps.google.com/",
  amazon: "https://www.amazon.com/",
  wikipedia: "https://en.wikipedia.org/",
  wiki: "https://en.wikipedia.org/",
  linkedin: "https://www.linkedin.com/",
  tiktok: "https://www.tiktok.com/",
  discord: "https://discord.com/app",
  chatgpt: "https://chatgpt.com/",
  grok: "https://grok.com/",
  news: "https://news.google.com/",
  "google news": "https://news.google.com/",
  gnews: "https://news.google.com/",
  twitch: "https://www.twitch.tv/",
  pinterest: "https://www.pinterest.com/",
  snapchat: "https://www.snapchat.com/",
  telegram: "https://web.telegram.org/",
  drive: "https://drive.google.com/",
  "google drive": "https://drive.google.com/",
  docs: "https://docs.google.com/",
  calendar: "https://calendar.google.com/",
  notion: "https://www.notion.so/",
  slack: "https://app.slack.com/",
  prime: "https://www.primevideo.com/",
  "prime video": "https://www.primevideo.com/",
  "apple music": "https://music.apple.com/",
  soundcloud: "https://soundcloud.com/",
  bing: "https://www.bing.com/",
  duckduckgo: "https://duckduckgo.com/",
  stackoverflow: "https://stackoverflow.com/",
  "stack overflow": "https://stackoverflow.com/",
};

export const MODULE_WORDS = new Set([
  "mesh",
  "studio",
  "arcade",
  "vision",
  "camera",
  "gaze",
  "inbox",
  "memory",
  "nest",
  "code",
  "site",
  "codex",
  "call",
  "browse",
  "imagine",
]);

function cleanKey(raw: string) {
  return raw
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/^(the|app|website|site|page)\s+/, "")
    .replace(/\.(com|net|org|io|app|tv|fm)$/i, (m) => m.toLowerCase())
    .replace(/[^a-z0-9.\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveSite(raw: string): string | null {
  const key = cleanKey(raw);
  if (!key) return null;
  if (SITE_ALIASES[key]) return SITE_ALIASES[key];
  const smashed = key.replace(/\s+/g, "");
  if (SITE_ALIASES[smashed]) return SITE_ALIASES[smashed];

  if (/^https?:\/\//i.test(raw.trim())) return raw.trim();
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(key.replace(/\s/g, ""))) {
    return `https://${key.replace(/\s/g, "")}`;
  }
  if (/^[a-z0-9-]{2,32}$/.test(key)) {
    return `https://${key}.com`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(raw.trim())}`;
}

export function youtubeMusicSearch(query: string) {
  return `https://music.youtube.com/search?q=${encodeURIComponent(query)}`;
}

export function youtubeSearchEmbed(query: string) {
  return `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(query)}&autoplay=1`;
}

export function youtubeWatchSearch(query: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

export const BLOCK_EMBED = [
  "instagram.com",
  "facebook.com",
  "x.com",
  "twitter.com",
  "tiktok.com",
  "web.whatsapp.com",
  "whatsapp.com",
  "netflix.com",
  "open.spotify.com",
  "spotify.com",
  "music.youtube.com",
  "discord.com",
  "linkedin.com",
  "accounts.google.com",
  "mail.google.com",
];

export function canEmbed(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      return parsed.pathname.startsWith("/embed");
    }
    if (host === "en.wikipedia.org" || host === "wikipedia.org") return true;
    return !BLOCK_EMBED.some((h) => h.replace(/^www\./, "") === host || host.endsWith(`.${h.replace(/^www\./, "")}`));
  } catch {
    return false;
  }
}
