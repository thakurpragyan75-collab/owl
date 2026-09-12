import { MODULE_WORDS, resolveSite } from "./sites";
import type { ModuleId, OwlAction } from "./types";
import { parseFaceCode, styleByName } from "./portrait";

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripWakeWord(raw: string): { woke: boolean; rest: string } {
  const trimmed = raw.trim();
  const text = norm(trimmed);
  const wakes = [
    "hey owl", "hi owl", "okay owl", "ok owl", "yo owl", "hello owl",
    "hey ol", "hay owl", "hey all", "hey ow", "hey al", "hey howl",
    "hey old", "hey owel", "hey awl", "okey owl",
  ];
  for (const w of wakes) {
    if (text === w) return { woke: true, rest: "" };
    if (text.startsWith(w + " ")) {
      const re = new RegExp("^" + w.replace(/ /g, "\\s+") + "\\s+", "i");
      const m = trimmed.match(re);
      return { woke: true, rest: m ? trimmed.slice(m[0].length).trim() : trimmed };
    }
  }
  const smashed = text.replace(/\s/g, "");
  if (/^(hey|hi|ok|okay|yo|hello)(owl|ol|all|awl|owel|howl)/.test(smashed) || smashed === "owl") {
    const onlyWake = /^(hey|hi|ok|okay|yo|hello)?\s*(owl|ol|all|awl|owel|howl)\s*$/i.test(trimmed);
    const rest = trimmed.replace(/^(hey|hi|ok|okay|yo|hello)?\s*(owl|ol|all|awl|owel|howl)\s+/i, "").trim();
    return { woke: true, rest: onlyWake ? "" : rest === trimmed ? "" : rest };
  }
  return { woke: false, rest: trimmed };
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

function fuzzyIncludes(hay: string, needle: string) {
  if (hay.includes(needle) || hay === needle) return true;
  const words = hay.split(" ").filter(Boolean);
  const parts = needle.split(" ").filter(Boolean);
  if (!parts.length || parts.length > words.length) return false;

  const wordFits = (w: string, t: string) => {
    if (w === t) return true;
    if (w.length > 3 && t.length > 3 && (w.includes(t) || t.includes(w))) return true;
    if (w.length >= 2 && t.length >= 2 && Math.abs(t.length - w.length) <= 1 && (t.startsWith(w) || w.startsWith(t)))
      return true;
    const allow = t.length <= 4 ? 0 : t.length <= 7 ? 1 : 2;
    return levenshtein(w, t) <= allow;
  };

  for (let start = 0; start <= words.length - parts.length; start++) {
    let ok = true;
    for (let k = 0; k < parts.length; k++) {
      if (!wordFits(words[start + k], parts[k])) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

const PLAY_ALL = [
  "play my favorite song in all three of the devices",
  "play my favorite song on all three of the devices",
  "play my favorite song in all three devices",
  "play my favorite song on all devices",
  "play my favourite song in all three of the devices",
  "play my favrite song on al devices",
  "play favorite song on all devices",
  "play favourite song all devices",
  "play my song on all three",
];

const PLAY_FAV = [
  "play my favorite song",
  "play my favourite song",
  "play favorite song",
  "play my song",
  "play music",
];

const SLEEP = ["go to sleep", "sleep", "turn off", "power down", "rest now", "perch"];
const WAKE = ["wake up", "wake", "awaken", "turn on", "come back"];
const CLONE = ["replicate yourself", "clone yourself", "make a copy", "second shadow", "replicate"];
const VISION = [
  "look at me",
  "look through the camera",
  "what do you see",
  "observe me",
  "open vision",
  "use the camera",
  "watch me",
  "turn on camera",
  "open camera",
  "camera on",
];
const TEASE = ["tease me", "make a joke", "joke", "be funny"];
const QUIET = ["quiet hours", "be quiet", "stop talking", "silence"];
const FOCUS = ["focus", "focus mode", "hide panels"];
const NEWS = [
  "news",
  "current affairs",
  "current affair",
  "give reports",
  "give me the news",
  "give me news",
  "whats happening",
  "what is happening",
  "headlines",
  "world news",
  "brief me the news",
  "news report",
  "todays news",
  "today news",
  "current news",
  "whats the news",
  "what is the news",
];

const MODULE_PHRASES: Array<[string[], ModuleId]> = [
  [["open mesh", "device mesh", "devices", "show devices"], "mesh"],
  [["open studio", "open imagine"], "studio"],
  [["open arcade", "play a game", "games"], "arcade"],
  [["open vision", "open camera", "open gaze"], "vision"],
  [["open codex", "features", "show abilities", "rare features"], "codex"],
  [["open inbox", "inbox", "read this message"], "inbox"],
  [["open memory", "open nest"], "memory"],
  [["open code", "code nest"], "code"],
  [["open site", "site spindle"], "site"],
  [["open relics", "open relic", "relics", "rare relics"], "relics"],
];

const GAMES: Array<[string[], "snake" | "pong" | "perch"]> = [
  [["play snake", "snake", "signal snake"], "snake"],
  [["play pong", "pong", "echo pong"], "pong"],
  [["play perch", "perch catch"], "perch"],
];

function matchAny(text: string, list: string[]) {
  return list.some((p) => fuzzyIncludes(text, p) || text === p);
}

export function looksLikeMath(text: string, raw: string) {
  if (/^(solve|calculate|compute|prove|differentiate|integrate|simplify|expand|factor|evaluate|find the)\b/.test(text))
    return true;
  if (/\b(integral|derivative|limit of|matrix|eigen|factorial|polynomial|quadratic|differential equation|prove that|nth root)\b/.test(text))
    return true;
  if (/\d/.test(text) && /[+\-*/^=√∫∑]/.test(raw) && text.length < 240) return true;
  if (/\bwhat is\b/.test(text) && /\d/.test(text) && /[\^+\-*/x×÷]|power|squared|cubed|factorial/.test(text) && text.length < 180)
    return true;
  return false;
}

export function parseCommand(raw: string): OwlAction | null {
  const woken = stripWakeWord(raw);
  const original = (woken.rest || (woken.woke ? "" : raw)).trim();
  const text = norm(original);
  if (!text) return woken.woke ? { type: "wake" } : null;

  const nameCall = text.match(/^(?:call me|my name is|i am|im)\s+([a-z][a-z0-9_\- ]{1,24})$/);
  if (nameCall?.[1]) {
    return { type: "set_name", name: nameCall[1].replace(/\b\w/g, (c) => c.toUpperCase()) };
  }

  if (/^(forge still|generate image|make an image|imagine still)$/.test(text)) {
    return { type: "generate_image", prompt: "a geometric owl of moonlight and teal glass, night HUD" };
  }
  if (/^(weave clip|generate video|make a video|make a clip)$/.test(text)) {
    return { type: "generate_video", prompt: "a geometric owl turning its head, moonlight, teal glass" };
  }

  const imgEarly = original.match(
    /(?:generate|create|make|draw|imagine|forge)\s+(?:an?\s+)?(?:image|picture|photo|art|still)\s+(?:of\s+|for\s+|:\s*)?(.+)/i,
  );
  if (imgEarly?.[1]) return { type: "generate_image", prompt: imgEarly[1].trim() };

  const vidEarly = original.match(
    /(?:generate|create|make|weave)\s+(?:a\s+)?(?:video|clip)\s+(?:of\s+|for\s+|:\s*)?(.+)/i,
  );
  if (vidEarly?.[1]) return { type: "generate_video", prompt: vidEarly[1].trim() };

  const facePaste = parseFaceCode(original);
  if (facePaste) return { type: "forge_face", code: facePaste };

  if (
    /^(mint (my )?face|write (my )?face|face code|iris code|who is in front|whos in front|who's in front|encode (this )?face|copy my face)/.test(
      text,
    )
  ) {
    return { type: "mint_face" };
  }

  if (
    /^(restyle|ghibli|gibli|sketch this|sketch me|draw me|turn me into|make me|style this)\b/.test(text) ||
    /\b(in|as) (ghibli|gibli|sketch|noir|oil|watercolor|clay|comic|pixel|ink|realistic)\b/.test(text)
  ) {
    return { type: "restyle", style: styleByName(original) ?? "sketch", prompt: original };
  }

  const songCall = text.match(/^(?:my )?(?:favou?rite|fav) song is\s+(.+)$/);
  if (songCall?.[1]) {
    const title = songCall[1].trim().replace(/\s+/g, " ");
    if (title) return { type: "set_song", title };
  }

  const cityCall = text.match(/^(?:i live in|my city is|set city to|im in)\s+([a-z][a-z0-9 ,.\-]{1,40})$/);
  if (cityCall?.[1]) {
    return { type: "set_city", city: cityCall[1].trim().replace(/\b\w/g, (c) => c.toUpperCase()) };
  }

  if (matchAny(text, NEWS) && text.split(" ").length < 8) return { type: "news" };
  if (matchAny(text, PLAY_ALL)) return { type: "play_music", scope: "all" };
  if (matchAny(text, ["play moon circuit", "play night watch", "play boss theme"])) {
    const track = text.includes("moon") ? "Moon Circuit" : text.includes("boss") ? "Boss Theme" : "Night Watch";
    return { type: "play_music", scope: "all", track };
  }
  if (matchAny(text, PLAY_FAV)) return { type: "play_music", scope: "all" };
  if (matchAny(text, ["stop music", "pause song", "stop the song", "stop playing"])) return { type: "stop_music" };
  if (matchAny(text, SLEEP)) return { type: "sleep" };
  if (matchAny(text, WAKE)) return { type: "wake" };
  if (matchAny(text, CLONE)) return { type: "clone" };
  if (matchAny(text, QUIET)) return { type: "theme", name: "quiet" };
  if (matchAny(text, FOCUS)) return { type: "theme", name: "focus" };
  if (matchAny(text, ["hud frost", "frost hud", "theme frost"])) return { type: "theme", name: "frost" };
  if (matchAny(text, ["hud ember", "ember hud", "theme ember"])) return { type: "theme", name: "ember" };
  if (matchAny(text, ["hud night", "night hud", "theme night"])) return { type: "theme", name: "night" };
  if (matchAny(text, TEASE)) return { type: "chat", text: raw };
  if (matchAny(text, ["share this", "share image", "send this image", "bluetooth share", "share over bluetooth"])) {
    return { type: "share" };
  }

  const qr = original.match(/^(?:make |create |generate )?(?:a )?qr(?: code)?(?: for| of|:)?\s+(.+)/i);
  if (qr?.[1]) return { type: "relic", kind: "qr", payload: qr[1].trim() };
  if (matchAny(text, ["clipboard", "whats on my clipboard", "read clipboard", "paste nest"])) {
    return { type: "relic", kind: "clipboard" };
  }
  if (matchAny(text, ["sky", "sky ledger", "moon", "moon phase", "sunrise", "sunset", "what phase is the moon"])) {
    return { type: "relic", kind: "sky" };
  }
  if (matchAny(text, ["battery", "power left", "how much charge", "battery veil"])) {
    return { type: "relic", kind: "battery" };
  }
  if (matchAny(text, ["save still", "download still", "snapshot", "polaroid", "save the still"])) {
    return { type: "relic", kind: "polaroid" };
  }
  if (matchAny(text, ["how dark is it", "dim gaze", "is it dark", "how dim"])) {
    return { type: "relic", kind: "dim" };
  }
  if (matchAny(text, ["tilt perch", "tilt the perch", "lean with me", "enable tilt"])) {
    return { type: "relic", kind: "tilt" };
  }
  if (matchAny(text, ["what color is this", "colour talon", "color talon", "sample the color", "sample the colour"])) {
    return { type: "relic", kind: "color" };
  }
  if (matchAny(text, ["roost sigil", "my sigil", "show sigil", "nest mark"])) {
    return { type: "relic", kind: "sigil" };
  }
  if (matchAny(text, ["cover my eye", "cover eye", "cover the camera"])) {
    return { type: "relic", kind: "cover" };
  }
  if (matchAny(text, ["start a timer", "start hourglass", "pomodoro", "perch timer", "start focus hour", "start a focus hour"])) {
    const mins = original.match(/(\d+)\s*(?:min|minute)/i);
    return { type: "relic", kind: "focus", payload: mins?.[1] };
  }
  if (matchAny(text, ["stop timer", "stop hourglass", "end focus hour"])) {
    return { type: "relic", kind: "unfocus" };
  }

  const wa = parseWhatsApp(raw);
  if (wa) return wa;

  for (const [phrases, game] of GAMES) {
    if (matchAny(text, phrases)) return { type: "game", name: game };
  }

  if (looksLikeMath(text, original)) {
    return { type: "math", prompt: original };
  }

  const song = text.match(
    /^(?:play|put on)\s+(?:the\s+)?(?:song\s+|track\s+|music\s+)?(.+?)(?:\s+on\s+(?:yt|youtube|yt music|youtube music))?$/,
  );
  if (song?.[1] && !/^(music|a game|snake|pong|perch|arcade)$/.test(song[1])) {
    return { type: "play_song", query: song[1].trim() };
  }

  const img = text.match(
    /(?:generate|create|make|draw|imagine|forge)\s+(?:an?\s+)?(?:image|picture|photo|art|still)\s+(?:of\s+|for\s+|:\s*)?(.+)/,
  );
  if (img?.[1]) return { type: "generate_image", prompt: img[1] };

  const vid = text.match(
    /(?:generate|create|make|weave)\s+(?:a\s+)?(?:video|clip)\s+(?:of\s+|for\s+|:\s*)?(.+)/,
  );
  if (vid?.[1]) return { type: "generate_video", prompt: vid[1] };

  const siteBuild = text.match(
    /(?:build|create|make|spin)\s+(?:a\s+)?(?:website|site|landing page)\s+(?:for|about|of)?\s*(.*)/,
  );
  if (siteBuild && (text.includes("website") || text.includes("landing") || text.includes("site spindle"))) {
    return { type: "website", prompt: siteBuild[1] || raw };
  }

  if (text.includes("code") || /\b(python|javascript|typescript|function)\b/.test(text)) {
    const codeAsk = /(?:write|generate|code|implement)/.test(text);
    if (codeAsk) return { type: "code", prompt: raw };
  }

  if (matchAny(text, VISION)) return { type: "vision" };

  const research = text.match(/^(?:who is|who's|whos|tell me about|research|look up|what is|whats|who was|who are)\s+(.+)/);
  if (research?.[1] && research[1].length > 1) {
    if (matchAny(text, NEWS)) return { type: "news" };
    return { type: "research", topic: research[1] };
  }

  const call = text.match(/^call\s+(.+)/);
  if (call?.[1] && call[1].length < 40 && !MODULE_WORDS.has(call[1])) {
    return { type: "call", target: call[1] };
  }

  for (const [phrases, mod] of MODULE_PHRASES) {
    if (matchAny(text, phrases)) return { type: "open", module: mod };
  }

  const opener = text.match(/^(?:open|launch|go to|visit|browse|take me to)\s+(.+)/);
  if (opener?.[1]) {
    const target = opener[1]
      .replace(/^(the|app|website|site)\s+/, "")
      .replace(/\s+(?:in )?(?:a )?(?:new )?tab$/, "")
      .replace(/\s+please$/, "")
      .trim();
    if (MODULE_WORDS.has(target) || MODULE_WORDS.has(target.replace(/\s+/g, ""))) {
      const key = target.replace(/\s+/g, "") as ModuleId;
      const map: Record<string, ModuleId> = {
        camera: "vision",
        gaze: "vision",
        nest: "memory",
        imagine: "studio",
      };
      return { type: "open", module: map[key] ?? (target as ModuleId) };
    }
    const url = resolveSite(target);
    if (url) return { type: "open_url", url, label: target };
  }

  if (text.startsWith("hello") || text === "hi" || text === "hey") {
    return { type: "chat", text: raw };
  }

  return null;
}

function parseWhatsApp(raw: string): OwlAction | null {
  const original = raw.trim();
  const text = norm(original);
  if (!/whatsapp|\bwa\b/.test(text) && !/(number is|add contact)/.test(text)) return null;

  const remember = original.match(
    /^(?:remember\s+|save\s+)?(.+?)(?:'s)?\s+(?:whatsapp\s+)?(?:phone\s+)?number is\s+(\+?[\d\s\-()]{8,22})\s*$/i,
  );
  if (remember?.[1] && remember[2]) {
    const name = remember[1].replace(/^(remember|save)\s+/i, "").trim();
    if (name && name.length < 40) return { type: "save_contact", name, phone: remember[2] };
  }
  const addc = original.match(/^(?:add|save)\s+contact\s+(.+?)\s+(\+?[\d\s\-()]{8,22})\s*$/i);
  if (addc?.[1] && addc[2]) return { type: "save_contact", name: addc[1].trim(), phone: addc[2] };

  if (!/whatsapp|\bwa\b/.test(text)) return null;

  const sendAs = original.match(
    /(?:open\s+)?whatsapp(?:\s+and)?\s+send\s+(.+?)\s+(?:a\s+)?(?:text|message)\s+(?:as|saying|:)\s+(.+)/i,
  );
  if (sendAs?.[1] && sendAs[2]) {
    return { type: "whatsapp", kind: "send", target: sendAs[1].trim(), text: sendAs[2].trim() };
  }
  const sendSaying = original.match(/(?:open\s+)?whatsapp(?:\s+and)?\s+send\s+(.+?)\s+(?:as|saying|:)\s+(.+)/i);
  if (sendSaying?.[1] && sendSaying[2]) {
    return { type: "whatsapp", kind: "send", target: sendSaying[1].trim(), text: sendSaying[2].trim() };
  }
  const sendTo = original.match(
    /(?:open\s+whatsapp\s+and\s+)?send\s+(.+?)\s+to\s+(.+?)(?:\s+on\s+whatsapp)?\s*$/i,
  );
  if (sendTo?.[1] && sendTo[2] && /whatsapp/.test(text)) {
    return { type: "whatsapp", kind: "send", target: sendTo[2].trim(), text: sendTo[1].trim() };
  }
  const textOn = original.match(
    /(?:text|message)\s+(.+?)\s+on\s+whatsapp(?:\s+(?:as|saying|:)\s*(.+))?$/i,
  );
  if (textOn?.[1]) {
    return { type: "whatsapp", kind: "send", target: textOn[1].trim(), text: (textOn[2] || "Hi").trim() };
  }
  const waCall = original.match(/^(?:whatsapp\s+)?call\s+(.+?)(?:\s+on\s+whatsapp)?\s*$/i);
  if (waCall?.[1] && /whatsapp/.test(text)) {
    return { type: "whatsapp", kind: "call", target: waCall[1].trim() };
  }
  if (/^(?:open|launch|go to|visit)?\s*(?:whatsapp|wa)\s*$/.test(text) || text === "open whatsapp") {
    return { type: "whatsapp", kind: "open", target: "" };
  }
  return null;
}

export function cinematicLine(action: OwlAction, boss: string): string {
  switch (action.type) {
    case "play_music":
      return `Playing your song, ${boss}.`;
    case "play_song":
      return `Playing ${action.query} on YouTube Music.`;
    case "stop_music":
      return "Music down.";
    case "sleep":
      return "Perching. Say hey owl when you need me.";
    case "wake":
      return `Hello, ${boss}.`;
    case "clone":
      return "Second shadow on the perch.";
    case "vision":
      return "Opening my eye.";
    case "game":
      return "Arcade live.";
    case "open":
      return "On it.";
    case "open_url":
      return "Opened.";
    case "news":
      return "Pulling the hour.";
    case "research":
      return "Looking into it.";
    case "math":
      return "Working the form.";
    case "share":
      return "Sharing the still.";
    case "call":
      return `Calling ${action.target}.`;
    case "whatsapp":
      if (action.kind === "open") return "Opening WhatsApp.";
      if (action.kind === "call") return `Opening WhatsApp to call ${action.target}.`;
      return `Opening WhatsApp to ${action.target}${action.text ? ` with “${action.text}”` : ""}.`;
    case "relic":
      if (action.kind === "sky") return "Reading the sky.";
      if (action.kind === "focus") return "Hourglass turned.";
      if (action.kind === "qr") return "Spinning a mark.";
      if (action.kind === "battery") return "Feeling the cell.";
      if (action.kind === "polaroid") return "Pulling a still.";
      if (action.kind === "dim") return "Tasting the light.";
      if (action.kind === "clipboard") return "Looking at the clipboard.";
      if (action.kind === "tilt") return "Leaning with the roost.";
      if (action.kind === "color") return "Sampling the scene.";
      if (action.kind === "sigil") return "This roost's mark.";
      if (action.kind === "cover") return "Cover my eye and I'll go quiet.";
      return "Relic.";
    case "save_contact":
      return `Saved ${action.name}'s number.`;
    case "theme":
      return "HUD molted.";
    case "set_name":
      return `Noted. Hello, ${action.name}.`;
    case "set_song":
      return `Favorite song is now ${action.title}.`;
    case "set_city":
      return `Noted. ${action.city}.`;
    case "generate_image":
      return "Forging the still.";
    case "generate_video":
      return "Weaving a clip. This takes a moment.";
    case "restyle":
      return "Restyling the still.";
    case "mint_face":
      return "Writing the face sheet.";
    case "forge_face":
      return "Forging from the face sheet.";
    case "code":
      return "Writing in the nest.";
    case "website":
      return "Spinning the site.";
    default:
      return "";
  }
}
