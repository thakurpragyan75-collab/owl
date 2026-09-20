import { createFileRoute } from "@tanstack/react-router";

const BASE = "http://127.0.0.1:8770";

function trustedRepoPath(): string {
  return process.env.OWL_KERNEL_REPO || (process.env.PWD ? `${process.env.PWD}` : "/workspace");
}

const OPS: Record<string, { method: string; path: (b: Record<string, unknown>) => string }> = {
  health: { method: "GET", path: () => "/v1/health" },
  context: { method: "GET", path: () => "/v1/health" },
  list_tasks: { method: "GET", path: () => "/v1/tasks" },
  compile_intent: { method: "POST", path: () => "/v1/compile_intent" },
  start_task: { method: "POST", path: () => "/v1/start_task" },
  cancel_task: { method: "POST", path: (b) => `/v1/tasks/${String(b.task_id || "")}/cancel` },
  approve_action: { method: "POST", path: (b) => `/v1/tasks/${String(b.task_id || "")}/approve` },
  reject_action: { method: "POST", path: (b) => `/v1/tasks/${String(b.task_id || "")}/reject` },
  inspect_trace: { method: "GET", path: (b) => `/v1/tasks/${String(b.task_id || "")}/trace` },
  retrieve_result: { method: "GET", path: (b) => `/v1/tasks/${String(b.task_id || "")}/result` },
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
        if (op === "context") {
          const path = trustedRepoPath();
          const label = path.split("/").filter(Boolean).pop() || "project";
          return Response.json({ ok: true, repository: { path, label } });
        }
        const spec = OPS[op];
        if (!spec) return Response.json({ ok: false, error: "unknown op" }, { status: 400 });
        if (op === "start_task") {
          const repo = body.repository as { path?: unknown } | undefined;
          if (!repo || typeof repo.path !== "string" || !repo.path.trim()) {
            return Response.json({ ok: false, error: { code: "INVALID_REPOSITORY", message: "repository.path is required" } }, { status: 400 });
          }
        }
        const url = BASE + spec.path(body);
        try {
          const init: RequestInit = { method: spec.method, headers: { "Content-Type": "application/json" } };
          if (spec.method === "POST") init.body = JSON.stringify(body);
          const upstream = await fetch(url, init);
          const json = await upstream.json().catch(() => ({ ok: false, error: "bad kernel json" }));
          return Response.json(json, { status: upstream.ok ? 200 : 200 });
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
