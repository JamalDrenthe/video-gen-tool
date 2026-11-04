import { Client, handle_file } from "@gradio/client";
import { AspectRatio, VideoConfig, VideoGenerationResult } from "../types";

const IMAGE_TO_VIDEO_SPACE = "zerogpu-aoti/wan2-2-fp8da-aoti-faster";
const FIRST_LAST_FRAME_SPACE = "multimodalart/wan-2-2-first-last-frame";
const TEXT_TO_IMAGE_SPACE = "black-forest-labs/FLUX.1-schnell";

const clients = new Map<string, { token: string; promise: Promise<Client> }>();

const getClient = (space: string): Promise<Client> => {
  const token = localStorage.getItem("vg_hf_token") || "";
  const cached = clients.get(space);
  if (cached?.token === token) return cached.promise;

  const promise = Client.connect(space, token ? { hf_token: token as `hf_${string}` } : {});
  const entry = { token, promise };
  clients.set(space, entry);
  promise.catch(() => {
    if (clients.get(space) === entry) clients.delete(space);
  });
  return promise;
};

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

const toSpaceFile = async (base64: string, aspectRatio: AspectRatio) =>
  handle_file(await centerCropImage(imageBlobFromBase64(base64), aspectRatio));

const outputUrl = (value: any): string | undefined =>
  value?.video?.url ?? value?.image?.url ?? value?.url ?? value;

const downloadBlob = async (uri: string): Promise<Blob> => {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Failed to download the generated file: ${response.status} ${response.statusText}`);
  }
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
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Failed to download the generated start frame: ${response.status} ${response.statusText}`);
  }
  return response.blob();
};

const videoUrlFromResult = (result: any): string => {
  const uri = outputUrl(result?.data?.[0]);
  if (typeof uri !== "string") {
    throw new Error("Hugging Face did not return a video URL.");
  }
  return uri;
};

const runImageToVideo = async (
  inputImage: unknown,
  prompt: string,
  config: VideoConfig,
  onProgress: (status: string) => void
): Promise<string> => {
  const client = await getClient(IMAGE_TO_VIDEO_SPACE);
  onProgress("Job queued on Hugging Face ZeroGPU...");
  const result = await client.predict("/generate_video", {
    input_image: inputImage,
    prompt,
    steps: qualitySteps(config.quality),
    duration_seconds: 3.5,
    guidance_scale: 1,
    guidance_scale_2: 1,
    seed: 42,
    randomize_seed: true
  });
  return videoUrlFromResult(result);
};

const runFirstLastFrame = async (
  startImage: unknown,
  endImage: unknown,
  prompt: string,
  config: VideoConfig,
  onProgress: (status: string) => void
): Promise<string> => {
  const client = await getClient(FIRST_LAST_FRAME_SPACE);
  onProgress("Job queued on Hugging Face ZeroGPU...");
  const result = await client.predict("/generate_video", {
    start_image_pil: startImage,
    end_image_pil: endImage,
    prompt,
    duration_seconds: 2.1,
    steps: qualitySteps(config.quality, true),
    guidance_scale: 1,
    guidance_scale_2: 1,
    seed: 42,
    randomize_seed: true
  });
  return videoUrlFromResult(result);
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
    const client = await getClient(TEXT_TO_IMAGE_SPACE);
    const width = config.aspectRatio === "16:9" ? 832 : 480;
    const height = config.aspectRatio === "16:9" ? 480 : 832;
    const imageResult = await client.predict("/infer", {
      prompt: config.prompt,
      seed: 42,
      randomize_seed: true,
      width,
      height,
      num_inference_steps: 4
    });
    const imageUrl = outputUrl((imageResult as any)?.data?.[0]);
    if (typeof imageUrl !== "string") {
      throw new Error("Hugging Face did not return a start frame URL.");
    }
    const startFrameBlob = await centerCropImage(await fetchImage(imageUrl), config.aspectRatio);
    const startFrame = handle_file(startFrameBlob);
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
  const inputImage = handle_file(croppedFrame);
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
