import { useEffect, useRef, useState, type RefObject } from "react";

export function Bricks() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    c.width = 360;
    c.height = 240;
    let px = 150;
    let bx = 180;
    let by = 180;
    let vx = 2.4;
    let vy = -2.6;
    let sc = 0;
    const bricks: { x: number; y: number; live: boolean }[] = [];
    for (let r = 0; r < 4; r++) for (let col = 0; col < 8; col++) bricks.push({ x: 12 + col * 42, y: 16 + r * 16, live: true });
    const onMove = (e: PointerEvent) => {
      const rect = c.getBoundingClientRect();
      px = ((e.clientX - rect.left) / rect.width) * c.width - 32;
    };
    c.addEventListener("pointermove", onMove);
    const id = window.setInterval(() => {
      bx += vx;
      by += vy;
      if (bx < 4 || bx > c.width - 4) vx *= -1;
      if (by < 4) vy *= -1;
      if (by > 220 && bx > px && bx < px + 64) {
        vy = -Math.abs(vy);
        by = 220;
      }
      bricks.forEach((b) => {
        if (b.live && bx > b.x && bx < b.x + 38 && by > b.y && by < b.y + 12) {
          b.live = false;
          vy *= -1;
          sc += 1;
          setScore(sc);
        }
      });
      if (by > c.height) {
        bx = 180;
        by = 180;
        vy = -2.6;
      }
      ctx.fillStyle = "#08090c";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = "#c5d0dc";
      ctx.fillRect(px, 226, 64, 8);
      bricks.forEach((b) => {
        if (!b.live) return;
        ctx.fillStyle = "#6ec8c4";
        ctx.fillRect(b.x, b.y, 38, 12);
      });
      ctx.beginPath();
      ctx.arc(bx, by, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#e8e6e1";
      ctx.fill();
    }, 16);
    return () => {
      window.clearInterval(id);
      c.removeEventListener("pointermove", onMove);
    };
  }, []);
  return <Board score={`Bricks ${score}`} canvas={canvas} hint="slide" />;
}

export function Stack() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const cols = 10;
    const rows = 16;
    const cell = 16;
    c.width = cols * cell;
    c.height = rows * cell;
    const grid = Array.from({ length: rows }, () => Array(cols).fill(0));
    const shapes = [
      [[1, 1, 1, 1]],
      [[1, 1], [1, 1]],
      [[0, 1, 0], [1, 1, 1]],
      [[1, 1, 0], [0, 1, 1]],
    ];
    let piece = { s: shapes[0], x: 3, y: 0 };
    let sc = 0;
    const spawn = () => {
      piece = { s: shapes[Math.floor(Math.random() * shapes.length)], x: 3, y: 0 };
    };
    const hits = (x: number, y: number, s: number[][]) => {
      for (let r = 0; r < s.length; r++)
        for (let col = 0; col < s[r].length; col++) {
          if (!s[r][col]) continue;
          const gx = x + col;
          const gy = y + r;
          if (gx < 0 || gx >= cols || gy >= rows || (gy >= 0 && grid[gy][gx])) return true;
        }
      return false;
    };
    const stamp = () => {
      piece.s.forEach((row, r) =>
        row.forEach((v, col) => {
          if (v && piece.y + r >= 0) grid[piece.y + r][piece.x + col] = 1;
        }),
      );
      for (let r = rows - 1; r >= 0; r--) {
        if (grid[r].every(Boolean)) {
          grid.splice(r, 1);
          grid.unshift(Array(cols).fill(0));
          sc += 10;
          setScore(sc);
          r++;
        }
      }
      spawn();
    };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "a" || k === "arrowleft") if (!hits(piece.x - 1, piece.y, piece.s)) piece.x -= 1;
      if (k === "d" || k === "arrowright") if (!hits(piece.x + 1, piece.y, piece.s)) piece.x += 1;
      if (k === "s" || k === "arrowdown") if (!hits(piece.x, piece.y + 1, piece.s)) piece.y += 1;
    };
    window.addEventListener("keydown", onKey);
    const id = window.setInterval(() => {
      if (!hits(piece.x, piece.y + 1, piece.s)) piece.y += 1;
      else stamp();
      ctx.fillStyle = "#08090c";
      ctx.fillRect(0, 0, c.width, c.height);
      grid.forEach((row, r) =>
        row.forEach((v, col) => {
          if (!v) return;
          ctx.fillStyle = "#2a3340";
          ctx.fillRect(col * cell + 1, r * cell + 1, cell - 2, cell - 2);
        }),
      );
      piece.s.forEach((row, r) =>
        row.forEach((v, col) => {
          if (!v) return;
          ctx.fillStyle = "#6ec8c4";
          ctx.fillRect((piece.x + col) * cell + 1, (piece.y + r) * cell + 1, cell - 2, cell - 2);
        }),
      );
    }, 420);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  return <Board score={`Stack ${score}`} canvas={canvas} hint="A D S" />;
}

