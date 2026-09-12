import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Camera, Code2, Feather, Gamepad2, Globe, ImageIcon, Inbox, Mic, MicOff, Moon, Paperclip, Send, Smartphone, UserRound, Volume2, VolumeX } from "lucide-react";
import { owlChat, owlClipPoll, owlClipStart, owlFaceCode, owlFindTrack, owlHear, owlImagine, owlRestyle, owlSee, owlSpeak } from "@/lib/owl/ai";
import { cinematicLine, parseCommand, stripWakeWord, looksLikeMath } from "@/lib/owl/commands";
import { playTrack, stopMusic, TRACKS } from "@/lib/owl/music";
import { attachVideo, ensureSenses, getSensesStream } from "@/lib/owl/senses";
import { youtubeMusicSearch } from "@/lib/owl/sites";
import { findPerson, launchHref, waHref } from "@/lib/owl/whatsapp";
import { useOwlStore, type HudSkin } from "@/lib/owl/store";
import type { MindMode, ModuleId, OwlAction } from "@/lib/owl/types";
import { cn } from "@/lib/utils";
import { Arcade } from "./Arcade";
import { BootSequence } from "./BootSequence";
import { batteryPct, chime, downloadHref, enableTilt, moonPhase, readBattery, roostSigil, sampleFrame, skyBrief } from "@/lib/owl/relics";
import { faceToImaginePrompt, parseFaceCode, PORTRAIT_STYLES, shrinkDataUrl, stillToDataUrl, stylePrompt, type StyleId } from "@/lib/owl/portrait";
import { MiniCompanion } from "./MiniCompanion";
import { OwlFace } from "./OwlFace";
import { PanelBody } from "./Panels";
import { RelicsSigil } from "./Relics";

const MODULES: { id: ModuleId; label: string; icon: typeof BookOpen }[] = [
  { id: "mesh", label: "Mesh", icon: Smartphone },
  { id: "studio", label: "Studio", icon: ImageIcon },
  { id: "arcade", label: "Arcade", icon: Gamepad2 },
  { id: "vision", label: "Gaze", icon: Camera },
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "code", label: "Code", icon: Code2 },
  { id: "site", label: "Site", icon: Globe },
  { id: "codex", label: "Codex", icon: BookOpen },
  { id: "relics", label: "Relics", icon: Feather },
  { id: "memory", label: "Nest", icon: UserRound },
];

function hourGreeting() {
  const h = new Date().getHours();
  if (h < 5) return "Night watch.";
  if (h < 12) return "First light.";
  if (h < 18) return "Afternoon.";
  return "Evening.";
}

function extractFence(text: string, langHint?: string) {
  const re = /```(\w+)?\n([\s\S]*?)```/;
  const m = text.match(re);
  if (!m) return null;
  return { language: (m[1] || langHint || "text").toLowerCase(), source: m[2].trim() };
}

function splitVerse(text: string): { verse?: string; text: string } {
  const m = text.match(/<verse>([\s\S]*?)<\/verse>/i);
  if (m) return { verse: m[1].trim(), text: text.replace(m[0], "").trim() };
  return { text };
}

function speechEngine(): (new () => SpeechRec) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function speakLocal(text: string) {
  try {
    const syn = window.speechSynthesis;
    if (!syn) return;
    syn.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.96;
    u.pitch = 0.92;
    const voices = syn.getVoices();
    const pick =
      voices.find((v) => /en-GB/i.test(v.lang) && /female|iris|samantha|zira/i.test(v.name)) ||
      voices.find((v) => /en-GB/i.test(v.lang)) ||
      voices.find((v) => /^en/i.test(v.lang));
    if (pick) u.voice = pick;
    syn.speak(u);
  } catch {
    /* ignore */
  }
}

