/** Thin OWL ↔ Cognitive Kernel adapter. HUD does not import kernel internals.
 * Protocol: kernel.v1  Repo: https://github.com/thakurpragyan75-collab/owl-cognitive-kernel
 * This file is reversible: nothing in askMind calls it yet.
 */
export const KERNEL_PROTOCOL = "kernel.v1";

export type KernelHealth = { ok: boolean; protocol?: string; error?: string };

export async function kernelHealth(base = "http://127.0.0.1:8770"): Promise<KernelHealth> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 800);
    const res = await fetch(`${base}/v1/health`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return { ok: false, error: `kernel ${res.status}` };
    const body = (await res.json()) as KernelHealth;
    return { ok: true, protocol: body.protocol || KERNEL_PROTOCOL };
  } catch {
    return { ok: false, error: "kernel offline" };
  }
}
