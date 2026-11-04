import { AspectRatio, VideoConfig, VideoGenerationResult } from "../types";

type Space = "i2v" | "flf" | "flux";

const imageBlobFromBase64 = (base64: string): Blob => {
  const encoded = base64.replace(/^data:[^,]*,/, "");
  const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
  return new Blob([bytes], { type: "image/jpeg" });
};

const canvasBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("Could not prepare the image for Hugging Face."));
    }, "image/jpeg", 0.92);
  });

const centerCropImage = async (image: Blob, aspectRatio: AspectRatio): Promise<Blob> => {
  const bitmap = await createImageBitmap(image);
  const targetRatio = aspectRatio === "16:9" ? 16 / 9 : 9 / 16;
  let sx = 0;
  let sy = 0;
  let sw = bitmap.width;
  let sh = bitmap.height;

  if (bitmap.width / bitmap.height > targetRatio) {
    sw = Math.round(bitmap.height * targetRatio);
    sx = Math.round((bitmap.width - sw) / 2);
  } else {
    sh = Math.round(bitmap.width / targetRatio);
    sy = Math.round((bitmap.height - sh) / 2);
  }

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare the image for Hugging Face.");
  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  bitmap.close();
  return canvasBlob(canvas);
};

const blobToBase64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
};

const toSpaceFile = async (base64: string, aspectRatio: AspectRatio): Promise<string> =>
  blobToBase64(await centerCropImage(imageBlobFromBase64(base64), aspectRatio));

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem("vg_hf_token");
  return token ? { "x-hf-token": token } : {};
};

const requestError = async (response: Response): Promise<Error> => {
  const text = await response.text();
  let message = text;
  try {
    const body = JSON.parse(text);
    if (typeof body?.error === "string") message = body.error;
    else if (body) message = JSON.stringify(body);
  } catch {
    message = text;
  }
  return new Error(`Hugging Face request failed with HTTP ${response.status}: ${message}`);
};

const parseSseBlock = (block: string): { event: string; data: string } => {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? "" : line.slice(separator + 1).replace(/^ /, "");
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  return { event, data: data.join("\n") };
};

const eventError = (value: string): string => {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === "string") return parsed;
    if (typeof parsed?.error === "string") return parsed.error;
    if (parsed) return JSON.stringify(parsed);
  } catch {
    return value;
  }
  return "";
};

const callSpace = async (
  space: Space,
  data: unknown[],
  files: Record<string, string>,
  onProgress: (status: string) => void
): Promise<any[]> => {
  const startResponse = await fetch("/api/hf/start", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify({ space, data, files })
  });
  if (!startResponse.ok) throw await requestError(startResponse);

  const startBody = await startResponse.json();
  if (typeof startBody?.event_id !== "string") {
    throw new Error("Hugging Face did not return an event ID.");
  }

  onProgress("Job queued on Hugging Face ZeroGPU...");
  const resultUrl = new URL("/api/hf/result", window.location.origin);
  resultUrl.searchParams.set("space", space);
  resultUrl.searchParams.set("event_id", startBody.event_id);
  const resultResponse = await fetch(resultUrl, { headers: authHeaders() });
  if (!resultResponse.ok) throw await requestError(resultResponse);
  if (!resultResponse.body) throw new Error("Hugging Face returned an empty event stream.");

  const reader = resultResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    if (done) buffer += decoder.decode();
    buffer = buffer.replace(/\r\n/g, "\n");

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const { event, data: eventData } = parseSseBlock(block);
      if (event === "complete") {
        await reader.cancel();
        const result = JSON.parse(eventData);
        if (!Array.isArray(result)) throw new Error("Hugging Face returned an invalid result.");
        return result;
      }
      if (event === "error") {
        await reader.cancel();
        throw new Error(eventError(eventData) || "Hugging Face Space returned an error (often ZeroGPU quota). Try again later or add a token.");
      }
      if (event === "generating" || event === "progress") {
        onProgress("Generating on Hugging Face ZeroGPU...");
      }
      boundary = buffer.indexOf("\n\n");
    }

    if (done) {
      if (buffer.trim()) {
        const { event, data: eventData } = parseSseBlock(buffer);
        if (event === "complete") {
          const result = JSON.parse(eventData);
          if (!Array.isArray(result)) throw new Error("Hugging Face returned an invalid result.");
          return result;
        }
        if (event === "error") {
          throw new Error(eventError(eventData) || "Hugging Face Space returned an error (often ZeroGPU quota). Try again later or add a token.");
        }
      }
      throw new Error("Hugging Face event stream ended before the job completed.");
    }
  }
};

const outputUrl = (value: any): string | undefined =>
  value?.video?.url ?? value?.image?.url ?? value?.url ?? value;

const downloadBlob = async (uri: string): Promise<Blob> => {
  const response = await fetch(`/api/hf/file?url=${encodeURIComponent(uri)}`, {
    headers: authHeaders()
  });
  if (!response.ok) throw await requestError(response);
  const blob = await response.blob();
  if (blob.size === 0) throw new Error("Downloaded video file is empty.");
  return blob;
};

const qualitySteps = (quality: VideoConfig["quality"], firstLastFrame = false): number => {
  if (firstLastFrame) {
    return quality === "low" ? 6 : quality === "high" ? 10 : 8;
  }
  return quality === "low" ? 4 : quality === "high" ? 8 : 6;
};

const fetchImage = async (uri: string): Promise<Blob> => {
  const response = await fetch(`/api/hf/file?url=${encodeURIComponent(uri)}`, {
    headers: authHeaders()
  });
  if (!response.ok) throw await requestError(response);
  return response.blob();
};

