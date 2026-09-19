import { useEffect, useRef, useState } from "react";
import { useOwlStore } from "@/lib/owl/store";
import type { GameId } from "@/lib/owl/types";
import { cn } from "@/lib/utils";
import { Bricks, Echo, Match, Pulse, Stack, Sweep, Tiles } from "./ArcadeMore";

export function Arcade() {
  const game = useOwlStore((s) => s.game);
  const setGame = useOwlStore((s) => s.setGame);

  const games: GameId[] = ["snake", "pong", "perch", "bricks", "stack", "match", "sweep", "tiles", "echo", "pulse"];

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {games.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setGame(id)}
            className={cn(
              "min-h-11 rounded-md px-3 text-sm capitalize transition-colors duration-150",
              game === id ? "bg-accent text-accent-fg" : "bg-bg-subtle text-muted hover:text-fg",
            )}
          >
            {id}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-bg">
        {game === "snake" && <Snake />}
        {game === "pong" && <Pong />}
        {game === "perch" && <Perch />}
        {game === "bricks" && <Bricks />}
        {game === "stack" && <Stack />}
        {game === "match" && <Match />}
        {game === "sweep" && <Sweep />}
        {game === "tiles" && <Tiles />}
        {game === "echo" && <Echo />}
        {game === "pulse" && <Pulse />}
        {!game && (
          <p className="p-6 text-sm text-muted">Pick a game, or say “play snake”, “play stack”, “play bricks”.</p>
        )}
      </div>
    </div>
  );
}

function Snake() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const cell = 16;
    const cols = 24;
    const rows = 18;
    c.width = cols * cell;
    c.height = rows * cell;
    let dir = { x: 1, y: 0 };
    let next = { x: 1, y: 0 };
    let snake = [
      { x: 8, y: 8 },
      { x: 7, y: 8 },
      { x: 6, y: 8 },
    ];
    let food = { x: 14, y: 8 };
    let sc = 0;
    let dead = false;

    const place = () => {
      food = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
    };

    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "arrowup" || k === "w") next = dir.y === 1 ? dir : { x: 0, y: -1 };
      if (k === "arrowdown" || k === "s") next = dir.y === -1 ? dir : { x: 0, y: 1 };
      if (k === "arrowleft" || k === "a") next = dir.x === 1 ? dir : { x: -1, y: 0 };
      if (k === "arrowright" || k === "d") next = dir.x === -1 ? dir : { x: 1, y: 0 };
    };
    window.addEventListener("keydown", onKey);

    const tick = () => {
      if (dead) return;
      dir = next;
      const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      if (head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows || snake.some((s) => s.x === head.x && s.y === head.y)) {
        dead = true;
        return;
      }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        sc += 1;
        setScore(sc);
        place();
      } else snake.pop();

      ctx.fillStyle = "#08090c";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = "#6ec8c4";
      ctx.fillRect(food.x * cell + 3, food.y * cell + 3, cell - 6, cell - 6);
      snake.forEach((s, i) => {
        ctx.fillStyle = i === 0 ? "#c5d0dc" : "#2a3340";
        ctx.fillRect(s.x * cell + 1, s.y * cell + 1, cell - 2, cell - 2);
      });
    };

    const id = window.setInterval(tick, 110);
    tick();
    return () => {
      window.clearInterval(id);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-3">
      <p className="font-mono text-xs tabular-nums text-muted">Score {score} · WASD / arrows</p>
      <canvas ref={canvas} className="max-w-full rounded-md border border-border" />
    </div>
  );
}

function Pong() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState("0 — 0");

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    c.width = 420;
    c.height = 260;
    let py = 100;
    let ay = 100;
    let bx = 210;
    let by = 130;
    let vx = 3.2;
    let vy = 2.1;
    let ps = 0;
    let as_ = 0;
    const ph = 52;

    const onMove = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      py = ((e.clientY - r.top) / r.height) * c.height - ph / 2;
    };
    c.addEventListener("pointermove", onMove);

    const tick = () => {
      ay += (by - ay - ph / 2) * 0.09;
      bx += vx;
      by += vy;
      if (by < 0 || by > c.height) vy *= -1;
      if (bx < 18 && by > py && by < py + ph) {
        vx = Math.abs(vx) * 1.03;
        bx = 18;
      }
      if (bx > c.width - 18 && by > ay && by < ay + ph) {
        vx = -Math.abs(vx) * 1.03;
        bx = c.width - 18;
      }
      if (bx < 0) {
        as_ += 1;
        bx = 210;
        by = 130;
        vx = 3.2;
      }
      if (bx > c.width) {
        ps += 1;
        bx = 210;
        by = 130;
        vx = -3.2;
      }
      setScore(`${ps} — ${as_}`);
      ctx.fillStyle = "#08090c";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = "#232833";
      ctx.fillRect(c.width / 2 - 1, 0, 2, c.height);
      ctx.fillStyle = "#c5d0dc";
      ctx.fillRect(8, py, 8, ph);
      ctx.fillRect(c.width - 16, ay, 8, ph);
      ctx.beginPath();
      ctx.arc(bx, by, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#6ec8c4";
      ctx.fill();
    };
    const id = window.setInterval(tick, 16);
    return () => {
      window.clearInterval(id);
      c.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-3">
      <p className="font-mono text-xs tabular-nums text-muted">{score} · move on the board</p>
      <canvas ref={canvas} className="max-w-full rounded-md border border-border" />
    </div>
  );
}

function Perch() {
  const [y, setY] = useState(80);
  const [alive, setAlive] = useState(true);
  const [score, setScore] = useState(0);
  const vy = useRef(0);
  const gaps = useRef([{ x: 280, h: 50 }]);

  useEffect(() => {
    if (!alive) return;
    const id = window.setInterval(() => {
      vy.current += 0.55;
      setY((p) => {
        const n = p + vy.current;
        if (n > 210 || n < 0) {
          setAlive(false);
          return p;
        }
        return n;
      });
      gaps.current = gaps.current
        .map((g) => ({ ...g, x: g.x - 3.2 }))
        .filter((g) => g.x > -40);
      if (gaps.current.every((g) => g.x < 160)) {
        gaps.current.push({ x: 300, h: 30 + Math.random() * 90 });
        setScore((s) => s + 1);
      }
    }, 16);
    return () => window.clearInterval(id);
  }, [alive]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-3">
      <p className="font-mono text-xs tabular-nums text-muted">
        {alive ? `Perch ${score}` : `Fell · ${score}`} · tap to lift
      </p>
      <button
        type="button"
        className="relative h-56 w-full max-w-sm overflow-hidden rounded-md border border-border bg-bg"
        onClick={() => {
          if (!alive) {
            setAlive(true);
            setY(80);
            vy.current = 0;
            gaps.current = [{ x: 280, h: 50 }];
            setScore(0);
            return;
          }
          vy.current = -7.2;
        }}
      >
        {gaps.current.map((g, i) => (
          <span key={i}>
            <span className="absolute w-8 bg-bg-subtle" style={{ left: g.x, top: 0, height: g.h }} />
            <span
              className="absolute w-8 bg-bg-subtle"
              style={{ left: g.x, top: g.h + 70, bottom: 0 }}
            />
          </span>
        ))}
        <span
          className="absolute left-12 size-4 rounded-full bg-iris"
          style={{ top: y }}
        />
      </button>
    </div>
  );
}
