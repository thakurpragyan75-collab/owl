import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ChatMessage,
  Device,
  GameId,
  LogEntry,
  ModuleId,
  OwlMemory,
  OwlMood,
  Person,
  Personality,
} from "./types";
import type { OwlSeed } from "./seed";

export type HudSkin = "night" | "frost" | "ember";

export type StudioImage = { id: string; url: string; prompt: string; at: number };

export type NowPlaying = { title: string; query: string; embed: string; musicUrl: string; watchUrl?: string };

export type WhatsAppWire = {
  kind: "send" | "call" | "open";
  name: string;
  phone?: string;
  text?: string;
  href: string;
};

type OwlState = {
  phase: "boot" | "awake" | "sleep";
  mood: OwlMood;
  listening: boolean;
  thinking: boolean;
  speaking: boolean;
  voiceOn: boolean;
  quietHours: boolean;
  focusMode: boolean;
  hud: HudSkin;
  status: string;
  messages: ChatMessage[];
  log: LogEntry[];
  devices: Device[];
  panel: ModuleId | null;
  game: GameId | null;
  clones: number;
  musicPlaying: boolean;
  trackTitle: string;
  memory: OwlMemory;
  studioImages: StudioImage[];
  lastCode: { language: string; source: string } | null;
  lastSite: string | null;
  callTarget: string | null;
  browseUrl: string | null;
  nowPlaying: NowPlaying | null;
  lastClip: string | null;
  lastFaceCode: string | null;
  lastSeed: OwlSeed | null;
  focusUntil: number | null;
  qrPayload: string | null;
  whatsapp: WhatsAppWire | null;
  permissions: { mic: boolean; camera: boolean };
  earError: string | null;

  awaken: () => void;
  sleep: () => void;
  setMood: (m: OwlMood) => void;
  setListening: (v: boolean) => void;
  setThinking: (v: boolean) => void;
  setSpeaking: (v: boolean) => void;
  setVoiceOn: (v: boolean) => void;
  setStatus: (s: string) => void;
  pushMessage: (m: Omit<ChatMessage, "id" | "at"> & { id?: string }) => string;
  pushLog: (text: string, tone?: LogEntry["tone"]) => void;
  setPanel: (p: ModuleId | null) => void;
  setGame: (g: GameId | null) => void;
  setDevices: (d: Device[]) => void;
  setPlaying: (playing: boolean, track?: string, scope?: "all" | string) => void;
  addClone: () => void;
  setHud: (h: HudSkin) => void;
  setQuiet: (v: boolean) => void;
  setFocus: (v: boolean) => void;
  setMemory: (patch: Partial<OwlMemory>) => void;
  addPerson: (p: Person) => void;
  updatePerson: (id: string, patch: Partial<Person>) => void;
  removePerson: (id: string) => void;
  addNote: (n: string) => void;
  updateNote: (index: number, text: string) => void;
  removeNote: (index: number) => void;
  addTypo: (t: string) => void;
  addImage: (img: StudioImage) => void;
  setLastCode: (c: { language: string; source: string } | null) => void;
  setLastSite: (html: string | null) => void;
  setCall: (target: string | null) => void;
  setPermission: (k: "mic" | "camera", v: boolean) => void;
  addDevice: (d: Device) => void;
  setBrowse: (url: string | null) => void;
  setNowPlaying: (n: NowPlaying | null) => void;
  setLastClip: (url: string | null) => void;
  setLastFaceCode: (code: string | null) => void;
  setLastSeed: (seed: OwlSeed | null) => void;
  setFocusUntil: (t: number | null) => void;
  setQrPayload: (q: string | null) => void;
  setWhatsapp: (w: WhatsAppWire | null) => void;
  receiveImage: (deviceId: string, url: string) => void;
  markBluetooth: (deviceId: string) => void;
  setEarError: (e: string | null) => void;
  importMemory: (memory: OwlMemory) => void;
};

const nowIso = () => new Date().toISOString();

const defaultDevices = (): Device[] => [
  { id: "primary", name: "Primary", kind: "phone", playing: false, lastPing: nowIso() },
  { id: "night", name: "Night", kind: "phone", playing: false, lastPing: nowIso() },
  { id: "field", name: "Field", kind: "phone", playing: false, lastPing: nowIso() },
];

export const emptyMemory = (): OwlMemory => ({
  bossName: "Boss",
  favoriteSong: "Night Watch",
  personality: "partner",
  notes: [],
  people: [],
  typos: [],
});

