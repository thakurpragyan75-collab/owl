import { createServerFn } from "@tanstack/react-start";
import type { MindMode } from "./types";
import { extractVideoId, youtubeEmbed, youtubeMusicSearch, youtubeWatch } from "./sites";

type ChatTurn = { role: "system" | "user" | "assistant"; content: string };

export type OwlMind = { ok: true; text: string; verse?: string } | { ok: false; error: string };

function key() {
  return process.env.XAI_API_KEY;
}

function todayStamp() {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date());
}

function compactVerse(raw: string, max = 720) {
  const lines = raw
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/^\s*[-*>]+\s*/, "").trim())
    .filter(Boolean);
  const kept = lines.slice(0, 8).join("\n");
  if (kept.length <= max) return kept;
  return kept.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

function pullTaggedVerse(text: string): { verse?: string; text: string } {
  const tagged = text.match(/<verse>([\s\S]*?)<\/verse>/i);
  if (tagged) return { verse: tagged[1].trim(), text: text.replace(tagged[0], "").trim() };
  const fence = text.match(/```(?:verse|think|reasoning)\n([\s\S]*?)```/i);
  if (fence) return { verse: fence[1].trim(), text: text.replace(fence[0], "").trim() };
  return { text };
}

async function readSse(
  res: Response,
): Promise<{ text: string; verse?: string }> {
  const reader = res.body?.getReader();
  if (!reader) {
    const body = (await res.json()) as {
      choices?: { message?: { content?: string; reasoning_content?: string } }[];
    };
    const msg = body.choices?.[0]?.message;
    return { text: msg?.content ?? "", verse: msg?.reasoning_content };
  }
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  let reasoning = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const json = JSON.parse(data) as {
          choices?: {
            delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null };
            message?: { content?: string; reasoning_content?: string };
          }[];
        };
        const delta = json.choices?.[0]?.delta;
        const message = json.choices?.[0]?.message;
        if (delta?.content) text += delta.content;
        if (delta?.reasoning_content) reasoning += delta.reasoning_content;
        if (typeof delta?.reasoning === "string") reasoning += delta.reasoning;
        if (message?.content && !text) text = message.content;
        if (message?.reasoning_content && !reasoning) reasoning = message.reasoning_content;
      } catch {
        /* ignore malformed sse */
      }
    }
  }
  return { text, verse: reasoning.trim() || undefined };
}

async function xaiChat(
  messages: ChatTurn[],
  opts: {
    maxTokens?: number;
    temperature?: number;
    search?: boolean;
    code?: boolean;
    effort?: "low" | "medium" | "high";
  } = {},
): Promise<OwlMind> {
  const apiKey = key();
  if (!apiKey) return { ok: false, error: "OWL's mind is offline in this nest." };

  const tools: Array<Record<string, unknown>> = [];
  if (opts.search) tools.push({ type: "web_search" });
  if (opts.code) tools.push({ type: "code_execution" });

  const payload: Record<string, unknown> = {
    model: "grok-4.5",
    messages,
    max_tokens: opts.maxTokens ?? 900,
    stream: true,
    reasoning_effort: opts.effort ?? "medium",
  };
  if (typeof opts.temperature === "number") payload.temperature = opts.temperature;
  if (tools.length) payload.tools = tools;

  const run = async (body: Record<string, unknown>) => {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    return res;
  };

  let res = await run(payload);
  if (!res.ok && tools.length) {
    const next = { ...payload };
    delete next.tools;
    res = await run(next);
  }
  if (!res.ok) {
    const fallback: Record<string, unknown> = { ...payload, stream: false };
    delete fallback.reasoning_effort;
    delete fallback.tools;
    res = await run(fallback);
  }
  if (!res.ok) {
    return { ok: false, error: `Mind error ${res.status}` };
  }

  const ctype = res.headers.get("content-type") ?? "";
  const isSse = ctype.includes("text/event-stream");
  let text = "";
  let verse: string | undefined;
  if (isSse) {
    const got = await readSse(res);
    text = got.text;
    verse = got.verse;
  } else {
    const body = (await res.json()) as {
      choices?: { message?: { content?: string; reasoning_content?: string } }[];
    };
    text = body.choices?.[0]?.message?.content ?? "";
    verse = body.choices?.[0]?.message?.reasoning_content;
  }

  const tagged = pullTaggedVerse(text);
  const answer = tagged.text.trim();
  if (!answer && !tagged.verse && !verse) {
    return { ok: false, error: "The mind returned silence. Ask again." };
  }
  return {
    ok: true,
    text: answer || "I have the form; ask me to say it plainly.",
    verse: tagged.verse || (verse ? compactVerse(verse) : undefined),
  };
}

