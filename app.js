import { Client, handle_file } from "https://cdn.jsdelivr.net/npm/@gradio/client@1.15.7/dist/index.min.js";

// Publieke Space met Wan2.1-VACE-14B (+ FusionX LoRA) op ZeroGPU.
const SPACE = "linoyts/wan2-1-VACE-fast";

const $ = (id) => document.getElementById(id);
$("spaceName").textContent = SPACE;
$("negative").value =
  "Bright tones, overexposed, static, blurred details, subtitles, style, " +
  "works, paintings, images, static, overall gray, worst quality, low " +
  "quality, JPEG compression residue, ugly, incomplete, extra fingers, " +
  "poorly drawn hands, poorly drawn faces, deformed, disfigured, " +
  "misshapen limbs, fused fingers, still picture, messy background, " +
  "three legs, many people in the background, walking backwards, " +
  "watermark, text, signature";

let clientPromise = null;
const getClient = () => (clientPromise ??= Client.connect(SPACE));

$("themeToggle").onclick = () => document.body.classList.toggle("light");

const previews = $("previews");
$("images").addEventListener("change", (e) => {
  previews.innerHTML = "";
  for (const f of e.target.files) {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(f);
    img.className = "thumb";
    previews.appendChild(img);
  }
});

function setStatus(text, busy) {
  $("status").textContent = text;
  $("generate").disabled = busy;
  $("generate").textContent = busy ? "Bezig…" : "Genereer video";
}

$("generate").onclick = async () => {
  const files = [...$("images").files];
  const mode = $("mode").value;
  const prompt = $("prompt").value.trim();
  if (!prompt) { setStatus("Vul eerst een prompt in.", false); return; }
  if (!files.length) { setStatus("Upload minimaal één beeld — VACE genereert video vanuit beelden.", false); return; }
  if (mode === "First - Last Frame" && files.length < 2) {
    setStatus("First - Last Frame heeft minimaal 2 beelden nodig.", false); return;
  }

  const [h, w] = $("size").value.split("x").map(Number);
  try {
    setStatus("Uploaden + verbinden met Space…", true);
    const client = await getClient();
    setStatus("Video wordt gegenereerd (ZeroGPU-wachtrij kan duren)…", true);

    const gallery = files.map((f) => ({ image: handle_file(f) }));
    const result = await client.predict("/generate_video", {
      gallery_images: gallery,
      mode,
      prompt,
      height: h,
      width: w,
      negative_prompt: $("negative").value,
      duration_seconds: Number($("duration").value),
      guidance_scale: Number($("cfg").value),
      steps: Number($("steps").value),
      seed: Number($("seed").value),
      randomize_seed: Number($("seed").value) < 0,
      remove_bg: $("removeBg").value === "yes",
    });

    const vid = result.data[0];
    const url = vid?.video?.url ?? vid?.url ?? vid?.video?.path ?? vid?.path;
    $("video").src = url;
    $("download").href = url;
    $("resultCard").classList.remove("hidden");
    setStatus(`Klaar. Seed: ${result.data[1]}`, false);
  } catch (err) {
    console.error(err);
    setStatus("Fout: " + (err?.message ?? err), false);
  }
};
