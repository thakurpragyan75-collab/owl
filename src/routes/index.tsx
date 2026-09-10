import { Component, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { OwlApp } from "@/components/owl/OwlApp";

export const Route = createFileRoute("/")({ component: Home });

class RoostGuard extends Component<{ children: ReactNode }, { err: string | null }> {
  state: { err: string | null } = { err: null };
  static getDerivedStateFromError(error: Error) {
    return { err: error.message || "stumbled" };
  }
  render() {
    if (this.state.err) {
      return (
        <div className="grid min-h-dvh place-items-center bg-bg p-6 text-center text-fg">
          <div className="max-w-sm space-y-4">
            <p className="font-display text-3xl">Roost stumbled.</p>
            <p className="text-sm text-muted">A saved nest file was in the way. Reset and enter again.</p>
            <button
              type="button"
              className="min-h-11 rounded-md bg-accent px-5 text-sm font-medium text-accent-fg"
              onClick={() => {
                try {
                  localStorage.removeItem("owl-roost-v2");
                } catch {
                  /* ignore */
                }
                window.location.reload();
              }}
            >
              Reset nest
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Home() {
  return (
    <RoostGuard>
      <OwlApp />
    </RoostGuard>
  );
}