const videoUrlFromResult = (data: any[]): string => {
  const uri = outputUrl(data?.[0]);
  if (typeof uri !== "string") {
    throw new Error("Hugging Face did not return a video URL.");
  }
  return uri;
};

const runImageToVideo = async (
  inputImage: string,
  prompt: string,
  config: VideoConfig,
  onProgress: (status: string) => void
): Promise<string> => {
  const data = await callSpace(
    "i2v",
    [null, prompt, qualitySteps(config.quality), "", 3.5, 1, 1, 42, true],
    { "0": inputImage },
    onProgress
  );
  return videoUrlFromResult(data);
};

const runFirstLastFrame = async (
  startImage: string,
  endImage: string,
  prompt: string,
  config: VideoConfig,
  onProgress: (status: string) => void
): Promise<string> => {
  const data = await callSpace(
    "flf",
    [null, null, prompt, "", 2.1, qualitySteps(config.quality, true), 1, 1, 42, true],
    { "0": startImage, "1": endImage },
    onProgress
  );
  return videoUrlFromResult(data);
};

const captureLastFrame = async (videoUrl: string): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    const cleanup = () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    };

    const fail = () => {
      cleanup();
      reject(new Error("Could not extract the last frame from the previous video."));
    };

    const drawFrame = async () => {
      if (!video.videoWidth || !video.videoHeight) {
        fail();
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        fail();
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      cleanup();
      try {
        resolve(await canvasBlob(canvas));
      } catch (error) {
        reject(error);
      }
    };

    video.addEventListener("error", fail, { once: true });
    video.addEventListener("loadedmetadata", () => {
      const seekTime = Math.max(0, video.duration - 0.05);
      if (seekTime === 0) {
        video.addEventListener("loadeddata", drawFrame, { once: true });
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) void drawFrame();
        return;
      }
      video.addEventListener("seeked", drawFrame, { once: true });
      video.currentTime = seekTime;
    }, { once: true });

    video.src = videoUrl;
  });

const createVideoResult = async (
  hfVideoUrl: string,
  aspectRatio: AspectRatio
): Promise<VideoGenerationResult> => {
  const blob = await downloadBlob(hfVideoUrl);
  const blobUrl = URL.createObjectURL(blob);
  return {
    blobUrl,
    serverUri: hfVideoUrl,
    rawVideoObject: { url: hfVideoUrl, blobUrl, aspectRatio }
  };
};

export const generateVeoVideo = async (
  config: VideoConfig,
  onProgress: (status: string) => void
): Promise<VideoGenerationResult> => {
  let hfVideoUrl: string;

  if (config.mode === "text") {
    onProgress("Generating start frame with FLUX...");
    const imageData = await callSpace(
      "flux",
      [
        config.prompt,
        42,
        true,
        config.aspectRatio === "16:9" ? 832 : 480,
        config.aspectRatio === "16:9" ? 480 : 832,
        4
      ],
      {},
      onProgress
    );
    const imageUrl = outputUrl(imageData?.[0]);
    if (typeof imageUrl !== "string") {
      throw new Error("Hugging Face did not return a start frame URL.");
    }
    const startFrameBlob = await centerCropImage(await fetchImage(imageUrl), config.aspectRatio);
    const startFrame = await blobToBase64(startFrameBlob);
    hfVideoUrl = await runImageToVideo(startFrame, config.prompt, config, onProgress);
  } else if (config.mode === "keyframes" || config.mode === "key_ref") {
    if (!config.sourceImageBase64 || !config.endImageBase64) {
      throw new Error("Select both a starting frame and an ending frame.");
    }
    const [startImage, endImage] = await Promise.all([
      toSpaceFile(config.sourceImageBase64, config.aspectRatio),
      toSpaceFile(config.endImageBase64, config.aspectRatio)
    ]);
    hfVideoUrl = await runFirstLastFrame(startImage, endImage, config.prompt, config, onProgress);
  } else {
    const base64 = config.mode === "reference"
      ? config.referenceImagesBase64?.[0]
      : config.sourceImageBase64;
    if (!base64) {
      throw new Error(config.mode === "reference"
        ? "Select a reference image."
        : "Select an image to use as the starting frame.");
    }
    const inputImage = await toSpaceFile(base64, config.aspectRatio);
    hfVideoUrl = await runImageToVideo(inputImage, config.prompt, config, onProgress);
  }

  onProgress("Downloading video...");
  const result = await createVideoResult(hfVideoUrl, config.aspectRatio);
  onProgress("Done.");
  return result;
};

export const extendVeoVideo = async (
  prompt: string,
  rawVideoObject: any,
  aspectRatio: AspectRatio,
  onProgress: (status: string) => void
): Promise<VideoGenerationResult> => {
  const previousVideoUrl = rawVideoObject?.blobUrl || rawVideoObject?.url;
  if (!previousVideoUrl) throw new Error("The previous video is unavailable for extension.");

  onProgress("Extracting the last frame...");
  const lastFrame = await captureLastFrame(previousVideoUrl);
  const croppedFrame = await centerCropImage(lastFrame, aspectRatio);
  const inputImage = await blobToBase64(croppedFrame);
  const config: VideoConfig = {
    prompt,
    aspectRatio,
    resolution: "720p",
    mode: "image",
    quality: "standard"
  };
  const hfVideoUrl = await runImageToVideo(inputImage, prompt, config, onProgress);
  onProgress("Downloading video...");
  const result = await createVideoResult(hfVideoUrl, aspectRatio);
  onProgress("Done.");
  return result;
};

export const downloadVideoUri = async (uri: string): Promise<string> => {
  const blob = await downloadBlob(uri);
  return URL.createObjectURL(blob);
};