export function Match() {
  const icons = ["▲", "●", "■", "◆", "★", "✚", "◌", "▽"];
  const [deck, setDeck] = useState(() =>
    [...icons, ...icons]
      .sort(() => Math.random() - 0.5)
      .map((v, i) => ({ id: i, v, open: false, done: false })),
  );
  const [picked, setPicked] = useState<number[]>([]);
  const open = (i: number) => {
    if (deck[i].done || deck[i].open || picked.length === 2) return;
    const next = deck.map((c, j) => (j === i ? { ...c, open: true } : c));
    const p = [...picked, i];
    setDeck(next);
    setPicked(p);
    if (p.length === 2) {
      const [a, b] = p;
      window.setTimeout(() => {
        setDeck((d) => {
          if (d[a].v === d[b].v) return d.map((c, j) => (j === a || j === b ? { ...c, done: true } : c));
          return d.map((c, j) => (j === a || j === b ? { ...c, open: false } : c));
        });
        setPicked([]);
      }, 480);
    }
  };
  return (
    <div className="grid grid-cols-4 gap-2 p-3">
      {deck.map((c, i) => (
        <button
          key={c.id}
          type="button"
          onClick={() => open(i)}
          className="min-h-14 rounded-md border border-border bg-bg-subtle text-lg text-fg"
        >
          {c.open || c.done ? c.v : "·"}
        </button>
      ))}
    </div>
  );
}

export function Sweep() {
  const n = 8;
  const [cells, setCells] = useState(() => {
    const mines = new Set<number>();
    while (mines.size < 10) mines.add(Math.floor(Math.random() * n * n));
    return Array.from({ length: n * n }, (_, i) => ({ mine: mines.has(i), open: false }));
  });
  const count = (i: number) => {
    const x = i % n;
    const y = Math.floor(i / n);
    let c = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < n && ny < n && cells[ny * n + nx].mine) c++;
      }
    return c;
  };
  return (
    <div className="grid grid-cols-8 gap-1 p-3">
      {cells.map((cell, i) => (
        <button
          key={i}
          type="button"
          className="min-h-9 rounded-sm border border-border bg-bg-subtle font-mono text-xs text-fg"
          onClick={() => setCells((c) => c.map((x, j) => (j === i ? { ...x, open: true } : x)))}
        >
          {cell.open ? (cell.mine ? "×" : count(i) || "") : ""}
        </button>
      ))}
    </div>
  );
}

