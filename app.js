import { Client, handle_file } from "https://cdn.jsdelivr.net/npm/@gradio/client@1.15.7/dist/index.min.js";

// Publieke Space met Wan2.2 (fp8/AOTI, snel) op ZeroGPU — image-to-video.
const SPACE = "zerogpu-aoti/wan2-2-fp8da-aoti-faster";

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
const hfTokenInput = $("hfToken");
hfTokenInput.value = localStorage.getItem("vg_hf_token") || "";
const getClient = () => {
  const token = hfTokenInput.value.trim();
  if (token) localStorage.setItem("vg_hf_token", token);
  clientPromise ??= Client.connect(SPACE, token ? { hf_token: token } : {});
  return clientPromise;
};

$("themeToggle").onclick = () => document.body.classList.toggle("light");

const previews = $("previews");
$("image").addEventListener("change", (e) => {
  previews.innerHTML = "";
  const f = e.target.files[0];
  if (!f) return;
  const img = document.createElement("img");
  img.src = URL.createObjectURL(f);
  img.className = "thumb";
  previews.appendChild(img);
});

function setStatus(text, busy) {
  $("status").textContent = text;
  $("generate").disabled = busy;
  $("generate").textContent = busy ? "Bezig…" : "Genereer video";
}

$("generate").onclick = async () => {
  const file = $("image").files[0];
  const prompt = $("prompt").value.trim();
  if (!prompt) { setStatus("Vul eerst een prompt in.", false); return; }
  if (!file) { setStatus("Upload eerst een beeld — het model animeert vanuit een afbeelding.", false); return; }

  try {
    setStatus("Uploaden + verbinden met Space…", true);
    const client = await getClient();
    setStatus("Video wordt gegenereerd (ZeroGPU-wachtrij kan duren)…", true);

    const seed = Number($("seed").value);
    const result = await client.predict("/generate_video", {
      input_image: handle_file(file),
      prompt,
      steps: Number($("steps").value),
      negative_prompt: $("negative").value,
      duration_seconds: Number($("duration").value),
      guidance_scale: Number($("cfg").value),
      guidance_scale_2: Number($("cfg").value),
      seed: seed < 0 ? 42 : seed,
      randomize_seed: seed < 0,
    });

    const vid = result.data[0];
    const url = vid?.video?.url ?? vid?.url ?? vid?.video?.path ?? vid?.path ?? vid;
    $("video").src = url;
    $("download").href = url;
    $("resultCard").classList.remove("hidden");
    setStatus(`Klaar. Seed: ${result.data[1]}`, false);
  } catch (err) {
    console.error(err);
    let msg = err?.message ?? String(err);
    if (msg.includes("ZeroGPU")) msg += " — vul een HF token in voor meer quota.";
    setStatus("Fout: " + msg, false);
  }
};
