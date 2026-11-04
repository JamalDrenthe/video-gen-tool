type Ctx = {
  request: Request;
  env: { HF_TOKEN?: string };
};

const SPACES = {
  i2v: {
    host: "zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space",
    api: "generate_video"
  },
  flf: {
    host: "multimodalart-wan-2-2-first-last-frame.hf.space",
    api: "generate_video"
  },
  flux: {
    host: "black-forest-labs-flux-1-schnell.hf.space",
    api: "infer"
  }
} as const;

type SpaceName = keyof typeof SPACES;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });

const getSpace = (value: unknown): typeof SPACES[SpaceName] | undefined =>
  typeof value === "string" && value in SPACES
    ? SPACES[value as SpaceName]
    : undefined;

const authorizationHeaders = (request: Request, env: Ctx["env"]): Headers => {
  const headers = new Headers();
  const token = request.headers.get("x-hf-token")?.trim() || env.HF_TOKEN?.trim();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
};

const imageBlob = (base64: string): Blob => {
  const encoded = base64.replace(/^data:[^,]*,/, "");
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: "image/jpeg" });
};

export const onRequestPost = async (ctx: Ctx): Promise<Response> => {
  let body: {
    space?: unknown;
    data?: unknown;
    files?: Record<string, string>;
  };
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  const space = getSpace(body.space);
  if (!space) return json({ error: "Unsupported Hugging Face Space." }, 400);
  if (!Array.isArray(body.data)) return json({ error: "Request data must be an array." }, 400);

  const data = [...body.data];
  const files = body.files && typeof body.files === "object" && !Array.isArray(body.files)
    ? body.files
    : {};
  const headers = authorizationHeaders(ctx.request, ctx.env);

  try {
    for (const [indexText, encodedFile] of Object.entries(files)) {
      const index = Number(indexText);
      if (!Number.isInteger(index) || index < 0 || index >= data.length || typeof encodedFile !== "string") {
        return json({ error: "Invalid file argument." }, 400);
      }

      let blob: Blob;
      try {
        blob = imageBlob(encodedFile);
      } catch {
        return json({ error: "Invalid base64 image data." }, 400);
      }

      const form = new FormData();
      form.append("files", blob, `image-${index}.jpg`);
      const upload = await fetch(`https://${space.host}/gradio_api/upload`, {
        method: "POST",
        headers,
        body: form
      });
      if (!upload.ok) {
        return json({ error: await upload.text() }, upload.status);
      }

      const uploadedPaths: unknown = await upload.json();
      if (!Array.isArray(uploadedPaths) || typeof uploadedPaths[0] !== "string") {
        return json({ error: "Hugging Face returned an invalid upload response." }, 502);
      }
      data[index] = {
        path: uploadedPaths[0],
        meta: { _type: "gradio.FileData" }
      };
    }

    headers.set("content-type", "application/json");
    const upstream = await fetch(`https://${space.host}/gradio_api/call/${space.api}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ data })
    });
    if (!upstream.ok) {
      return json({ error: await upstream.text() }, upstream.status);
    }
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
};
