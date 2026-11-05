// Proxy scene-render jobs to the Cloudflare Worker that drives the
// renderer container. The worker returns the rendered mp4 directly.
const WORKER_URL = "https://video-gen-renderer.js-drenthe.workers.dev";

export const onRequestPost: PagesFunction = async ({ request }) => {
  const res = await fetch(`${WORKER_URL}/api/render`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await request.text(),
  });
  const ct = res.headers.get("content-type") || "application/octet-stream";
  return new Response(res.body, {
    status: res.status,
    headers: { "content-type": ct.includes("video") ? "video/mp4" : "application/json" },
  });
};