export function parseNestPayload(raw: unknown): OwlMemory | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const src = (obj.memory && typeof obj.memory === "object" ? obj.memory : obj) as Record<string, unknown>;
  if (typeof src.bossName !== "string" || !src.bossName.trim()) return null;
  const personality: Personality =
    src.personality === "precise" || src.personality === "tease" || src.personality === "partner"
      ? src.personality
      : "partner";
  const people: Person[] = Array.isArray(src.people)
    ? src.people
        .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
        .filter((p) => typeof p.name === "string" && p.name.trim())
        .map((p) => ({
          id: typeof p.id === "string" ? p.id : crypto.randomUUID(),
          name: String(p.name).trim(),
          relation: typeof p.relation === "string" && p.relation.trim() ? p.relation.trim() : "friend",
          notes: typeof p.notes === "string" ? p.notes : "",
          phone: typeof p.phone === "string" && p.phone.trim() ? p.phone.trim() : undefined,
          lastSeen: typeof p.lastSeen === "string" ? p.lastSeen : undefined,
        }))
    : [];
  const notes = Array.isArray(src.notes)
    ? src.notes.filter((n): n is string => typeof n === "string" && n.trim().length > 0)
    : [];
  const typos = Array.isArray(src.typos)
    ? src.typos.filter((t): t is string => typeof t === "string")
    : [];
  return {
    bossName: src.bossName.trim(),
    city: typeof src.city === "string" && src.city.trim() ? src.city.trim() : undefined,
    favoriteSong:
      typeof src.favoriteSong === "string" && src.favoriteSong.trim() ? src.favoriteSong.trim() : "Night Watch",
    personality,
    notes,
    people,
    typos,
  };
}

