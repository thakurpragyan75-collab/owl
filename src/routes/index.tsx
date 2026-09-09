import { createFileRoute } from "@tanstack/react-router";
import { OwlApp } from "@/components/owl/OwlApp";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <OwlApp />;
}
