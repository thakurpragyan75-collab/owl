import { createFileRoute } from "@tanstack/react-router";

function allowed(host: string) {
  return host === "x.ai" || host.endsWith(".x.ai");
}

export const Route = createFileRoute("/api/owl-media")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const raw = new URL(request.url).searchParams.get("u") ?? "";
        let target: URL;
        try {
          target = new URL(raw);
        } catch {
          return new Response("bad url", { status: 400 });
        }
        if (target.protocol !== "https:" || !allowed(target.hostname)) {
          return new Response("blocked", { status: 400 });
        }
        const upstream = await fetch(target.toString(), {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            Accept: "video/mp4,image/*,*/*",
          },
        });
        if (!upstream.ok) {
          return new Response("upstream", { status: 502 });
        }
        const buf = new Uint8Array(await upstream.arrayBuffer());
        if (!buf.length) return new Response("empty", { status: 502 });

        let type = (upstream.headers.get("content-type") || "").split(";")[0] || "";
        if (!type || type === "application/octet-stream") {
          const isMp4 = buf.length > 12 && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70;
          type = isMp4 ? "video/mp4" : "application/octet-stream";
        }

        const headers = (start: number, end: number, total: number, partial: boolean) => ({
          "Content-Type": type,
          "Content-Length": String(end - start + 1),
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=3600",
          ...(partial ? { "Content-Range": `bytes ${start}-${end}/${total}` } : {}),
        });

        const range = request.headers.get("range");
        const m = range?.match(/bytes=(\d+)-(\d*)/);
        if (m) {
          const start = Number(m[1]);
          const end = m[2] ? Number(m[2]) : buf.length - 1;
          if (start >= buf.length || end >= buf.length || start > end) {
            return new Response("range", { status: 416, headers: { "Content-Range": `bytes */${buf.length}` } });
          }
          return new Response(buf.subarray(start, end + 1), {
            status: 206,
            headers: headers(start, end, buf.length, true),
          });
        }

        return new Response(buf, { headers: headers(0, buf.length - 1, buf.length, false) });
      },
    },
  },
});