export const useOwlStore = create<OwlState>()(
  persist(
    (set, get) => ({
      phase: "boot",
      mood: "idle",
      listening: false,
      thinking: false,
      speaking: false,
      voiceOn: true,
      quietHours: false,
      focusMode: false,
      hud: "night",
      status: "Dormant.",
      messages: [],
      log: [],
      devices: defaultDevices(),
      panel: null,
      game: null,
      clones: 1,
      musicPlaying: false,
      trackTitle: "Night Watch",
      studioImages: [],
      lastCode: null,
      lastSite: null,
      callTarget: null,
      browseUrl: null,
      nowPlaying: null,
      lastClip: null,
      lastFaceCode: null,
      lastSeed: null,
      focusUntil: null,
      qrPayload: null,
      whatsapp: null,
      permissions: { mic: false, camera: false },
      earError: null,
      memory: emptyMemory(),

      awaken: () => set({ phase: "awake", mood: "idle", status: "" }),
      sleep: () =>
        set({
          phase: "sleep",
          mood: "sleep",
          status: "Perched.",
          panel: null,
          game: null,
          callTarget: null,
        }),
      setMood: (mood) => set({ mood }),
      setListening: (listening) => set({ listening, mood: listening ? "listen" : get().thinking ? "think" : "idle" }),
      setThinking: (thinking) => set({ thinking, mood: thinking ? "think" : get().listening ? "listen" : "idle" }),
      setSpeaking: (speaking) => set({ speaking, mood: speaking ? "speak" : "idle" }),
      setVoiceOn: (voiceOn) => set({ voiceOn }),
      setStatus: (status) => set({ status }),
      pushMessage: (m) => {
        const id = m.id ?? crypto.randomUUID();
        const msg: ChatMessage = { ...m, id, at: Date.now() };
        set((s) => ({ messages: [...s.messages.slice(-39), msg] }));
        return id;
      },
      pushLog: (text, tone = "info") =>
        set((s) => ({
          log: [...s.log.slice(-47), { id: crypto.randomUUID(), at: Date.now(), text, tone }],
        })),
      setPanel: (panel) => set({ panel }),
      setGame: (game) => set({ game, panel: game ? "arcade" : get().panel }),
      setDevices: (devices) => set({ devices }),
      setPlaying: (playing, track, scope) =>
        set((s) => ({
          musicPlaying: playing,
          trackTitle: track ?? s.trackTitle,
          devices: s.devices.map((d, i) => {
            const hit = scope === "all" || !scope || (scope === "primary" && i === 0) || d.id === scope;
            return hit ? { ...d, playing, lastPing: nowIso() } : { ...d, playing: false };
          }),
        })),
      addClone: () => set((s) => ({ clones: Math.min(3, s.clones + 1) })),
      setHud: (hud) => set({ hud }),
      setQuiet: (quietHours) => set({ quietHours }),
      setFocus: (focusMode) => set({ focusMode }),
      setMemory: (patch) => set((s) => ({ memory: { ...s.memory, ...patch } })),
      addPerson: (p) =>
        set((s) => ({ memory: { ...s.memory, people: [...s.memory.people.filter((x) => x.id !== p.id), p] } })),
      updatePerson: (id, patch) =>
        set((s) => ({
          memory: {
            ...s.memory,
            people: s.memory.people.map((p) => (p.id === id ? { ...p, ...patch } : p)),
          },
        })),
      removePerson: (id) =>
        set((s) => ({ memory: { ...s.memory, people: s.memory.people.filter((p) => p.id !== id) } })),
      addNote: (n) => set((s) => ({ memory: { ...s.memory, notes: [...s.memory.notes.slice(-39), n] } })),
      updateNote: (index, text) =>
        set((s) => ({
          memory: {
            ...s.memory,
            notes: s.memory.notes.map((n, i) => (i === index ? text : n)),
          },
        })),
      removeNote: (index) =>
        set((s) => ({ memory: { ...s.memory, notes: s.memory.notes.filter((_, i) => i !== index) } })),
      addTypo: (t) =>
        set((s) => {
          if (s.memory.typos.includes(t) || t.length < 4) return s;
          return { memory: { ...s.memory, typos: [...s.memory.typos.slice(-80), t] } };
        }),
      addImage: (img) => set((s) => ({ studioImages: [img, ...s.studioImages].slice(0, 12) })),
      setLastCode: (lastCode) => set({ lastCode }),
      setLastSite: (lastSite) => set({ lastSite }),
      setCall: (callTarget) => set({ callTarget, panel: callTarget ? "call" : get().panel }),
      setPermission: (k, v) => set((s) => ({ permissions: { ...s.permissions, [k]: v } })),
      addDevice: (d) => set((s) => ({ devices: [...s.devices, d] })),
      setBrowse: (browseUrl) => set({ browseUrl, panel: browseUrl ? "browse" : get().panel === "browse" ? null : get().panel }),
      setNowPlaying: (nowPlaying) => set({ nowPlaying }),
      setLastClip: (lastClip) => set({ lastClip }),
      setLastFaceCode: (lastFaceCode) => set({ lastFaceCode }),
      setLastSeed: (lastSeed) => set({ lastSeed }),
      setFocusUntil: (focusUntil) => set({ focusUntil }),
      setQrPayload: (qrPayload) => set({ qrPayload }),
      setWhatsapp: (whatsapp) => set({ whatsapp }),
      receiveImage: (deviceId, url) =>
        set((s) => ({
          devices: s.devices.map((d) => (d.id === deviceId ? { ...d, lastImage: url, lastPing: nowIso() } : d)),
        })),
      markBluetooth: (deviceId) =>
        set((s) => ({
          devices: s.devices.map((d) => (d.id === deviceId ? { ...d, bluetooth: true, lastPing: nowIso() } : d)),
        })),
      setEarError: (earError) => set({ earError }),
      importMemory: (memory) => set({ memory }),
    }),
    {
      name: "owl-roost-v2",
      version: 4,
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        const hud = p.hud === "frost" || p.hud === "ember" || p.hud === "night" ? p.hud : "night";
        return {
          voiceOn: typeof p.voiceOn === "boolean" ? p.voiceOn : true,
          quietHours: typeof p.quietHours === "boolean" ? p.quietHours : false,
          hud,
          devices: Array.isArray(p.devices) ? (p.devices as ReturnType<typeof defaultDevices>) : defaultDevices(),
          memory: parseNestPayload(p.memory) ?? emptyMemory(),
          clones: typeof p.clones === "number" ? Math.min(3, Math.max(1, p.clones)) : 1,
          trackTitle: typeof p.trackTitle === "string" && p.trackTitle.trim() ? p.trackTitle : "Night Watch",
        };
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          try {
            localStorage.removeItem("owl-roost-v2");
          } catch {
            /* ignore */
          }
        }
      },
      partialize: (s) => ({
        voiceOn: s.voiceOn,
        quietHours: s.quietHours,
        hud: s.hud,
        devices: s.devices.map((d) => ({ ...d, playing: false })),
        memory: s.memory,
        clones: s.clones,
        trackTitle: s.trackTitle,
      }),
    },
  ),
);
