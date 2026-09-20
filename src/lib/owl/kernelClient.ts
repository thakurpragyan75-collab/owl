/** Thin OWL ↔ Cognitive Kernel adapter. HUD does not import kernel internals.
 * Protocol: kernel.v1  Repo: https://github.com/thakurpragyan75-collab/owl-cognitive-kernel
 * Talks same-origin /api/kernel which proxies loopback 127.0.0.1:8770.
 * If the kernel is down, callers get { ok:false } and OWL chat still works.
 */
export const KERNEL_PROTOCOL = "kernel.v1";

export type KernelHealth = { ok: boolean; protocol?: string; error?: string; jobs?: number };

type KernelJson = Record<string, unknown>;

async function kernelCall(op: string, body: Record<string, unknown> = {}, timeoutMs = 8000): Promise<KernelJson> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("/api/kernel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op, ...body }),
      signal: ctrl.signal,
    });
    const json = (await res.json().catch(() => ({}))) as KernelJson;
    if (!res.ok) return { ok: false, error: (json.error as string) || `kernel ${res.status}`, ...json };
    return json;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "kernel offline" };
  } finally {
    clearTimeout(t);
  }
}

export async function kernelHealth(): Promise<KernelHealth> {
  const body = await kernelCall("health", {}, 1200);
  if (body.ok === false || body.error) return { ok: false, error: String(body.error || "kernel offline") };
  return { ok: true, protocol: String(body.protocol || KERNEL_PROTOCOL), jobs: Number(body.jobs || 0) };
}

export async function kernelStart(source: string): Promise<{ task_id?: string; error?: string }> {
  const body = await kernelCall("start_task", { source }, 8000);
  if (body.error && !body.task_id) return { error: String(body.error) };
  return { task_id: String(body.task_id || "") };
}

export async function kernelResult(taskId: string): Promise<KernelJson> {
  return kernelCall("retrieve_result", { task_id: taskId }, 8000);
}

export async function kernelCancel(taskId: string): Promise<KernelJson> {
  return kernelCall("cancel_task", { task_id: taskId }, 4000);
}

export async function kernelTrace(taskId: string): Promise<KernelJson> {
  return kernelCall("inspect_trace", { task_id: taskId }, 8000);
}

export async function runKernelGoal(source: string, onTick?: (msg: string) => void): Promise<string> {
  const health = await kernelHealth();
  if (!health.ok) {
    return "Kernel is offline. Chat, relics, forge, and gaze still work. Start the local kernel on this machine if you want coding tasks.";
  }
  onTick?.("Kernel accepted the goal. Isolated candidate running.");
  const started = await kernelStart(source);
  if (!started.task_id) return `Kernel refused: ${started.error || "no task id"}`;
  const id = started.task_id;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const job = await kernelResult(id);
    const state = String(job.state || "");
    if (state === "RUNNING" || state === "") {
      onTick?.(`Kernel working (${i + 1}).`);
      continue;
    }
    if (job.ok) {
      const diff = String(job.diff || "").slice(0, 1200);
      const changed = Array.isArray(job.changed) ? (job.changed as string[]).join(", ") : "";
      return `Kernel verified an isolated candidate (${job.provider || "model"}). Changed: ${changed || "see diff"}.\n${diff || "(no source diff)"}`;
    }
    return `Kernel did not verify a candidate: ${String(job.error || job.tests || state).slice(0, 800)}`;
  }
  return `Kernel task ${id} is still running. Ask me to inspect the trace if you want the log.`;
}
