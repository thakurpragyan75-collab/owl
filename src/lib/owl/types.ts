export type OwlMood =
  | "idle"
  | "listen"
  | "think"
  | "speak"
  | "tease"
  | "focus"
  | "sleep";

export type ModuleId =
  | "mesh"
  | "studio"
  | "arcade"
  | "vision"
  | "codex"
  | "inbox"
  | "memory"
  | "code"
  | "site"
  | "call"
  | "browse"
  | "relics";

export type DeviceKind = "phone" | "tablet" | "laptop" | "watch";

export type Device = {
  id: string;
  name: string;
  kind: DeviceKind;
  playing: boolean;
  lastPing: string;
  lastImage?: string;
  bluetooth?: boolean;
};

export type ChatRole = "user" | "owl" | "system";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  at: number;
  verse?: string;
  imageUrl?: string;
  videoUrl?: string;
  code?: { language: string; source: string };
  html?: string;
  actions?: OwlAction[];
};

export type LogEntry = {
  id: string;
  at: number;
  text: string;
  tone: "info" | "ok" | "warn";
};

export type Person = {
  id: string;
  name: string;
  relation: string;
  notes: string;
  phone?: string;
  lastSeen?: string;
};

export type Personality = "precise" | "partner" | "tease";

export type OwlMemory = {
  bossName: string;
  city?: string;
  favoriteSong: string;
  personality: Personality;
  notes: string[];
  people: Person[];
  typos: string[];
};

export type MindMode = "talk" | "research" | "math" | "news";

export type OwlAction =
  | { type: "play_music"; scope: "all" | string; track?: string }
  | { type: "play_song"; query: string }
  | { type: "stop_music" }
  | { type: "sleep" }
  | { type: "wake" }
  | { type: "generate_image"; prompt: string }
  | { type: "generate_video"; prompt: string }
  | { type: "restyle"; style: string; prompt?: string }
  | { type: "mint_face" }
  | { type: "forge_face"; code: string }
  | { type: "code"; prompt: string }
  | { type: "website"; prompt: string }
  | { type: "game"; name?: string }
  | { type: "vision" }
  | { type: "open"; module: ModuleId }
  | { type: "open_url"; url: string; label: string }
  | { type: "news" }
  | { type: "research"; topic: string }
  | { type: "math"; prompt: string }
  | { type: "share"; target?: string }
  | { type: "call"; target: string }
  | { type: "whatsapp"; kind: "send" | "call" | "open"; target: string; text?: string }
  | { type: "save_contact"; name: string; phone: string }
  | { type: "relic"; kind: "clipboard" | "sky" | "focus" | "unfocus" | "qr" | "battery" | "polaroid" | "dim" | "tilt" | "color" | "sigil" | "cover"; payload?: string }
  | { type: "analyze"; text: string }
  | { type: "theme"; name: string }
  | { type: "clone" }
  | { type: "set_name"; name: string }
  | { type: "set_song"; title: string }
  | { type: "set_city"; city: string }
  | { type: "chat"; text: string };

export type FeatureKind = "live" | "theater" | "mind";

export type OwlFeature = {
  id: string;
  name: string;
  blurb: string;
  kind: FeatureKind;
  invoke: string;
  group: string;
};

export type GameId = "snake" | "pong" | "perch";