export function Tiles() {
  const empty = () => {
    const g = Array.from({ length: 16 }, () => 0);
    g[Math.floor(Math.random() * 16)] = 2;
    return g;
  };
  const [g, setG] = useState(empty);
  const slide = (dir: "l" | "r" | "u" | "d") => {
    const at = (x: number, y: number) => g[y * 4 + x];
    const next = g.slice();
    const line = (vals: number[]) => {
      const a = vals.filter(Boolean);
      for (let i = 0; i < a.length - 1; i++) {
        if (a[i] === a[i + 1]) {
          a[i] *= 2;
          a[i + 1] = 0;
        }
      }
      const b = a.filter(Boolean);
      while (b.length < 4) b.push(0);
      return b;
    };
    for (let i = 0; i < 4; i++) {
      let vals: number[] = [];
      if (dir === "l") vals = [0, 1, 2, 3].map((x) => at(x, i));
      if (dir === "r") vals = [3, 2, 1, 0].map((x) => at(x, i));
      if (dir === "u") vals = [0, 1, 2, 3].map((y) => at(i, y));
      if (dir === "d") vals = [3, 2, 1, 0].map((y) => at(i, y));
      const out = line(vals);
      if (dir === "l") [0, 1, 2, 3].forEach((x, k) => (next[i * 4 + x] = out[k]));
      if (dir === "r") [3, 2, 1, 0].forEach((x, k) => (next[i * 4 + x] = out[k]));
      if (dir === "u") [0, 1, 2, 3].forEach((y, k) => (next[y * 4 + i] = out[k]));
      if (dir === "d") [3, 2, 1, 0].forEach((y, k) => (next[y * 4 + i] = out[k]));
    }
    const zeros = next.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
    if (zeros.length) next[zeros[Math.floor(Math.random() * zeros.length)]] = 2;
    setG(next);
  };
  return (
    <div className="flex flex-col items-center gap-2 p-3">
      <div className="grid grid-cols-4 gap-1">
        {g.map((v, i) => (
          <div key={i} className="flex size-14 items-center justify-center rounded-md border border-border bg-bg-subtle font-mono text-sm text-fg">
            {v || ""}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {(["l", "u", "d", "r"] as const).map((d) => (
          <button key={d} type="button" className="min-h-11 min-w-11 rounded-md border border-border uppercase" onClick={() => slide(d)}>
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Echo() {
  const [seq, setSeq] = useState([0]);
  const [step, setStep] = useState(0);
  const [lit, setLit] = useState<number | null>(null);
  const colors = ["bg-iris", "bg-accent", "bg-warn", "bg-fg"];
  const play = (s: number[]) => {
    s.forEach((v, i) => window.setTimeout(() => setLit(v), 400 * i));
    window.setTimeout(() => setLit(null), 400 * s.length);
  };
  useEffect(() => {
    play(seq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq.join(",")]);
  return (
    <div className="grid grid-cols-2 gap-2 p-4">
      {[0, 1, 2, 3].map((i) => (
        <button
          key={i}
          type="button"
          className={`min-h-20 rounded-md border border-border ${lit === i ? colors[i] : "bg-bg-subtle"}`}
          onClick={() => {
            if (i !== seq[step]) {
              setSeq([Math.floor(Math.random() * 4)]);
              setStep(0);
              return;
            }
            if (step + 1 === seq.length) {
              setSeq((s) => [...s, Math.floor(Math.random() * 4)]);
              setStep(0);
            } else setStep(step + 1);
          }}
        />
      ))}
    </div>
  );
}

export function Pulse() {
  const [wait, setWait] = useState(true);
  const [go, setGo] = useState(0);
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => {
      setWait(false);
      setGo(Date.now());
    }, 800 + Math.random() * 1800);
    return () => window.clearTimeout(t);
  }, [ms]);
  return (
    <button
      type="button"
      className={`m-4 flex min-h-40 flex-1 items-center justify-center rounded-md border border-border text-sm ${wait ? "bg-bg-subtle text-muted" : "bg-iris text-accent-fg"}`}
      onClick={() => {
        if (wait) {
          setMs(-1);
          return;
        }
        setMs(Date.now() - go);
        setWait(true);
      }}
    >
      {ms === -1 ? "Too soon." : ms != null ? `${ms} ms` : wait ? "Wait…" : "Tap"}
    </button>
  );
}

function Board({
  score,
  canvas,
  hint,
}: {
  score: string;
  canvas: RefObject<HTMLCanvasElement | null>;
  hint: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-3">
      <p className="font-mono text-xs tabular-nums text-muted">
        {score} · {hint}
      </p>
      <canvas ref={canvas} className="max-w-full rounded-md border border-border" />
    </div>
  );
}