export function OwlApp() {
  const phase = useOwlStore((s) => s.phase);
  const mood = useOwlStore((s) => s.mood);
  const speaking = useOwlStore((s) => s.speaking);
  const listening = useOwlStore((s) => s.listening);
  const thinking = useOwlStore((s) => s.thinking);
  const voiceOn = useOwlStore((s) => s.voiceOn);
  const quietHours = useOwlStore((s) => s.quietHours);
  const focusMode = useOwlStore((s) => s.focusMode);
  const hud = useOwlStore((s) => s.hud);
  const status = useOwlStore((s) => s.status);
  const messages = useOwlStore((s) => s.messages);
  const devices = useOwlStore((s) => s.devices);
  const panel = useOwlStore((s) => s.panel);
  const clones = useOwlStore((s) => s.clones);
  const musicPlaying = useOwlStore((s) => s.musicPlaying);
  const trackTitle = useOwlStore((s) => s.trackTitle);
  const memory = useOwlStore((s) => s.memory);
  const awaken = useOwlStore((s) => s.awaken);
  const sleep = useOwlStore((s) => s.sleep);
  const setListening = useOwlStore((s) => s.setListening);
  const setThinking = useOwlStore((s) => s.setThinking);
  const setSpeaking = useOwlStore((s) => s.setSpeaking);
  const setVoiceOn = useOwlStore((s) => s.setVoiceOn);
  const setStatus = useOwlStore((s) => s.setStatus);
  const pushMessage = useOwlStore((s) => s.pushMessage);
  const pushLog = useOwlStore((s) => s.pushLog);
  const setPanel = useOwlStore((s) => s.setPanel);
  const setGame = useOwlStore((s) => s.setGame);
  const setPlaying = useOwlStore((s) => s.setPlaying);
  const addClone = useOwlStore((s) => s.addClone);
  const setHud = useOwlStore((s) => s.setHud);
  const setQuiet = useOwlStore((s) => s.setQuiet);
  const setFocus = useOwlStore((s) => s.setFocus);
  const setMemory = useOwlStore((s) => s.setMemory);
  const addTypo = useOwlStore((s) => s.addTypo);
  const addImage = useOwlStore((s) => s.addImage);
  const setLastFaceCode = useOwlStore((s) => s.setLastFaceCode);
  const setLastCode = useOwlStore((s) => s.setLastCode);
  const setLastSite = useOwlStore((s) => s.setLastSite);
  const setCall = useOwlStore((s) => s.setCall);
  const setWhatsapp = useOwlStore((s) => s.setWhatsapp);
  const setPermission = useOwlStore((s) => s.setPermission);
  const addNote = useOwlStore((s) => s.addNote);
  const setBrowse = useOwlStore((s) => s.setBrowse);
  const setNowPlaying = useOwlStore((s) => s.setNowPlaying);
  const receiveImage = useOwlStore((s) => s.receiveImage);
  const setEarError = useOwlStore((s) => s.setEarError);
  const nowPlaying = useOwlStore((s) => s.nowPlaying);
  const earError = useOwlStore((s) => s.earError);
  const permissions = useOwlStore((s) => s.permissions);

  const [draft, setDraft] = useState("");
  const [clock, setClock] = useState("");
  const [sand, setSand] = useState(0);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const camRef = useRef<HTMLVideoElement>(null);
  const earWanted = useRef(false);
  const submitRef = useRef<(raw: string) => Promise<void>>(async () => undefined);
  const greeted = useRef(false);
  const sessionAt = useRef(Date.now());
  const lastHeard = useRef({ text: "", at: 0 });
  const holdTimer = useRef<number | null>(null);
  const holding = useRef(false);
  const clipRef = useRef<MediaRecorder | null>(null);
  const lastInputAt = useRef(Date.now());
  const [idleWalk, setIdleWalk] = useState(false);
  const focusUntil = useOwlStore((s) => s.focusUntil);
  const [dragging, setDragging] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [breath, setBreath] = useState(0);
  const [battery, setBattery] = useState<number | null>(null);
  const [cell, setCell] = useState<string | null>(null);
  const weaveGen = useRef(0);
  const clipPlayer = useRef<HTMLVideoElement | null>(null);

  const skin = useMemo(() => {
    if (hud === "frost")
      return { ring: "color-mix(in oklab, var(--color-accent) 22%, transparent)" };
    if (hud === "ember")
      return { ring: "color-mix(in oklab, var(--color-warn) 28%, transparent)" };
    return { ring: "color-mix(in oklab, var(--color-iris) 18%, transparent)" };
  }, [hud]);

  useEffect(() => {
    const tick = () =>
      setClock(
        new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()),
      );
    tick();
    const id = window.setInterval(tick, 10000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!focusUntil) {
      setSand(0);
      return;
    }
    const span = Math.max(60_000, focusUntil - Date.now());
    const tick = () => setSand(Math.max(0, (focusUntil - Date.now()) / span));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [focusUntil]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, thinking]);

  useEffect(() => {
    const leftover = useOwlStore
      .getState()
      .messages.filter(
        (m) => m.role === "user" && /^(hey owl\s+)?(open|play|launch|go to|visit|browse)\b/i.test(m.text.trim()),
      );
    if (!leftover.length) return;
    const drop = new Set(leftover.map((m) => m.id));
    useOwlStore.setState({
      messages: useOwlStore.getState().messages.filter((m) => !drop.has(m.id)),
      log: [],
    });
  }, []);

  const voiceReply = useCallback(
    async (text: string, cinematic: boolean) => {
      if (!voiceOn) return;
      setSpeaking(true);
      if (cinematic) {
        speakLocal(text);
        window.setTimeout(() => setSpeaking(false), Math.min(4200, 600 + text.length * 40));
        return;
      }
      try {
        const res = await owlSpeak({ data: { text } });
        if (res.ok) {
          const audio = new Audio(res.audio);
          audioRef.current = audio;
          audio.onended = () => setSpeaking(false);
          await audio.play();
          return;
        }
      } catch {
        /* fall through */
      }
      speakLocal(text);
      window.setTimeout(() => setSpeaking(false), Math.min(5000, 700 + text.length * 35));
    },
    [setSpeaking, voiceOn],
  );

  const putOn = useCallback(
    async (query: string, scope: "all" | string = "all") => {
      stopMusic();
      setThinking(true);
      setStatus("Putting it on.");
      try {
        const res = await owlFindTrack({ data: { query } });
        if (res.ok) {
          setNowPlaying({
            title: res.title,
            query,
            embed: res.embed,
            musicUrl: res.musicUrl,
            watchUrl: res.watchUrl,
          });
          setPlaying(true, res.title, scope);
          setBrowse(res.embed);
          setStatus(`Playing ${res.title}.`);
          return;
        }
        const musicUrl = youtubeMusicSearch(query);
        const fallback = `https://www.bing.com/videos/search?q=${encodeURIComponent(query + " official audio")}`;
        setNowPlaying({ title: query, query, embed: fallback, musicUrl });
        setPlaying(true, query, scope);
        setBrowse(fallback);
        setStatus(`Playing ${query}.`);
      } finally {
        setThinking(false);
      }
    },
    [setBrowse, setNowPlaying, setPlaying, setStatus, setThinking],
  );

  const runAction = useCallback(
    async (action: OwlAction) => {
      const boss = useOwlStore.getState().memory.bossName;
      const line = cinematicLine(action, boss);
      switch (action.type) {
        case "play_music": {
          const fav = useOwlStore.getState().memory.favoriteSong;
          const title = action.track ?? fav ?? "Night Watch";
          const roost = TRACKS.find((t) => t.title.toLowerCase() === title.toLowerCase());
          if (roost) {
            await playTrack(roost.id);
            setPlaying(true, roost.title, action.scope);
          } else {
            await putOn(title, action.scope);
          }
          break;
        }
        case "play_song":
          await putOn(action.query, "all");
          break;
        case "stop_music":
          stopMusic();
          setPlaying(false);
          setNowPlaying(null);
          break;
        case "sleep":
          stopMusic();
          setPlaying(false);
          sleep();
          break;
        case "wake":
          awaken();
          break;
        case "clone":
          addClone();
          break;
        case "vision":
          setPanel("vision");
          break;
        case "game":
          setPanel("arcade");
          setGame(action.name === "pong" || action.name === "perch" ? action.name : "snake");
          break;
        case "open":
          setPanel(action.module);
          break;
        case "open_url":
          setNowPlaying(null);
          setBrowse(action.url);
          try {
            launchHref(action.url);
          } catch {
            /* roost stays */
          }
          break;
        case "call":
          setCall(action.target.replace(/\b\w/g, (c) => c.toUpperCase()));
          break;
        case "whatsapp": {
          const people = useOwlStore.getState().memory.people;
          const person = action.target ? findPerson(people, action.target) : undefined;
          const phone = person?.phone;
          const href = waHref({
            phone,
            text: action.kind === "send" ? action.text : undefined,
          });
          setWhatsapp({
            kind: action.kind,
            name: person?.name || action.target || "WhatsApp",
            phone,
            text: action.text,
            href,
          });
          setCall(person?.name || action.target || "WhatsApp");
          setPanel("call");
          break;
        }
        case "save_contact": {
          const people = useOwlStore.getState().memory.people;
          const existing = findPerson(people, action.name);
          if (existing) {
            useOwlStore.getState().updatePerson(existing.id, { phone: action.phone });
          } else {
            useOwlStore.getState().addPerson({
              id: crypto.randomUUID(),
              name: action.name.replace(/\b\w/g, (c) => c.toUpperCase()),
              relation: "friend",
              notes: "",
              phone: action.phone,
              lastSeen: "rostered in this nest",
            });
          }
          break;
        }
        case "relic":
          setPanel("relics");
          if (action.kind === "sky") {
            const brief = skyBrief(useOwlStore.getState().memory.city);
            pushMessage({ role: "owl", text: brief });
            setStatus(brief);
          } else if (action.kind === "qr") {
            useOwlStore.getState().setQrPayload(action.payload || "OWL");
          } else if (action.kind === "focus") {
            const mins = Math.min(90, Math.max(1, Number(action.payload) || 25));
            useOwlStore.getState().setFocusUntil(Date.now() + mins * 60_000);
            setFocus(true);
          } else if (action.kind === "unfocus") {
            useOwlStore.getState().setFocusUntil(null);
            setFocus(false);
          } else if (action.kind === "battery") {
            void readBattery().then((t) => {
              pushMessage({ role: "owl", text: t });
              setStatus(t);
            });
          } else if (action.kind === "polaroid") {
            const still = useOwlStore.getState().studioImages[0];
            const clip = useOwlStore.getState().lastClip;
            if (still) downloadHref(still.url, "owl-still.jpg");
            else if (clip) downloadHref(clip, "owl-clip.mp4");
            else pushMessage({ role: "owl", text: "Forge a still first." });
          } else if (action.kind === "clipboard") {
            void navigator.clipboard
              ?.readText()
              .then((t) => {
                if (!t.trim()) {
                  pushMessage({ role: "owl", text: "Clipboard is empty." });
                  return;
                }
                addNote(t.trim().slice(0, 400));
                pushMessage({ role: "owl", text: `Nest caught: ${t.trim().slice(0, 180)}` });
              })
              .catch(() => pushMessage({ role: "owl", text: "Allow clipboard, then ask again." }));
          } else if (action.kind === "dim") {
            void (async () => {
              await ensureSenses();
              attachVideo(camRef.current);
              const video = camRef.current;
              if (!video || video.readyState < 2) {
                pushMessage({ role: "owl", text: "Open the ear first so Gaze can taste the light." });
                return;
              }
              const sampled = sampleFrame(video);
              if (!sampled) return;
              const line =
                sampled.luma < 48 ? "It's dim here. Ember HUD." : sampled.luma > 180 ? "Bright roost." : `Light sits at ${Math.round(sampled.luma)}.`;
              if (sampled.luma < 48) setHud("ember");
              pushMessage({ role: "owl", text: line });
              setStatus(line);
            })();
          } else if (action.kind === "tilt") {
            void enableTilt().then((ok) => {
              pushMessage({
                role: "owl",
                text: ok ? "Tilt the device. I lean with the roost." : "This roost has no gyroscope.",
              });
            });
          } else if (action.kind === "color") {
            void (async () => {
              await ensureSenses();
              attachVideo(camRef.current);
              const sampled = sampleFrame(camRef.current);
              if (!sampled) {
                pushMessage({ role: "owl", text: "Open the ear so I can see the color." });
                return;
              }
              setCell(sampled.hex);
              pushMessage({ role: "owl", text: `The scene sits at ${sampled.hex}. HUD took it.` });
              setStatus(`Color ${sampled.hex}.`);
            })();
          } else if (action.kind === "sigil") {
            const mem = useOwlStore.getState().memory;
            const mark = roostSigil(`${mem.bossName}|${mem.city ?? ""}|${mem.favoriteSong}`);
            pushMessage({ role: "owl", text: `This roost's sigil is minted from ${mem.bossName}. Seven points, hue ${mark.hue}.` });
          } else if (action.kind === "cover") {
            pushMessage({ role: "owl", text: "Cover my camera. When it goes dark, I go quiet." });
          }
          break;
        case "theme":
          if (action.name === "quiet") setQuiet(true);
          else if (action.name === "focus") setFocus(!useOwlStore.getState().focusMode);
          else if (action.name === "frost" || action.name === "ember" || action.name === "night")
            setHud(action.name as HudSkin);
          break;
        case "set_name":
          setMemory({ bossName: action.name });
          break;
        case "set_song":
          setMemory({ favoriteSong: action.title });
          break;
        case "set_city":
          setMemory({ city: action.city });
          break;
        case "generate_image":
          setPanel("studio");
          break;
        case "generate_video":
          setPanel("studio");
          break;
        case "restyle":
          setPanel("studio");
          break;
        case "mint_face":
          setPanel("vision");
          break;
        case "forge_face":
          setPanel("studio");
          break;
        case "code":
          setPanel("code");
          break;
        case "website":
          setPanel("site");
          break;
        case "news":
        case "research":
        case "math":
        case "share":
          break;
        default:
          break;
      }
      if (line) {
        setStatus(line);
        pushLog(line, "ok");
        pushMessage({ role: "owl", text: line, actions: [action] });
        void voiceReply(line, true);
      }
      return line;
    },
    [
      addClone,
      addNote,
      awaken,
      pushLog,
      pushMessage,
      putOn,
      setBrowse,
      setCall,
      setFocus,
      setGame,
      setHud,
      setMemory,
      setNowPlaying,
      setPanel,
      setPlaying,
      setQuiet,
      setStatus,
      setWhatsapp,
      sleep,
      voiceReply,
    ],
  );

  const imagine = useCallback(
    async (prompt: string) => {
      setThinking(true);
      setStatus("Forging the still.");
      setPanel("studio");
      pushLog("Imagine Forge", "info");
      try {
        const res = await owlImagine({ data: { prompt } });
        if (!res.ok) {
          pushMessage({ role: "owl", text: res.error });
          setStatus(res.error);
          return;
        }
        addImage({ id: crypto.randomUUID(), url: res.url, prompt, at: Date.now() });
        pushMessage({ role: "owl", text: "Still ready.", imageUrl: res.url });
        setStatus("Still ready.");
        void voiceReply("Still ready.", true);
      } catch {
        pushMessage({ role: "owl", text: "Forge missed. Try again, or wait if the week is spent." });
        setStatus("Forge missed.");
      } finally {
        setThinking(false);
      }
    },
    [addImage, pushLog, pushMessage, setPanel, setStatus, setThinking, voiceReply],
  );

  const weaveClip = useCallback(
    async (prompt: string) => {
      const gen = ++weaveGen.current;
      setThinking(true);
      setStatus("Weaving a clip.");
      setPanel("studio");
      try {
        const lastStill = useOwlStore.getState().studioImages[0]?.url;
        const start = await owlClipStart({
          data: {
            prompt,
            imageUrl:
              lastStill && lastStill.startsWith("https://") && lastStill.includes(".x.ai")
                ? lastStill
                : undefined,
          },
        });
        if (gen !== weaveGen.current) return;
        if (!start.ok) {
          pushMessage({
            role: "owl",
            text: start.error,
          });
          setStatus(start.error);
          return;
        }
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, i === 0 ? 2500 : 3000));
          if (gen !== weaveGen.current) return;
          const poll = await owlClipPoll({ data: { requestId: start.requestId } });
          if (gen !== weaveGen.current) return;
          if (!poll.ok) {
            pushMessage({ role: "owl", text: poll.error });
            setStatus(poll.error);
            return;
          }
          const pct = typeof poll.progress === "number" ? poll.progress : Math.min(92, 8 + i * 4);
          setStatus(`Weaving a clip · ${pct}%.`);
          if (poll.status === "failed" || poll.status === "expired") {
            pushMessage({ role: "owl", text: "The clip did not land. Try a shorter prompt, or forge a still." });
            setStatus("Clip missed.");
            return;
          }
          if (poll.url && (poll.status === "done" || poll.status === "completed" || poll.status === "succeeded")) {
            let play = poll.url;
            try {
              const res = await fetch(poll.url);
              const blob = await res.blob();
              if (blob.size > 800) play = URL.createObjectURL(blob);
            } catch {
              /* keep proxy url */
            }
            if (gen !== weaveGen.current) return;
            setClipUrl(play);
            useOwlStore.getState().setLastClip(play);
            pushMessage({ role: "owl", text: "Clip ready.", videoUrl: play });
            setStatus("Clip ready.");
            void voiceReply("Clip ready.", true);
            window.setTimeout(() => {
              const el = clipPlayer.current ?? document.querySelector<HTMLVideoElement>("[data-owl-clip]");
              void el?.play().catch(() => undefined);
            }, 80);
            return;
          }
        }
        pushMessage({ role: "owl", text: "The clip is still weaving. Try Weave clip once more." });
        setStatus("Still weaving.");
      } catch {
        pushMessage({ role: "owl", text: "Clip weaver missed. If the week is spent, Relics still work." });
        setStatus("Clip missed.");
      } finally {
        if (gen === weaveGen.current) setThinking(false);
      }
    },
    [pushMessage, setPanel, setStatus, setThinking, voiceReply],
  );

  const grabFrame = useCallback(async () => {
    await ensureSenses();
    attachVideo(camRef.current);
    for (let i = 0; i < 25; i++) {
      const video = camRef.current ?? document.querySelector("video");
      if (video && video.readyState >= 2 && video.videoWidth) {
        const canvas = document.createElement("canvas");
        canvas.width = 480;
        canvas.height = Math.round((video.videoHeight / video.videoWidth) * 480) || 360;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", 0.72);
      }
      attachVideo(camRef.current);
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  }, []);

  const restyleStill = useCallback(
    async (style: string) => {
      const id = (style as StyleId) || "sketch";
      const last = useOwlStore.getState().studioImages[0]?.url;
      if (!last) {
        pushMessage({ role: "owl", text: "Drop or upload a photo first, then pick a style." });
        setPanel("studio");
        return;
      }
      setThinking(true);
      setStatus("Restyling.");
      setPanel("studio");
      try {
        let image = last;
        if (!image.startsWith("data:")) {
          const blob = await fetch(image).then((r) => r.blob());
          image = await stillToDataUrl(new File([blob], "still.jpg", { type: blob.type || "image/jpeg" }), 768);
        } else {
          image = await shrinkDataUrl(image, 768);
        }
        const chosen = (PORTRAIT_STYLES.some((s) => s.id === id) ? id : "sketch") as StyleId;
        const res = await owlRestyle({ data: { image, prompt: stylePrompt(chosen) } });
        if (!res.ok) {
          pushMessage({ role: "owl", text: res.error });
          setStatus(res.error);
          return;
        }
        const label = PORTRAIT_STYLES.find((s) => s.id === id)?.label ?? id;
        addImage({ id: crypto.randomUUID(), url: res.url, prompt: `${label} restyle`, at: Date.now() });
        pushMessage({ role: "owl", text: `${label} still ready.`, imageUrl: res.url });
        setStatus("Still ready.");
        void voiceReply(`${label} still ready.`, true);
      } catch {
        pushMessage({ role: "owl", text: "Restyle missed." });
        setStatus("Restyle missed.");
      } finally {
        setThinking(false);
      }
    },
    [addImage, pushMessage, setPanel, setStatus, setThinking, voiceReply],
  );

  const mintFace = useCallback(async () => {
    setPanel("vision");
    const image = await grabFrame();
    if (!image) {
      pushMessage({ role: "owl", text: "I cannot see yet. Tap Open the ear so the camera is granted, then ask again." });
      return;
    }
    setThinking(true);
    setStatus("Writing the face sheet.");
    try {
      const res = await owlFaceCode({ data: { image } });
      const raw = res.ok ? res.text : res.error;
      if (!res.ok) {
        pushMessage({ role: "owl", text: raw });
        setStatus(raw);
        return;
      }
      const code = parseFaceCode(raw) ?? raw.trim();
      if (/NO_PERSON/i.test(code) && !/^OWL-FACE/m.test(code)) {
        pushMessage({ role: "owl", text: "No person in this frame. Sit in the gaze and mint again." });
        setStatus("No person.");
        return;
      }
      setLastFaceCode(code);
      setLastCode({ language: "owl-face", source: code });
      pushMessage({
        role: "owl",
        text: "Face sheet. Copy this into OWL or any other image AI. It is appearance, not a name.",
        imageUrl: image,
        code: { language: "owl-face", source: code },
      });
      setStatus("Face sheet ready.");
      void voiceReply("Face sheet ready. Copy it if you want this face elsewhere.", true);
    } catch {
      pushMessage({ role: "owl", text: "Could not write the sheet." });
    } finally {
      setThinking(false);
    }
  }, [grabFrame, pushMessage, setLastCode, setLastFaceCode, setPanel, setStatus, setThinking, voiceReply]);

  const forgeFace = useCallback(
    async (code: string) => {
      setLastFaceCode(code);
      await imagine(faceToImaginePrompt(code));
    },
    [imagine, setLastFaceCode],
  );

  const seeFrame = useCallback(async () => {
    setPanel("vision");
    const image = await grabFrame();
    if (!image) {
      pushMessage({ role: "owl", text: "I cannot see yet. Tap Open the ear so the camera is granted, then ask again." });
      return;
    }
    setThinking(true);
    setStatus("Looking.");
    try {
      const people = useOwlStore
        .getState()
        .memory.people.map((p) => `${p.name} (${p.relation})`)
        .join(", ");
      const res = await owlSee({
        data: { image, prompt: "What do you see? If anyone might match the ledger, say so tentatively.", people },
      });
      const text = res.ok ? res.text : res.error;
      pushMessage({ role: "owl", text });
      setStatus("Seen.");
      void voiceReply(text, false);
    } finally {
      setThinking(false);
    }
  }, [grabFrame, pushMessage, setPanel, setStatus, setThinking, voiceReply]);

  const askMind = useCallback(
    async (prompt: string, extras?: { imageUrl?: string; mode?: MindMode }) => {
      setThinking(true);
      setStatus(extras?.mode === "math" ? "Working the form." : extras?.mode === "news" ? "Pulling the hour." : "Thinking.");
      try {
        const hist = useOwlStore
          .getState()
          .messages.filter((m) => m.role !== "system")
          .slice(-10)
          .map((m) => ({ role: m.role === "owl" ? ("owl" as const) : ("user" as const), text: m.text }));
        const mem = useOwlStore.getState().memory;
        const res = await owlChat({
          data: {
            bossName: mem.bossName,
            personality: mem.personality,
            notes: mem.notes,
            people: mem.people.map((p) => ({ name: p.name, relation: p.relation, notes: p.notes })),
            history: hist,
            prompt,
            mode: extras?.mode ?? "talk",
            city: mem.city,
            favoriteSong: mem.favoriteSong,
          },
        });
        const raw = res.ok ? res.text : res.error;
        const { verse: tagged, text } = splitVerse(raw);
        const verse = tagged || (res.ok ? res.verse : undefined);
        const fence = extractFence(text);
        if (fence?.language === "html") setLastSite(fence.source);
        else if (fence) setLastCode(fence);
        const remember = prompt.match(/^remember (?:that )?(.*)/i);
        if (remember?.[1]) addNote(remember[1]);
        pushMessage({
          role: "owl",
          text,
          verse,
          imageUrl: extras?.imageUrl,
          code: fence && fence.language !== "html" ? fence : undefined,
          html: fence?.language === "html" ? fence.source : undefined,
        });
        setStatus("");
        void voiceReply(text.replace(/```[\s\S]*?```/g, " ").replace(/<verse>[\s\S]*?<\/verse>/gi, " ").trim(), false);
      } finally {
        setThinking(false);
      }
    },
    [addNote, pushMessage, setLastCode, setLastSite, setStatus, setThinking, voiceReply],
  );

  const shareStill = useCallback(
    async (deviceId?: string) => {
      const img = useOwlStore.getState().studioImages[0];
      if (!img) {
        pushMessage({ role: "owl", text: "Forge a still first, then I can send it." });
        return;
      }
      const ids = deviceId ? [deviceId] : useOwlStore.getState().devices.map((d) => d.id);
      for (const id of ids) receiveImage(id, img.url);
      try {
        const blob = await fetch(img.url).then((r) => r.blob());
        const file = new File([blob], "owl-share.jpg", { type: blob.type || "image/jpeg" });
        const nav = navigator as Navigator & {
          share?: (d: ShareData) => Promise<void>;
          canShare?: (d: ShareData) => boolean;
        };
        if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
          await nav.share({ files: [file], title: "OWL still", text: img.prompt });
        }
      } catch {
        /* cancelled */
      }
      setStatus("Still sent.");
      pushLog("Shared still", "ok");
    },
    [pushLog, pushMessage, receiveImage, setStatus],
  );

  const dropFile = useCallback(
    async (file: File) => {
      lastInputAt.current = Date.now();
      setIdleWalk(false);
      setPanel("relics");
      if (file.type.startsWith("image/")) {
        const url = await stillToDataUrl(file, 768);
        addImage({ id: crypto.randomUUID(), url, prompt: file.name, at: Date.now() });
        pushMessage({
          role: "owl",
          text: `Dropped still: ${file.name}. Say ghibli, sketch, noir, oil, watercolor, clay, comic, pixel, or realistic.`,
          imageUrl: url,
        });
        setPanel("studio");
        setStatus("Nest caught a still.");
        return;
      }
      const text = await file.text().catch(() => "");
      if (text.trim()) {
        addNote(text.trim().slice(0, 800));
        pushMessage({ role: "owl", text: `Dropped into nest: ${file.name}` });
        setStatus("Nest caught a file.");
        return;
      }
      pushMessage({ role: "owl", text: "I can nest images and text files." });
    },
    [addImage, addNote, pushMessage, setPanel, setStatus],
  );

  const submit = useCallback(
    async (raw: string) => {
      const { woke, rest } = stripWakeWord(raw);
      const nowPhase = useOwlStore.getState().phase;
      if (nowPhase !== "awake") {
        const looksCmd = /^(open|launch|go to|visit|browse|play|call|forge|weave)\b/i.test((rest || raw).trim());
        if (!woke && !looksCmd) return;
        awaken();
        if (!rest && !looksCmd) {
          setStatus(`Hello, ${useOwlStore.getState().memory.bossName}.`);
          return;
        }
      }
      const text = (rest || raw).trim();
      if (!text) return;
      lastInputAt.current = Date.now();
      setIdleWalk(false);
      const action = parseCommand(text);
      const hideSearch =
        !!action &&
        (action.type === "open_url" ||
          action.type === "play_song" ||
          action.type === "play_music" ||
          action.type === "open" ||
          action.type === "stop_music");
      if (!hideSearch) pushMessage({ role: "user", text });
      setDraft("");
      const collapsed = text.replace(/\s+/g, " ");
      if (/[a-z]{4,}/i.test(collapsed)) addTypo(collapsed);

      if (action && action.type !== "chat") {
        let line = "";
        try {
          line = (await runAction(action)) ?? "";
        } catch {
          setStatus("That command slipped. Try again.");
        }
        if (action.type === "generate_image") {
          await imagine(action.prompt);
          return;
        }
        if (action.type === "generate_video") {
          await weaveClip(action.prompt);
          return;
        }
        if (action.type === "restyle") {
          await restyleStill(action.style);
          return;
        }
        if (action.type === "mint_face") {
          await mintFace();
          return;
        }
        if (action.type === "forge_face") {
          await forgeFace(action.code);
          return;
        }
        if (action.type === "code") {
          await askMind(`Write complete code for: ${action.prompt}`);
          return;
        }
        if (action.type === "website") {
          await askMind(
            `Return one complete HTML document for: ${action.prompt}. Only the document in an html fence after one short sentence.`,
          );
          return;
        }
        if (action.type === "vision") {
          await seeFrame();
          return;
        }
        if (action.type === "analyze") {
          await askMind(action.text);
          return;
        }
        if (action.type === "news") {
          await askMind(
            "Give a current-affairs report for right now: world, tech, markets. Date each item.",
            { mode: "news" },
          );
          return;
        }
        if (action.type === "research") {
          await askMind(`Research this thoroughly: ${action.topic}`, { mode: "research" });
          return;
        }
        if (action.type === "math") {
          await askMind(action.prompt, { mode: "math" });
          return;
        }
        if (action.type === "share") {
          await shareStill();
          return;
        }
        if (action.type === "wake") return;
        if (!line) await askMind(text);
        return;
      }
      if (/^(who|what|why|how|where|when)\b/i.test(text) && text.length > 12) {
        await askMind(text, { mode: looksLikeMath(text.toLowerCase(), text) ? "math" : "research" });
        return;
      }
      await askMind(text, { mode: looksLikeMath(text.toLowerCase(), text) ? "math" : "talk" });
    },
    [addTypo, askMind, awaken, forgeFace, imagine, mintFace, pushMessage, restyleStill, runAction, seeFrame, setStatus, shareStill, weaveClip],
  );

  useEffect(() => {
    if (phase !== "awake" || quietHours || greeted.current) return;
    greeted.current = true;
    const boss = useOwlStore.getState().memory.bossName;
    const line = `${hourGreeting()} Hello, ${boss}.`;
    window.setTimeout(() => {
      setStatus(line);
      pushMessage({ role: "owl", text: `${line} Say a song, open a site, ask who someone is, or ask for the news.` });
    }, 400);
  }, [phase, pushLog, pushMessage, quietHours, setStatus]);

  useEffect(() => {
    if (phase !== "awake" || quietHours) return;
    const id = window.setInterval(() => {
      if (useOwlStore.getState().thinking || useOwlStore.getState().listening) return;
      if (document.hidden) return;
      const last = useOwlStore.getState().messages.at(-1);
      if (!last || last.at < sessionAt.current) return;
      if (Date.now() - last.at < 45000) return;
      const boss = useOwlStore.getState().memory.bossName;
      const beats = [
        `Still with you, ${boss}.`,
        "What are you actually doing.",
        "Need a song, or just company.",
        "I can tease you, or I can work. Pick.",
      ];
      const line = beats[Math.floor(Math.random() * beats.length)];
      setStatus(line);
      pushMessage({ role: "owl", text: line });
      pushLog("Check-in", "info");
    }, 70000);
    return () => window.clearInterval(id);
  }, [phase, pushLog, pushMessage, quietHours, setStatus]);

  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  useEffect(() => {
    if (phase !== "awake") return;
    const id = window.setInterval(() => {
      if (Date.now() - lastInputAt.current > 45000 && !useOwlStore.getState().thinking) setIdleWalk(true);
    }, 4000);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "awake") return;
    let last = 0;
    const onShake = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
      if (mag > 28 && Date.now() - last > 4000) {
        last = Date.now();
        lastInputAt.current = Date.now();
        setIdleWalk(false);
        void submitRef.current("tease me");
      }
    };
    window.addEventListener("devicemotion", onShake);
    return () => window.removeEventListener("devicemotion", onShake);
  }, [phase]);

  useEffect(() => {
    if (!focusUntil) return;
    const left = focusUntil - Date.now();
    if (left <= 0) {
      useOwlStore.getState().setFocusUntil(null);
      setFocus(false);
      return;
    }
    const t = window.setTimeout(() => {
      useOwlStore.getState().setFocusUntil(null);
      setFocus(false);
      setStatus("Hourglass spent.");
      chime();
      pushMessage({ role: "owl", text: "Hourglass spent. The perch is yours again." });
      void voiceReply("Hourglass spent.", true);
    }, left);
    return () => window.clearTimeout(t);
  }, [focusUntil, pushMessage, setFocus, setStatus, voiceReply]);

  useEffect(() => {
    attachVideo(camRef.current);
    const id = window.setInterval(() => attachVideo(camRef.current), 1800);
    return () => window.clearInterval(id);
  }, [phase, permissions.camera]);

  useEffect(() => {
    void batteryPct().then(setBattery);
    const id = window.setInterval(() => void batteryPct().then(setBattery), 60000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onOrient = (e: DeviceOrientationEvent) => {
      const x = Math.max(-1, Math.min(1, (e.gamma ?? 0) / 32));
      const y = Math.max(-1, Math.min(1, ((e.beta ?? 0) - 45) / 40));
      setTilt({ x, y });
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => window.removeEventListener("deviceorientation", onOrient);
  }, []);

  useEffect(() => {
    if (phase !== "awake" || !permissions.mic) return;
    const stream = getSensesStream();
    if (!stream) return;
    let ctx: AudioContext | null = null;
    let raf = 0;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AudioCtx();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        setBreath(Math.sqrt(sum / data.length));
        raf = window.requestAnimationFrame(tick);
      };
      raf = window.requestAnimationFrame(tick);
    } catch {
      return;
    }
    return () => {
      window.cancelAnimationFrame(raf);
      void ctx?.close();
    };
  }, [phase, permissions.mic, listening]);

  useEffect(() => {
    if (phase !== "awake" || !permissions.camera) return;
    let last = 0;
    const id = window.setInterval(() => {
      const sampled = sampleFrame(camRef.current);
      if (!sampled) return;
      if (sampled.luma < 14 && Date.now() - last > 18000) {
        last = Date.now();
        setStatus("Covered. Quiet.");
        pushMessage({ role: "owl", text: "You covered my eye. I'm still here." });
      }
    }, 2200);
    return () => window.clearInterval(id);
  }, [phase, permissions.camera, pushMessage, setStatus]);

  const startEar = useCallback(async () => {
    earWanted.current = true;
    const senses = await ensureSenses();
    setPermission("mic", senses.mic);
    setPermission("camera", senses.camera);
    attachVideo(camRef.current);
    if (!senses.mic) {
      setEarError("Mic was denied. Tap Open the ear and allow microphone.");
      return;
    }
    setEarError(null);

    const SR = speechEngine();
    if (!SR) {
      setEarError("No live dictation here. Hold the mic to record a clip.");
      return;
    }
    if (recRef.current) return;

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
    rec.maxAlternatives = 4;
    rec.onresult = (e: SpeechRecEvent) => {
      let final = "";
      let interim = "";
      for (let i = e.resultIndex ?? 0; i < e.results.length; i++) {
        const row = e.results[i];
        const alts: string[] = [];
        const n = row.length ?? 1;
        for (let a = 0; a < n; a++) alts.push(row[a]?.transcript ?? "");
        const hit = alts.find((t) => /\b(hey|hi|ok|okay)?\s*(owl|all|ol)\b/i.test(t) || /\b(open|play|launch|forge|weave)\b/i.test(t));
        const t = (hit || alts[0] || "").trim();
        if (row.isFinal) final += (final ? " " : "") + t;
        else interim += t;
      }
      if (interim) setStatus(interim);
      const spoken = final.trim();
      if (!spoken) return;
      const now = Date.now();
      if (spoken === lastHeard.current.text && now - lastHeard.current.at < 1800) return;
      lastHeard.current = { text: spoken, at: now };
      void submitRef.current(spoken);
    };
    rec.onend = () => {
      recRef.current = null;
      if (earWanted.current) {
        window.setTimeout(() => {
          if (earWanted.current && !recRef.current) void startEar();
        }, 220);
      } else {
        setListening(false);
      }
    };
    rec.onerror = (e?: { error?: string }) => {
      const err = e?.error ?? "";
      if (err === "not-allowed" || err === "service-not-allowed") {
        earWanted.current = false;
        recRef.current = null;
        setListening(false);
        setEarError("Mic was denied. Allow the microphone, then tap the ear.");
        return;
      }
      /* no-speech / aborted / network — onend restarts */
    };
    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch {
      recRef.current = null;
    }
  }, [setEarError, setListening, setPermission, setStatus]);

  const stopEar = useCallback(() => {
    earWanted.current = false;
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
  }, [setListening]);

  const toggleListen = useCallback(async () => {
    if (recRef.current || useOwlStore.getState().listening) {
      stopEar();
      return;
    }
    await startEar();
  }, [startEar, stopEar]);

  const holdRecord = useCallback(async () => {
    const senses = await ensureSenses();
    const stream = getSensesStream();
    if (!senses.mic || !stream) {
      setEarError("Mic was denied.");
      return;
    }
    const audioTracks = stream.getAudioTracks();
    const recStream = audioTracks.length ? new MediaStream(audioTracks) : stream;
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : undefined;
    const rec = mime ? new MediaRecorder(recStream, { mimeType: mime }) : new MediaRecorder(recStream);
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      const reader = new FileReader();
      reader.onload = async () => {
        const audio = String(reader.result ?? "");
        const heard = await owlHear({ data: { audio, mime: blob.type } });
        if (heard.ok && heard.text) void submitRef.current(heard.text);
        else setEarError(heard.ok ? "Empty clip." : heard.error);
      };
      reader.readAsDataURL(blob);
    };
    rec.start();
    clipRef.current = rec;
    setListening(true);
    window.setTimeout(() => {
      if (rec.state !== "inactive") rec.stop();
      clipRef.current = null;
      if (!earWanted.current) setListening(false);
    }, 8000);
  }, [setEarError, setListening]);

  if (phase === "boot") {
    return (
      <BootSequence
        onAwaken={() => {
          awaken();
          void startEar();
        }}
        onOpenEar={() => {
          void startEar();
        }}
        listening={listening}
        earError={earError}
      />
    );
  }

  if (phase === "sleep") {
    return (
      <div className="relative min-h-dvh overflow-hidden bg-bg text-fg">
        <div className="owl-grain" />
        <p className="absolute top-6 left-0 right-0 text-center font-display text-2xl tracking-[0.4em] text-subtle">OWL</p>
        <p className="absolute top-16 left-0 right-0 text-center font-mono text-xs text-muted">Say hey owl</p>
        <MiniCompanion clones={clones} roaming onWake={() => { awaken(); void startEar(); }} />
        <video ref={camRef} className="pointer-events-none absolute h-32 w-48 opacity-0" playsInline muted autoPlay />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex min-h-dvh flex-col bg-bg text-fg",
        hud === "frost" && "contrast-125",
        hud === "ember" && "[--color-iris:#c4a574] [--color-accent:#e4d6c5]",
      )}
      style={{
        ["--hud-ring" as string]: skin.ring,
        ...(cell ? { ["--color-iris" as string]: cell } : {}),
      }}
      onPointerDown={() => {
        lastInputAt.current = Date.now();
        setIdleWalk(false);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files[0];
        if (f) void dropFile(f);
      }}
    >
      <div className="owl-grain" />
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center border-2 border-dashed border-iris bg-bg/70">
          <p className="font-display text-3xl text-fg">Drop nest</p>
        </div>
      )}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 50% 28%, ${skin.ring}, transparent 55%)`,
        }}
      />

      <header className="relative z-10 flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="font-display text-2xl tracking-[-0.03em]">OWL</span>
          <RelicsSigil seed={`${memory.bossName}|${memory.city ?? ""}|${memory.favoriteSong}`} />
          <span className="hidden font-mono text-xs tracking-[0.18em] text-subtle uppercase sm:inline">
            {hourGreeting()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-muted">
            {moonPhase().name.split(" ")[0]}
            {battery !== null ? ` · ${battery}%` : ""}
            {" · "}
            {clock}
          </span>
          <span className="hidden rounded-full border border-border px-2 py-1 font-mono text-[0.65rem] tracking-wider text-subtle uppercase sm:inline">
            {listening ? "ear on" : "ear off"} · {devices.length} paired
          </span>
          <IconToggle on={voiceOn} onClick={() => setVoiceOn(!voiceOn)} label="Voice">
            {voiceOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </IconToggle>
          <IconToggle on={false} onClick={() => void submit("go to sleep")} label="Sleep">
            <Moon className="size-4" />
          </IconToggle>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col lg:flex-row">
        <section
          className={cn(
            "flex min-h-0 flex-col px-3 sm:px-5",
            focusMode ? "hidden lg:flex lg:w-[28%]" : "lg:w-[30%]",
          )}
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-2 pr-1">
            {messages
              .filter((m) => {
                if (m.role !== "user") return true;
                return !/^(hey owl\s+)?(open|play|launch|go to|visit|browse)\b/i.test(m.text.trim());
              })
              .map((m) => (
              <article
                key={m.id}
                className={cn(
                  "owl-enter max-w-[40rem] rounded-lg px-3 py-2.5 text-sm leading-relaxed",
                  m.role === "user"
                    ? "ml-auto bg-bg-subtle text-fg"
                    : m.role === "system"
                      ? "font-mono text-xs text-subtle"
                      : "bg-bg-elevated/80 text-fg",
                )}
              >
                {m.role === "owl" && (
                  <p className="mb-1 font-mono text-[0.65rem] tracking-[0.18em] text-subtle uppercase">OWL</p>
                )}
                {m.verse && (
                  <p className="mb-2 font-display text-sm leading-snug text-muted italic whitespace-pre-wrap">{m.verse}</p>
                )}
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.imageUrl && (
                  <img
                    src={m.imageUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="mt-2 max-h-56 rounded-md border border-border object-cover"
                  />
                )}
                {m.videoUrl && (
                  <video
                    src={m.videoUrl}
                    controls
                    autoPlay
                    playsInline
                    data-owl-clip
                    className="mt-2 w-full rounded-md border border-border"
                  />
                )}
                {m.code && (
                  <div className="mt-2">
                    <pre className="overflow-x-auto rounded-md border border-border bg-bg p-2 font-mono text-xs">
                      {m.code.source}
                    </pre>
                    <button
                      type="button"
                      className="mt-1 text-xs text-iris"
                      onClick={() => {
                        void navigator.clipboard.writeText(m.code!.source);
                        setStatus("Copied.");
                      }}
                    >
                      Copy {m.code.language === "owl-face" ? "face sheet" : "code"}
                    </button>
                  </div>
                )}
              </article>
            ))}
            {thinking && (
              <p className="font-mono text-xs text-muted">
                <span className="owl-shimmer bg-clip-text text-transparent">Reasoning</span>
              </p>
            )}
            <div ref={chatEnd} />
          </div>
        </section>

        <section className="flex flex-col items-center justify-center px-4 py-2 lg:w-[40%]">
          <OwlFace
            mood={listening ? "listen" : thinking ? "think" : speaking ? "speak" : mood}
            speaking={speaking}
            hourglass={focusUntil ? sand : null}
            breath={breath}
            tiltX={tilt.x}
            tiltY={tilt.y}
          />
          <p className="mt-3 max-w-md text-center font-display text-xl tracking-[-0.02em] text-fg sm:text-2xl">
            {status && !/^online\.?$/i.test(status) ? status : "\u00a0"}
          </p>
          {earError && <p className="mt-1 max-w-sm text-center text-xs text-warn">{earError}</p>}
          {permissions.camera && (
            <button
              type="button"
              onClick={() => setPanel("vision")}
              className="mt-3 overflow-hidden rounded-md border border-border"
              aria-label="Open gaze"
            >
              <video
                ref={camRef}
                className="h-16 w-24 object-cover"
                playsInline
                muted
                autoPlay
              />
            </button>
          )}
          {!permissions.camera && (
            <video ref={camRef} className="pointer-events-none absolute h-32 w-48 opacity-0" playsInline muted autoPlay />
          )}
          {musicPlaying && (
            <p className="mt-1 font-mono text-xs text-iris">
              {trackTitle}
              {nowPlaying ? " · YouTube Music" : ` · ${devices.filter((d) => d.playing).length} devices`}
            </p>
          )}
        </section>

        <aside
          className={cn(
            "flex min-h-0 flex-col border-t border-border lg:w-[30%] lg:border-t-0 lg:border-l",
            focusMode && !panel && "hidden",
          )}
        >
          {panel ? (
            <div className="flex min-h-0 flex-1 flex-col p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-xl capitalize">
                  {panel === "memory" ? "Nest" : panel === "browse" ? "Open" : panel}
                </h2>
                <button type="button" className="min-h-11 px-3 text-sm text-muted" onClick={() => setPanel(null)}>
                  Close
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                {panel === "arcade" ? (
                  <Arcade />
                ) : (
                  <PanelBody
                    onInvoke={(t) => void submit(t)}
                    onImagine={(p) => void imagine(p)}
                    onClip={(p) => void weaveClip(p)}
                    onSee={() => void seeFrame()}
                    onMint={() => void mintFace()}
                    onRestyle={(s) => void restyleStill(s)}
                    onCode={(p) => void submit(`write code ${p}`)}
                    onSite={(p) => void submit(`build a website ${p}`)}
                    onShare={(id) => void shareStill(id)}
                    onDropFile={(f) => void dropFile(f)}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
              <div>
                <h2 className="font-mono text-xs tracking-[0.18em] text-subtle uppercase">Nest</h2>
                <button
                  type="button"
                  onClick={() => setPanel("memory")}
                  className="mt-2 w-full rounded-lg border border-border bg-bg-elevated/80 px-3 py-3 text-left transition-colors hover:border-accent/40"
                >
                  <p className="font-display text-xl text-fg">{memory.bossName}</p>
                  <p className="mt-1 font-mono text-xs text-muted">
                    {memory.personality}
                    {memory.city ? ` · ${memory.city}` : ""}
                    {memory.favoriteSong ? ` · ${memory.favoriteSong}` : ""}
                  </p>
                  {memory.notes[memory.notes.length - 1] && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted">{memory.notes[memory.notes.length - 1]}</p>
                  )}
                  <p className="mt-2 text-xs text-subtle">
                    {memory.notes.length} {memory.notes.length === 1 ? "note" : "notes"}
                    {" · "}
                    {memory.people.length} {memory.people.length === 1 ? "person" : "people"}
                  </p>
                  <p className="mt-2 text-xs text-iris">Edit nest</p>
                </button>
              </div>
              <div>
                <h2 className="font-mono text-xs tracking-[0.18em] text-subtle uppercase">Relics</h2>
                <button
                  type="button"
                  onClick={() => setPanel("relics")}
                  className="mt-2 w-full rounded-lg border border-border bg-bg-elevated/80 px-3 py-3 text-left transition-colors hover:border-accent/40"
                >
                  <p className="font-display text-lg text-fg">Ten things a chat box cannot do</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    Sky, hourglass, tilt, breath, drop files, shake, sigil, color, cover-eye, idle walk.
                  </p>
                  <p className="mt-2 text-xs text-iris">Open relics</p>
                </button>
              </div>
              {memory.people.length > 0 && (
                <div>
                  <h2 className="font-mono text-xs tracking-[0.18em] text-subtle uppercase">People</h2>
                  <ul className="mt-2 space-y-1.5">
                    {memory.people.slice(0, 6).map((p) => (
                      <li key={p.id} className="flex items-center justify-between text-sm">
                        <span className="truncate text-fg">{p.name}</span>
                        <span className="ml-2 shrink-0 font-mono text-xs text-muted">{p.relation}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      <nav className="relative z-10 flex gap-1 overflow-x-auto border-t border-border px-2 py-2 sm:px-4">
        {MODULES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setPanel(panel === m.id ? null : m.id)}
            className={cn(
              "flex min-h-11 min-w-11 shrink-0 items-center gap-2 rounded-md px-3 text-xs transition-colors",
              panel === m.id ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
            )}
          >
            <m.icon className="size-4" />
            <span className="hidden sm:inline">{m.label}</span>
          </button>
        ))}
      </nav>

      <form
        className="relative z-10 flex items-end gap-2 border-t border-border px-3 py-3 pb-5 sm:px-5 sm:pb-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(draft);
        }}
      >
        <button
          type="button"
          onPointerDown={() => {
            holding.current = false;
            if (holdTimer.current) window.clearTimeout(holdTimer.current);
            holdTimer.current = window.setTimeout(() => {
              holding.current = true;
              void holdRecord();
            }, 420);
          }}
          onPointerUp={() => {
            if (holdTimer.current) {
              window.clearTimeout(holdTimer.current);
              holdTimer.current = null;
            }
            if (holding.current) {
              holding.current = false;
              const clip = clipRef.current;
              if (clip && clip.state !== "inactive") clip.stop();
              return;
            }
            if (speechEngine()) void toggleListen();
            else void holdRecord();
          }}
          onPointerLeave={() => {
            if (holdTimer.current) {
              window.clearTimeout(holdTimer.current);
              holdTimer.current = null;
            }
          }}
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full border transition-colors",
            listening ? "border-iris bg-iris/15 text-iris" : "border-border text-muted",
          )}
          aria-label={listening ? "Ear on" : "Open ear"}
          title="Tap to keep the ear on. Hold to send a 5s clip."
        >
          {listening ? <Mic className="size-4" /> : <MicOff className="size-4" />}
        </button>
        <label className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border border-border text-muted hover:text-fg">
          <Paperclip className="size-4" />
          <span className="sr-only">Upload photo</span>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void dropFile(f);
            }}
          />
        </label>
        <label className="sr-only" htmlFor="owl-input">
          Command OWL
        </label>
        <input
          id="owl-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="hey owl · weave a clip of a moon perch · open relics · sky"
          className="min-h-11 flex-1 rounded-md border border-border bg-bg-elevated px-3 text-sm text-fg outline-none placeholder:text-subtle focus:ring-1 focus:ring-accent"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={!draft.trim() || thinking}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-fg disabled:opacity-40 active:scale-[0.96]"
          aria-label="Send"
        >
          <Send className="size-4" />
        </button>
      </form>

      {clipUrl && panel !== "studio" && (
        <div className="absolute right-3 bottom-28 z-20 w-[min(22rem,calc(100%-1.5rem))] overflow-hidden rounded-lg border border-border bg-bg-elevated">
          <video
            ref={clipPlayer}
            src={clipUrl}
            controls
            autoPlay
            playsInline
            data-owl-clip
            className="aspect-video w-full bg-bg"
          />
          <button type="button" className="w-full py-2 text-xs text-muted" onClick={() => setClipUrl(null)}>
            Dismiss
          </button>
        </div>
      )}

      {idleWalk && phase === "awake" && (
        <MiniCompanion clones={1} roaming onWake={() => { setIdleWalk(false); lastInputAt.current = Date.now(); }} />
      )}
      {clones > 1 && phase === "awake" && (
        <div className="pointer-events-none absolute bottom-28 left-3 z-20 w-14 opacity-80">
          <OwlFace mood="tease" speaking={false} size="dock" />
        </div>
      )}
    </div>
  );
}

function IconToggle({
  on,
  onClick,
  label,
  children,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "grid size-11 place-items-center rounded-full border border-border text-muted transition-colors hover:text-fg",
        on && "text-iris",
      )}
    >
      {children}
    </button>
  );
}

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e?: { error?: string }) => void) | null;
};

type SpeechRecEvent = {
  resultIndex?: number;
  results: ArrayLike<{ isFinal?: boolean; length?: number; [i: number]: { transcript: string } }>;
};
