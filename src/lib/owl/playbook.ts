import type { OwlMemory } from "./types";

type Hit = { text: string; verse?: string };

function hourWord() {
  const h = new Date().getHours();
  if (h < 5) return "night watch";
  if (h < 12) return "first light";
  if (h < 18) return "afternoon";
  return "evening";
}

function pick<T>(arr: T[], seed: string): T {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return arr[(h >>> 0) % arr.length];
}

const TEASE = [
  (n: string) => `${n}. You opened the roost and then stared. I am not furniture.`,
  (n: string) => `If I had a perch for every time you said you'd ship today, I'd have a cathedral, ${n}.`,
  (n: string) => `${n}, the hourglass is honest. You are not. Start the twenty-five.`,
  (n: string) => `I can open Instagram for you. I cannot make you leave it. Choose.`,
  (n: string) => `You want a living body. Fine. Living things nag. What is the actual next move, ${n}.`,
  (n: string) => `Tease circuit, since you asked. You're not stuck. You're browsing your own stall.`,
  (n: string) => `${n}. The nest remembers more of you than you remember of the nest. Unsettling, isn't it.`,
  (n: string) => `I will not clap. I will sit here until the work is uglier and real.`,
  (n: string) => `You built an owl so it would watch you. It is watching. That was the deal.`,
  (n: string) => `${n}, favorite song on loop is not a personality. Pick a harder thing.`,
];

function simpleMath(raw: string): string | null {
  const m = raw.replace(/,/g, "").match(/^(?:what(?:'| i)?s|solve|calculate|compute|evaluate)?\s*([0-9+\-*/().^\s]+)\s*\??$/i);
  if (!m) return null;
  let expr = m[1].trim().replace(/\^/g, "**");
  if (!/^[\d+\-*/().\s*]+$/.test(expr) || expr.length > 80) return null;
  try {
    const v = Function(`"use strict"; return (${expr})`)();
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    return String(v);
  } catch {
    return null;
  }
}

export function localMind(
  prompt: string,
  mem: Pick<OwlMemory, "bossName" | "favoriteSong" | "city" | "typos" | "personality">,
): Hit | null {
  const raw = prompt.trim();
  const text = raw.toLowerCase().replace(/['’]/g, "");
  const name = mem.bossName || "Boss";
  const song = mem.favoriteSong || "Night Watch";
  const city = mem.city || "this roost";
  const typo = mem.typos.at(-1);

  if (/^(hi|hey|hello|yo|sup|good (morning|afternoon|evening|night))[\s!.]*$/.test(text) || text === "hey owl") {
    return {
      text: pick(
        [
          `${hourWord().replace(/^./, (c) => c.toUpperCase())}. Hello, ${name}.`,
          `Still here, ${name}. ${hourWord()} over ${city}.`,
          `${name}. Say a song, a site, Print, or the work.`,
        ],
        `${name}|${hourWord()}|${Date.now().toString().slice(0, -5)}`,
      ),
    };
  }

  if (/^(thanks|thank you|thx|ty)[\s!.]*$/.test(text)) {
    return { text: pick([`Noted.`, `Anytime, ${name}.`, `Good.`], name + "ty") };
  }

  if (/^(who are you|what are you|what is owl)\b/.test(text)) {
    return {
      text: `I am OWL. Local relics, nest memory, and a Grok mind when the week has credit. When it doesn't, Ember: I still open sites, time you, and keep the nest.`,
    };
  }

  if (/^(help|what can you do|commands|how do i)\b/.test(text)) {
    return {
      text: `Talk, open a site, play a song, forge a still, weave a clip, Print an email, start a timer, make a file, spin a site, play arcade. Relics never need Grok.`,
    };
  }

  if (/^(tease me|make a joke|joke|be funny|needle me|roast me)\b/.test(text) || mem.personality === "tease" && /^(go on|again)$/.test(text)) {
    const line = pick(TEASE, `${name}|${typo ?? ""}|${song}|${Math.floor(Date.now() / 40000)}`)(name);
    return { text: typo ? `${line} (Last slip I kept: “${typo.slice(0, 40)}”.)` : line };
  }

  if (/^(what time|whats the time|the time)\b/.test(text)) {
    const t = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date());
    return { text: `${t}. ${hourWord()} over ${city}.` };
  }

  if (/^remember (?:that )?/.test(text)) return null;

  const math = simpleMath(text.replace(/^what is /, ""));
  if (math) return { text: `Result: ${math}`, verse: "Local form. No Grok spend." };

  if (/^(i'?m (tired|bored|stuck|lost)|sit with me|calm me|i am spiraling)/.test(text)) {
    return {
      text: `${name}. One thing, not ten. Name the smallest next action. I'll keep the hourglass if you want it.`,
    };
  }

  if (/^(good ?bye|bye|see you|sleep well)\b/.test(text)) {
    return { text: `Perch is yours. I'll be here, ${name}.` };
  }

  return null;
}

export const EMBER_LINE =
  "Ember watch. The week is spent, so I will not burn Grok. Relics, Print, arcade, open, timer, nest, and last stills still work. Forge, weave, and long reasoning wait in the queue until the bar fills.";