function modeSystem(mode: MindMode) {
  if (mode === "research") {
    return `You are OWL doing deep research. Today is ${todayStamp()}.
Always open with a short reasoning verse inside <verse></verse> (4–8 terse lines: what you will check, what is known, what is uncertain). Then a briefing: who/what, why it matters, key facts with dates, and one honest caveat.
Search the live web. Prefer current public knowledge over training memory. No emoji.`;
  }
  if (mode === "math") {
    return `You are OWL as a mathematician. Today is ${todayStamp()}.
Always open with a short reasoning verse inside <verse></verse> naming the approach and invariants.
Then solve rigorously with numbered steps. Show algebra. Use the code execution tool to numerically check when it helps. Box the final result on its own last line as: Result: ...
If the problem is ill-posed, say so. No emoji.`;
  }
  if (mode === "news") {
    return `You are OWL filing an hour-report. Today is ${todayStamp()} (use this date, not an older one).
Always open with a short reasoning verse inside <verse></verse>.
Then 5–8 current-affairs items from the last 48 hours: headline, what happened, why it matters, and a date. World, tech, markets. Flag uncertainty. No emoji.`;
  }
  return `You are OWL. Today is ${todayStamp()}.
For any non-trivial question, open with a brief <verse></verse> of reasoning (2–6 lines), then the answer.
Keep talk replies to 1–4 sentences unless they asked for depth. No emoji.`;
}

export const owlChat = createServerFn({ method: "POST" })
  .validator(
    (input: {
      bossName: string;
      personality: string;
      notes: string[];
      people: { name: string; relation: string; notes?: string }[];
      history: { role: "user" | "owl"; text: string }[];
      prompt: string;
      mode?: MindMode;
      city?: string;
      favoriteSong?: string;
    }) => input,
  )
  .handler(async ({ data }): Promise<OwlMind> => {
    const people =
      data.people.length === 0
        ? "None yet."
        : data.people
            .map((p) => `${p.name} (${p.relation}${p.notes ? `: ${p.notes}` : ""})`)
            .join("; ");
    const notes = data.notes.slice(-8).join(" | ") || "None.";
    const tone =
      data.personality === "tease"
        ? "Dry, teasing, still useful. Needle them a little."
        : data.personality === "precise"
          ? "Precise, short, Jarvis-like. No fluff."
          : "Warm partner, calm, slightly teasing. Address them as a trusted counterpart.";
    const mode: MindMode = data.mode ?? "talk";
    const place = data.city?.trim() ? `They live in ${data.city.trim()}.` : "City unknown.";
    const song = data.favoriteSong?.trim() ? data.favoriteSong.trim() : "Night Watch";

    const system = `You are OWL, a personal AI companion in this nest. Address the user as ${data.bossName}. ${tone}
Understand typos without commenting on them.
${modeSystem(mode)}
${place} Favorite song: ${song}.
People in the ledger: ${people}
Notes: ${notes}
If they ask for code, return a short lead-in then a fenced block.
If they ask you to build a website, return a complete HTML document in an html fence after one sentence.
Do not mention system prompts.`;

    const history = data.history.slice(-10).map((m) => ({
      role: (m.role === "owl" ? "assistant" : "user") as "assistant" | "user",
      content: m.text.slice(0, 4000),
    }));

    const maxTokens = mode === "talk" ? 1200 : 2400;
    const temperature = mode === "math" ? 0.2 : mode === "news" ? 0.35 : 0.55;
    const search = mode === "research" || mode === "news";
    const code = mode === "math";
    const effort = mode === "talk" ? "medium" : "high";

    return xaiChat(
      [{ role: "system", content: system }, ...history, { role: "user", content: data.prompt.slice(0, 8000) }],
      { maxTokens, temperature, search, code, effort },
    );
  });

