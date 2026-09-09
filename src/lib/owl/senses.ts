let stream: MediaStream | null = null;
const videos = new Set<HTMLVideoElement>();

export function getSensesStream() {
  return stream;
}

function live(kind: "audio" | "video") {
  return !!stream?.getTracks().some((t) => t.kind === kind && t.readyState === "live");
}

function bindTracks() {
  if (!stream) return;
  for (const t of stream.getTracks()) {
    t.onended = () => {
      stream = stream
        ? new MediaStream(stream.getTracks().filter((x) => x.readyState === "live"))
        : null;
      if (stream && stream.getTracks().length === 0) stream = null;
    };
  }
  for (const el of videos) attachVideo(el);
}

export async function ensureSenses(): Promise<{ stream: MediaStream | null; mic: boolean; camera: boolean }> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { stream: null, mic: false, camera: false };
  }

  if (live("audio") && live("video") && stream) {
    return { stream, mic: true, camera: true };
  }

  const tryGet = async (constraints: MediaStreamConstraints) => {
    const next = await navigator.mediaDevices.getUserMedia(constraints);
    merge(next);
    bindTracks();
  };

  try {
    await tryGet({ audio: true, video: { facingMode: "user" } });
  } catch {
    try {
      await tryGet({ audio: true });
    } catch {
      try {
        await tryGet({ video: { facingMode: "user" } });
      } catch {
        /* both denied */
      }
    }
  }

  if (!live("video") && live("audio")) {
    try {
      await tryGet({ video: true });
    } catch {
      /* camera still denied */
    }
  }

  return { stream, mic: live("audio"), camera: live("video") };
}

function merge(next: MediaStream) {
  if (!stream) {
    stream = next;
    return;
  }
  for (const t of next.getTracks()) {
    const same = stream.getTracks().find((x) => x.kind === t.kind);
    if (same && same.readyState === "live") {
      t.stop();
    } else {
      if (same) {
        stream.removeTrack(same);
        same.stop();
      }
      stream.addTrack(t);
    }
  }
}

export function attachVideo(el: HTMLVideoElement | null) {
  if (!el) return;
  videos.add(el);
  if (!stream) return;
  if (el.srcObject !== stream) el.srcObject = stream;
  el.muted = true;
  el.playsInline = true;
  void el.play().catch(() => undefined);
}

export function detachVideo(el: HTMLVideoElement | null) {
  if (!el) return;
  videos.delete(el);
}
