import { Client } from "https://cdn.jsdelivr.net/npm/@gradio/client@1.15.7/dist/index.min.js";

// Pas dit aan als de Space onder een andere naam/user draait.
const SPACE = "JamalDrenthe/video-gen-tool";

const $ = (id) => document.getElementById(id);
$("spaceName").textContent = SPACE;
$("negative").value =
  "Bright tones, overexposed, static, blurred details, subtitles, worst " +
  "quality, low quality, JPEG compression residue, ugly, deformed, " +
  "disfigured, still picture, messy background, walking backwards";

let clientPromise = null;
const getClient = () =>
  (clientPromise ??= Client.connect(SPACE));

$("themeToggle").onclick = () =>
  document.body.classList.toggle("light");

function setStatus(text, busy) {
  $("status").textContent = text;
  $("generate").disabled = busy;
  $("generate").textContent = busy ? "Bezig…" : "Genereer video";
}

$("generate").onclick = async () => {
  const prompt = $("prompt").value.trim();
  if (!prompt) { setStatus("Vul eerst een prompt in.", false); return; }

  const [h, w] = $("size").value.split("x").map(Number);
  try {
    setStatus("Verbinden met Space…", true);
    const client = await getClient();
    setStatus("Video wordt gegenereerd (kan enkele minuten duren)…", true);

    const result = await client.predict("/generate", {
      prompt,
      negative_prompt: $("negative").value,
      reference_image: null,
      height: h,
      width: w,
      num_frames: Number($("frames").value),
      num_inference_steps: Number($("steps").value),
      guidance_scale: Number($("cfg").value),
      seed: Number($("seed").value),
    });

    const file = result.data[0];
    const url = file?.url ?? file?.path ?? file;
    $("video").src = url;
    $("download").href = url;
    $("resultCard").classList.remove("hidden");
    setStatus(`Klaar. Seed: ${result.data[1]}`, false);
  } catch (err) {
    console.error(err);
    setStatus("Fout: " + (err?.message ?? err), false);
  }
};