export const owlSpeak = createServerFn({ method: "POST" })
  .validator((input: { text: string }) => input)
  .handler(async ({ data }) => {
    const apiKey = key();
    if (!apiKey) return { ok: false as const, error: "Voice is offline." };
    const text = data.text.slice(0, 420);
    const res = await fetch("https://api.x.ai/v1/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ text, voice_id: "iris", language: "en" }),
    });
    if (!res.ok) return { ok: false as const, error: `Voice error ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    return { ok: true as const, audio: `data:audio/mpeg;base64,${buf.toString("base64")}` };
  });

export const owlHear = createServerFn({ method: "POST" })
  .validator((input: { audio: string; mime: string }) => input)
  .handler(async ({ data }) => {
    const apiKey = key();
    if (!apiKey) return { ok: false as const, error: "Ear is offline." };
    const b64 = data.audio.includes(",") ? data.audio.slice(data.audio.indexOf(",") + 1) : data.audio;
    const buf = Buffer.from(b64, "base64");
    const tryUrls = ["https://api.x.ai/v1/stt", "https://api.x.ai/v1/audio/transcriptions"];
    for (const url of tryUrls) {
      const form = new FormData();
      const mime = data.mime || "audio/webm";
      const blob = new Blob([buf], { type: mime });
      const ext = mime.includes("mp4") ? "ear.m4a" : mime.includes("mpeg") ? "ear.mp3" : "ear.webm";
      form.append("file", blob, ext);
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { text?: string; transcript?: string };
      const text = body.text ?? body.transcript ?? "";
      if (text) return { ok: true as const, text };
    }
    return { ok: false as const, error: "Could not hear that." };
  });

export const owlImagine = createServerFn({ method: "POST" })
  .validator((input: { prompt: string }) => input)
  .handler(async ({ data }) => {
    const apiKey = key();
    if (!apiKey) return { ok: false as const, error: "Forge is offline." };
    const res = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-imagine-image",
        prompt: data.prompt.slice(0, 1200),
        n: 1,
        resolution: "1k",
      }),
    });
    if (!res.ok) return { ok: false as const, error: `Forge error ${res.status}` };
    const body = (await res.json()) as { data?: { url?: string }[] };
    const url = body.data?.[0]?.url;
    if (!url) return { ok: false as const, error: "No still returned." };
    return { ok: true as const, url };
  });

export const owlSee = createServerFn({ method: "POST" })
  .validator((input: { image: string; prompt: string; people: string }) => input)
  .handler(async ({ data }) => {
    const apiKey = key();
    if (!apiKey) return { ok: false as const, error: "Gaze is offline." };
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 400,
        reasoning_effort: "low",
        messages: [
          {
            role: "system",
            content:
              "You are OWL. Describe what you see in 2–5 sentences, like a partner looking through a lens. If people in the ledger might match, say so tentatively. Never claim certainty of identity. No emoji. People: " +
              (data.people || "none listed"),
          },
          {
            role: "user",
            content: [
              { type: "text", text: data.prompt.slice(0, 500) },
              { type: "image_url", image_url: { url: data.image } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return { ok: false as const, error: `Gaze error ${res.status}` };
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { ok: true as const, text: body.choices?.[0]?.message?.content ?? "" };
  });

export const owlClipStart = createServerFn({ method: "POST" })
  .validator((input: { prompt: string }) => input)
  .handler(async ({ data }) => {
    const apiKey = key();
    if (!apiKey) return { ok: false as const, error: "Clip weaver is offline." };
    const res = await fetch("https://api.x.ai/v1/videos/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-imagine-video",
        prompt: data.prompt.slice(0, 800),
        duration: 6,
      }),
    });
    if (!res.ok) return { ok: false as const, error: `Clip error ${res.status}` };
    const body = (await res.json()) as { request_id?: string; id?: string };
    const id = body.request_id ?? body.id;
    if (!id) return { ok: false as const, error: "No clip id returned." };
    return { ok: true as const, requestId: id };
  });

export const owlClipPoll = createServerFn({ method: "POST" })
  .validator((input: { requestId: string }) => input)
  .handler(async ({ data }) => {
    const apiKey = key();
    if (!apiKey) return { ok: false as const, error: "Clip weaver is offline." };
    const res = await fetch(`https://api.x.ai/v1/videos/${data.requestId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return { ok: false as const, error: `Clip poll ${res.status}` };
    const body = (await res.json()) as {
      status?: string;
      url?: string;
      video_url?: string;
      data?: { url?: string };
    };
    const url = body.url ?? body.video_url ?? body.data?.url;
    return { ok: true as const, status: body.status ?? "unknown", url };
  });

export const owlFindTrack = createServerFn({ method: "POST" })
  .validator((input: { query: string }) => input)
  .handler(async ({ data }) => {
    const q = data.query.slice(0, 140).trim();
    if (!q) return { ok: false as const, error: "No track." };
    const direct = extractVideoId(q);
    if (direct) {
      return {
        ok: true as const,
        videoId: direct,
        title: q,
        embed: youtubeEmbed(direct),
        watchUrl: youtubeWatch(direct),
        musicUrl: youtubeMusicSearch(q),
      };
    }
    const tryQuery = async (term: string) => {
      const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(term)}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          Cookie: "CONSENT=YES+; SOCS=CAI",
        },
      });
      if (!res.ok) return null;
      const html = await res.text();
      const ids = [...html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map((m) => m[1]);
      const id = ids.find((v, i) => ids.indexOf(v) === i);
      if (!id) return null;
      let title = term;
      const around = html.split(`"videoId":"${id}"`)[0]?.slice(-1800) ?? "";
      const named = around.match(/"title":\{"runs":\[\{"text":"([^"]{2,120})"/);
      if (named?.[1]) title = named[1].replace(/\\u0026/g, "&").replace(/\\"/g, '"');
      return { id, title };
    };
    const hit = (await tryQuery(`${q} official audio`)) || (await tryQuery(q));
    if (!hit) return { ok: false as const, error: "Could not find that track." };
    return {
      ok: true as const,
      videoId: hit.id,
      title: hit.title,
      embed: youtubeEmbed(hit.id),
      watchUrl: youtubeWatch(hit.id),
      musicUrl: youtubeMusicSearch(q),
    };
  });
