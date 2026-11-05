import { Container, getContainer } from "@cloudflare/containers";

export class Renderer extends Container {
  defaultPort = 8080;
  sleepAfter = "10m";
  envVars = {};
}

interface Env {
  RENDERER: DurableObjectNamespace<Renderer>;
  ASSETS: R2Bucket;
}

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

const b64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/asset" && request.method === "PUT") {
      const key = url.searchParams.get("key") || crypto.randomUUID();
      await env.ASSETS.put(key, request.body, {
        httpMetadata: { contentType: request.headers.get("content-type") || "application/octet-stream" },
      });
      return json({ key });
    }
    if (url.pathname === "/api/asset" && request.method === "GET") {
      const key = url.searchParams.get("key");
      if (!key) return json({ error: "missing key" }, 400);
      const obj = await env.ASSETS.get(key);
      if (!obj) return json({ error: "not found" }, 404);
      return new Response(obj.body, {
        headers: {
          "content-type": obj.httpMetadata?.contentType || "application/octet-stream",
          "cache-control": "public, max-age=3600",
        },
      });
    }

    if (url.pathname === "/api/render" && request.method === "POST") {
      const job = (await request.json()) as any;
      const assets: Record<string, string> = {};
      for (const [k, ref] of Object.entries(job.assets || {})) {
        const r = ref as string;
        if (r.startsWith("b64:")) { assets[k] = r.slice(4); continue; }
        const obj = await env.ASSETS.get(r);
        if (!obj) return json({ error: `asset ${ref} not found` }, 404);
        assets[k] = b64(await obj.arrayBuffer());
      }
      if (job.audio) {
        if (typeof job.audio === "string" && job.audio.startsWith("b64:")) {
          job.audio = job.audio.slice(4);
        } else {
          const obj = await env.ASSETS.get(job.audio);
          if (obj) job.audio = b64(await obj.arrayBuffer());
          else delete job.audio;
        }
      }
      job.assets = assets;

      const container = getContainer(env.RENDERER, "render-pool-0");
      const res = await container.startAndWaitForPorts(8080).then(() =>
        container.fetch("http://localhost/render", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(job),
        })
      );
      if (!res.ok) return json({ error: await res.text() }, res.status);
      const mp4 = await res.arrayBuffer();
      const key = `renders/${crypto.randomUUID()}.mp4`;
      await env.ASSETS.put(key, mp4, { httpMetadata: { contentType: "video/mp4" } });
      return new Response(mp4, {
        headers: { "content-type": "video/mp4", "x-render-key": key },
      });
    }

    return json({ error: "not found" }, 404);
  },
};
