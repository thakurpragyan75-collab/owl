import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Camera,
  Code2,
  Gamepad2,
  Globe,
  ImageIcon,
  Inbox,
  Mic,
  MicOff,
  Moon,
  Send,
  Smartphone,
  UserRound,
  Volume2,
  VolumeX,
} from "lucide-react";
import { owlChat, owlClipPoll, owlClipStart, owlHear, owlImagine, owlSee, owlSpeak } from "@/lib/owl/ai";
import { cinematicLine, parseCommand, stripWakeWord, looksLikeMath } from "@/lib/owl/commands";
import { playTrack, stopMusic, TRACKS } from "@/lib/owl/music";
import { attachVideo, ensureSenses, getSensesStream } from "@/lib/owl/senses";
import { youtubeMusicSearch, youtubeSearchEmbed } from "@/lib/owl/sites";
import { useOwlStore, type HudSkin } from "@/lib/owl/store";
import type { MindMode, ModuleId, OwlAction } from "@/lib/owl/types";
import { cn } from "@/lib/utils";
import { Arcade } from "./Arcade";
import { BootSequence } from "./BootSequence";
import { MiniCompanion } from "./MiniCompanion";
import { OwlFace } from "./OwlFace";
import { PanelBody } from "./Panels";

const MODULES: { id: ModuleId; label: string; icon: typeof BookOpen }[] = [
  { id: "mesh", label: "Mesh", icon: Smartphone },
  { id: "studio", label: "Studio", icon: ImageIcon },
  { id: "arcade", label: "Arcade", icon: Gamepad2 },
  { id: "vision", label: "Gaze", icon: Camera },
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "code", label: "Code", icon: Code2 },
  { id: "site", label: "Site", icon: Globe },
  { id: "codex", label: "Codex", icon: BookOpen },
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
  const callTarget = useOwlStore((s) => s.callTarget);

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
  const setLastCode = useOwlStore((s) => s.setLastCode);
  const setLastSite = useOwlStore((s) => s.setLastSite);
  const setCall = useOwlStore((s) => s.setCall);
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
            stopMusic();
            const musicUrl = youtubeMusicSearch(title);
            const embed = youtubeSearchEmbed(title);
            setNowPlaying({ title, query: title, embed, musicUrl });
            setPlaying(true, title, action.scope);
            setBrowse(musicUrl);
          }
          break;
        }
        case "play_song": {
          stopMusic();
          const musicUrl = youtubeMusicSearch(action.query);
          const embed = youtubeSearchEmbed(action.query);
          setNowPlaying({ title: action.query, query: action.query, embed, musicUrl });
          setPlaying(true, action.query, "all");
          setBrowse(musicUrl);
          break;
        }
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
          break;
        case "call":
          setCall(action.target.replace(/\b\w/g, (c) => c.toUpperCase()));
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
      awaken,
      pushLog,
      pushMessage,
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
      sleep,
      voiceReply,
    ],
  );

  const imagine = useCallback(
    async (prompt: string) => {
      setThinking(true);
      setStatus("Forging the still.");
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
      } finally {
        setThinking(false);
      }
    },
    [addImage, pushLog, pushMessage, setStatus, setThinking, voiceReply],
  );

  const weaveClip = useCallback(
    async (prompt: string) => {
      setThinking(true);
      setStatus("Weaving a clip.");
      try {
        const start = await owlClipStart({ data: { prompt } });
        if (!start.ok) {
          pushMessage({ role: "owl", text: start.error + " Falling back to a still." });
          await imagine(prompt);
          return;
        }
        for (let i = 0; i < 24; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          const poll = await owlClipPoll({ data: { requestId: start.requestId } });
          if (!poll.ok) break;
          if (poll.url && (poll.status === "done" || poll.status === "completed" || poll.status === "succeeded")) {
            setClipUrl(poll.url);
            pushMessage({ role: "owl", text: "Clip ready." });
            setStatus("Clip ready.");
            void voiceReply("Clip ready.", true);
            return;
          }
        }
        pushMessage({ role: "owl", text: "The clip did not land. I can still forge a still." });
      } finally {
        setThinking(false);
      }
    },
    [imagine, pushMessage, setStatus, setThinking, voiceReply],
  );

  const seeFrame = useCallback(async () => {
    await ensureSenses();
    attachVideo(camRef.current);
    const waitForVideo = async () => {
      for (let i = 0; i < 25; i++) {
        const video = camRef.current ?? document.querySelector("video");
        if (video && video.readyState >= 2 && video.videoWidth) return video;
        attachVideo(camRef.current);
        await new Promise((r) => setTimeout(r, 200));
      }
      return camRef.current ?? document.querySelector("video");
    };
    setPanel("vision");
    const video = await waitForVideo();
    if (!video || video.readyState < 2) {
      pushMessage({ role: "owl", text: "I cannot see yet. Tap Open the ear so the camera is granted, then ask again." });
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = Math.round((video.videoHeight / video.videoWidth) * 480) || 360;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/jpeg", 0.72);
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
  }, [pushMessage, setPanel, setStatus, setThinking, voiceReply]);

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

  const submit = useCallback(
    async (raw: string) => {
      const { woke, rest } = stripWakeWord(raw);
      const nowPhase = useOwlStore.getState().phase;
      if (nowPhase !== "awake") {
        if (!woke) return;
        awaken();
        if (!rest) {
          setStatus(`Hello, ${useOwlStore.getState().memory.bossName}.`);
          return;
        }
      }
      const text = (rest || raw).trim();
      if (!text) return;
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
        const line = await runAction(action);
        if (action.type === "generate_image") {
          await imagine(action.prompt);
          return;
        }
        if (action.type === "generate_video") {
          await weaveClip(action.prompt);
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
    [addTypo, askMind, awaken, imagine, pushMessage, runAction, seeFrame, setStatus, shareStill, weaveClip],
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
    attachVideo(camRef.current);
    const id = window.setInterval(() => attachVideo(camRef.current), 1800);
    return () => window.clearInterval(id);
  }, [phase, permissions.camera]);

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
    rec.lang = "en-US";
    rec.maxAlternatives = 1;
    rec.onresult = (e: SpeechRecEvent) => {
      let final = "";
      let interim = "";
      for (let i = e.resultIndex ?? 0; i < e.results.length; i++) {
        const row = e.results[i];
        const t = row[0]?.transcript ?? "";
        if (row.isFinal) final += t;
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
      style={{ ["--hud-ring" as string]: skin.ring }}
    >
      <div className="owl-grain" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 50% 28%, ${skin.ring}, transparent 55%)`,
        }}
      />

      <header className="relative z-10 flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="font-display text-2xl tracking-[-0.03em]">OWL</span>
          <span className="hidden font-mono text-xs tracking-[0.18em] text-subtle uppercase sm:inline">
            {hourGreeting()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-muted">{clock}</span>
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
                  <img src={m.imageUrl} alt="" className="mt-2 max-h-56 rounded-md border border-border object-cover" />
                )}
                {m.code && (
                  <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-bg p-2 font-mono text-xs">
                    {m.code.source}
                  </pre>
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
          <OwlFace mood={listening ? "listen" : thinking ? "think" : speaking ? "speak" : mood} speaking={speaking} />
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
                    onCode={(p) => void submit(`write code ${p}`)}
                    onSite={(p) => void submit(`build a website ${p}`)}
                    onShare={(id) => void shareStill(id)}
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
        <label className="sr-only" htmlFor="owl-input">
          Command OWL
        </label>
        <input
          id="owl-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="hey owl · play believer · open instagram · who is Elon Musk · news"
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

      {callTarget && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-bg/80 p-6">
          <div className="w-full max-w-sm rounded-xl border border-border bg-bg-elevated p-8 text-center shadow-[var(--shadow-hud)]">
            <p className="font-mono text-xs tracking-[0.2em] text-subtle uppercase">Phantom line</p>
            <p className="mt-3 font-display text-4xl">{callTarget}</p>
            <button
              type="button"
              className="mt-8 min-h-11 rounded-full bg-danger px-8 text-sm font-medium"
              onClick={() => setCall(null)}
            >
              End
            </button>
          </div>
        </div>
      )}

      {clipUrl && (
        <div className="absolute right-4 bottom-28 z-20 w-64 overflow-hidden rounded-lg border border-border bg-bg-elevated">
          <video src={clipUrl} controls className="w-full" />
          <button type="button" className="w-full py-2 text-xs text-muted" onClick={() => setClipUrl(null)}>
            Dismiss
          </button>
        </div>
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
  results: ArrayLike<{ isFinal?: boolean; 0: { transcript: string } }>;
};
