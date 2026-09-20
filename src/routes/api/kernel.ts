import { createFileRoute } from "@tanstack/react-router";

const BASE = "http://127.0.0.1:8770";

const OPS: Record<string, { method: string; path: (b: Record<string, unknown>) => string }> = {
  health: { method: "GET", path: () => "/v1/health" },
  list_tasks: { method: "GET", path: () => "/v1/list_tasks" },
  compile_intent: { method: "POST", path: () => "/v1/compile_intent" },
  start_task: { method: "POST", path: () => "/v1/start_task" },
  cancel_task: { method: "POST", path: () => "/v1/cancel_task" },
  approve_action: { method: "POST", path: () => "/v1/approve_action" },
  inspect_trace: { method: "POST", path: () => "/v1/inspect_trace" },
  retrieve_result: { method: "POST", path: () => "/v1/retrieve_result" },
};

export const Route = createFileRoute("/api/kernel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
        }
        const op = String(body.op || "");
        const spec = OPS[op];
        if (!spec) return Response.json({ ok: false, error: "unknown op" }, { status: 400 });
        const url = BASE + spec.path(body);
        try {
          const init: RequestInit = { method: spec.method, headers: { "Content-Type": "application/json" } };
          if (spec.method === "POST") init.body = JSON.stringify(body);
          const upstream = await fetch(url, init);
          const json = await upstream.json().catch(() => ({ ok: false, error: "bad kernel json" }));
          return Response.json(json, { status: upstream.ok ? 200 : upstream.status });
        } catch {
          return Response.json({ ok: false, error: "kernel offline" }, { status: 200 });
        }
      },
      GET: async () => {
        try {
          const upstream = await fetch(BASE + "/v1/health");
          const json = await upstream.json();
          return Response.json(json);
        } catch {
          return Response.json({ ok: false, error: "kernel offline" });
        }
      },
    },
  },
});
