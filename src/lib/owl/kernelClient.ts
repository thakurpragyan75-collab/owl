/** Thin OWL ↔ Cognitive Kernel adapter. HUD does not import kernel internals.
 * Protocol: kernel.v1
 * Same-origin /api/kernel proxies loopback 127.0.0.1:8770.
 */
export const KERNEL_PROTOCOL = "kernel.v1";

export type KernelHealth = { ok: boolean; protocol?: string; error?: string; jobs?: number };

type KernelJson = Record<string, unknown>;

let lastTaskId = "";

async function kernelCall(op: string, body: Record<string, unknown> = {}, timeoutMs = 12000): Promise<KernelJson> {
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
    if (!res.ok) return { ok: false, error: json.error || `kernel ${res.status}`, ...json };
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

export async function kernelContext(): Promise<{ path: string; label: string } | { error: string }> {
  const body = await kernelCall("context", {}, 2000);
  const repo = body.repository as { path?: string; label?: string } | undefined;
  if (!repo?.path) return { error: String(body.error || "no repository in trusted context") };
  return { path: repo.path, label: repo.label || "project" };
}

export async function kernelStart(source: string, repoPath: string): Promise<{ task_id?: string; error?: string; repository?: KernelJson }> {
  const body = await kernelCall("start_task", { source, repository: { path: repoPath } }, 8000);
  if (body.error && !body.task_id) {
    const err = body.error;
    return { error: typeof err === "string" ? err : JSON.stringify(err) };
  }
  lastTaskId = String(body.task_id || "");
  return { task_id: lastTaskId, repository: body.repository as KernelJson };
}

export async function kernelResult(taskId: string): Promise<KernelJson> {
  return kernelCall("retrieve_result", { task_id: taskId }, 8000);
}

export async function kernelGetTask(taskId: string): Promise<KernelJson> {
  return kernelCall("get_task", { task_id: taskId }, 4000);
}

export async function kernelCancel(taskId: string): Promise<KernelJson> {
  return kernelCall("cancel_task", { task_id: taskId }, 4000);
}

export async function kernelApprove(taskId = lastTaskId): Promise<KernelJson> {
  return kernelCall("approve_action", { task_id: taskId, approval: { actor: "human" } }, 8000);
}

export async function kernelReject(taskId = lastTaskId): Promise<KernelJson> {
  return kernelCall("reject_action", { task_id: taskId }, 8000);
}

function errText(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v && "message" in v) return String((v as { message: string }).message);
  return JSON.stringify(v);
}

function taskView(job: KernelJson): KernelJson {
  const nested = job.task;
  return nested && typeof nested === "object" ? (nested as KernelJson) : job;
}

export async function runKernelGoal(source: string, onTick?: (msg: string) => void): Promise<string> {
  const health = await kernelHealth();
  if (!health.ok) {
    return "Kernel is offline. Chat, relics, forge, and gaze still work. Start the local kernel on this machine if you want coding tasks.";
  }
  const ctx = await kernelContext();
  if ("error" in ctx) {
    return `I cannot pick a repository myself. Set OWL_KERNEL_REPO to the project path. (${ctx.error})`;
  }
  onTick?.("Got it. I'm inspecting the current project.");
  const started = await kernelStart(source, ctx.path);
  if (!started.task_id) return `Kernel refused: ${started.error || "no task id"}`;
  const id = started.task_id;
  onTick?.(`Repository: ${ctx.label}\nCreating an isolated candidate...`);
  let sawFail = false;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 400));
    const snap = await kernelGetTask(id);
    const t = taskView(snap);
    const state = String(t.state || snap.state || "");
    const attempt = Number(t.attempt || 0);
    if (state === "VERIFYING") onTick?.("Found the relevant failure. Running tests...");
    if (attempt >= 1 && !sawFail) {
      sawFail = true;
      onTick?.("First candidate failed. I'm re-evaluating the failure.");
    }
    if (state === "RUNNING" || state === "VERIFYING" || state === "" || state === "CANCEL_REQUESTED") {
      continue;
    }
    const job = await kernelResult(id);
    const view = taskView(job);
    const finalState = String(view.state || job.state || state);
    if (finalState === "WAITING_FOR_APPROVAL" || finalState === "READY_FOR_PROMOTION") {
      const tests = (view.tests && typeof view.tests === "object" ? view.tests : null) as { passed?: boolean; summary?: string } | null;
      const changed = Array.isArray(view.changed_files)
        ? (view.changed_files as string[]).join(", ")
        : Array.isArray(job.changed)
          ? (job.changed as string[]).join(", ")
          : "";
      const security = view.security as { passed?: boolean } | undefined;
      const lines = [
        `Repository: ${ctx.label}`,
        sawFail ? "Second candidate passes." : "Candidate verified.",
        tests?.summary ? `${tests.summary}.` : "Tests passed on the isolated copy.",
        security?.passed === false ? "Security checks reported findings." : "Security checks passed.",
        changed ? `Changed in candidate: ${changed}.` : "",
        "Your original repository is still untouched.",
        finalState === "WAITING_FOR_APPROVAL"
          ? "The verified candidate is ready for approval. Say approve or reject."
          : "Candidate approved and ready for promotion.",
        String(view.diff || job.diff || "").slice(0, 800),
      ].filter(Boolean);
      return lines.join("\n");
    }
    if (finalState === "CANCELLED") return "Kernel task cancelled. Origin was not modified.";
    return `Kernel did not verify a candidate: ${errText(job.error) || finalState}`.slice(0, 800);
  }
  return `Kernel task ${id} is still running.`;
}

export async function runKernelApprove(): Promise<string> {
  if (!lastTaskId) return "There is no kernel candidate waiting.";
  const out = await kernelApprove(lastTaskId);
  if (out.state === "READY_FOR_PROMOTION") {
    return "Candidate approved and ready for promotion. The origin repository was not modified.";
  }
  return `Approval did not complete: ${errText(out.error) || String(out.state || "")}`;
}

export async function runKernelReject(): Promise<string> {
  if (!lastTaskId) return "There is no kernel candidate to reject.";
  await kernelReject(lastTaskId);
  return "Candidate discarded. Origin is untouched.";
}
