type Ctx = {
  request: Request;
  env: { HF_TOKEN?: string };
};

const SPACES = {
  i2v: "zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space",
  flf: "multimodalart-wan-2-2-first-last-frame.hf.space",
  flux: "black-forest-labs-flux-1-schnell.hf.space"
} as const;

type SpaceName = keyof typeof SPACES;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });

const authorizationHeaders = (request: Request, env: Ctx["env"]): Headers => {
  const headers = new Headers();
  const token = env.HF_TOKEN?.trim();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
};

export const onRequestGet = async (ctx: Ctx): Promise<Response> => {
  const url = new URL(ctx.request.url);
  const spaceName = url.searchParams.get("space");
  const eventId = url.searchParams.get("event_id");
  if (!spaceName || !(spaceName in SPACES)) {
    return json({ error: "Unsupported Hugging Face Space." }, 400);
  }
  if (!eventId) return json({ error: "Missing Hugging Face event ID." }, 400);

  const space = SPACES[spaceName as SpaceName];
  try {
    const upstream = await fetch(
      `https://${space}/gradio_api/call/${spaceName === "flux" ? "infer" : "generate_video"}/${encodeURIComponent(eventId)}`,
      { headers: authorizationHeaders(ctx.request, ctx.env) }
    );
    if (!upstream.ok) {
      return json({ error: await upstream.text() }, upstream.status);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache"
      }
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
};
