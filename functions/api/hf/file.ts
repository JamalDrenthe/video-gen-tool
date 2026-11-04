type Ctx = {
  request: Request;
  env: { HF_TOKEN?: string };
};

const ALLOWED_HOSTS = new Set([
  "zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space",
  "multimodalart-wan-2-2-first-last-frame.hf.space",
  "black-forest-labs-flux-1-schnell.hf.space"
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });

const allowedUrl = (value: string): URL | undefined => {
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      url.port === "" &&
      !url.username &&
      !url.password &&
      ALLOWED_HOSTS.has(url.hostname)
    ) {
      return url;
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const authorizationHeaders = (request: Request, env: Ctx["env"]): Headers => {
  const headers = new Headers();
  const token = request.headers.get("x-hf-token")?.trim() || env.HF_TOKEN?.trim();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
};

export const onRequestGet = async (ctx: Ctx): Promise<Response> => {
  const requestUrl = new URL(ctx.request.url);
  const fileUrl = requestUrl.searchParams.get("url");
  if (!fileUrl || !allowedUrl(fileUrl)) {
    return json({ error: "File URL is not allowed." }, 403);
  }

  let currentUrl = fileUrl;
  try {
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      const upstream = await fetch(currentUrl, {
        headers: authorizationHeaders(ctx.request, ctx.env),
        redirect: "manual"
      });
      if (upstream.status >= 300 && upstream.status < 400) {
        const location = upstream.headers.get("location");
        if (!location || redirects === 3) {
          return json({ error: "Hugging Face file redirect could not be followed." }, 502);
        }
        const redirectUrl = allowedUrl(new URL(location, currentUrl).toString());
        if (!redirectUrl) return json({ error: "File URL is not allowed." }, 403);
        currentUrl = redirectUrl.toString();
        continue;
      }

      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "content-type": upstream.headers.get("content-type") || "application/octet-stream",
          "cache-control": "no-cache"
        }
      });
    }
    return json({ error: "Too many Hugging Face file redirects." }, 502);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
};
