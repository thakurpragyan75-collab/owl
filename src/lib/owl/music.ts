export type TrackId = "night-watch" | "boss-theme" | "moon-circuit";

export const TRACKS: { id: TrackId; title: string }[] = [
  { id: "night-watch", title: "Night Watch" },
  { id: "boss-theme", title: "Boss Theme" },
  { id: "moon-circuit", title: "Moon Circuit" },
];

type Handle = { stop: () => void };

let active: Handle | null = null;
let ctx: AudioContext | null = null;

function getCtx() {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function envGain(c: AudioContext, start: number, dur: number, peak: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(peak, start + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  return g;
}

const SCALES: Record<TrackId, number[]> = {
  "night-watch": [196, 233.08, 261.63, 293.66, 349.23, 392],
  "boss-theme": [174.61, 196, 220, 261.63, 293.66, 329.63],
  "moon-circuit": [220, 246.94, 277.18, 329.63, 369.99, 440],
};

export function stopMusic() {
  active?.stop();
  active = null;
}

export async function playTrack(id: TrackId): Promise<void> {
  stopMusic();
  const c = getCtx();
  if (c.state === "suspended") await c.resume();

  const master = c.createGain();
  master.gain.value = 0.12;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1800;
  master.connect(filter);
  filter.connect(c.destination);

  const scale = SCALES[id];
  const oscs: OscillatorNode[] = [];
  const now = c.currentTime;

  const pad = c.createOscillator();
  pad.type = "sine";
  pad.frequency.value = scale[0] / 2;
  const padGain = c.createGain();
  padGain.gain.value = 0.18;
  pad.connect(padGain);
  padGain.connect(master);
  pad.start(now);
  oscs.push(pad);

  const pad2 = c.createOscillator();
  pad2.type = "triangle";
  pad2.frequency.value = scale[0] / 2 + 1.4;
  const pad2g = c.createGain();
  pad2g.gain.value = 0.06;
  pad2.connect(pad2g);
  pad2g.connect(master);
  pad2.start(now);
  oscs.push(pad2);

  const pattern = [0, 2, 4, 2, 5, 4, 3, 2, 0, 1, 2, 4, 3, 2, 1, 0];
  const tempo = id === "boss-theme" ? 0.28 : 0.34;
  let t = now + 0.05;
  const loopBeats = 64;

  for (let i = 0; i < loopBeats; i++) {
    const note = scale[pattern[i % pattern.length] % scale.length];
    const osc = c.createOscillator();
    osc.type = i % 8 === 0 ? "triangle" : "sine";
    osc.frequency.value = note * (i % 16 === 12 ? 2 : 1);
    const g = envGain(c, t, tempo * 1.6, i % 4 === 0 ? 0.22 : 0.12);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + tempo * 1.8);
    oscs.push(osc);

    if (i % 4 === 0) {
      const bass = c.createOscillator();
      bass.type = "sine";
      bass.frequency.value = scale[0] / 2;
      const bg = envGain(c, t, tempo * 3, 0.16);
      bass.connect(bg);
      bg.connect(master);
      bass.start(t);
      bass.stop(t + tempo * 3.1);
      oscs.push(bass);
    }
    t += tempo;
  }

  const stopAt = t + 0.4;
  const timer = window.setTimeout(() => {
    if (active?.stop === stop) playTrack(id);
  }, (stopAt - now) * 1000);

  function stop() {
    window.clearTimeout(timer);
    const fade = c.currentTime;
    master.gain.cancelScheduledValues(fade);
    master.gain.setValueAtTime(master.gain.value, fade);
    master.gain.linearRampToValueAtTime(0, fade + 0.2);
    window.setTimeout(() => {
      for (const o of oscs) {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      }
      master.disconnect();
      filter.disconnect();
    }, 260);
  }

  active = { stop };
}
