"""Gradio Space voor Wan2.1-VACE-14B — video-generatie backend voor video-tool.

VACE is een all-in-one video-model: text-to-video werkt zonder conditionering,
met een referentie-afbeelding wordt het image-to-video.
"""
import os
import tempfile

import gradio as gr
import spaces
import torch
from diffusers import AutoencoderKLWan, WanVACEPipeline
from diffusers.schedulers.scheduling_unipc_multistep import UniPCMultistepScheduler
from diffusers.utils import export_to_video, load_image

MODEL_ID = os.environ.get("MODEL_ID", "Wan-AI/Wan2.1-VACE-14B")

vae = AutoencoderKLWan.from_pretrained(MODEL_ID, subfolder="vae", torch_dtype=torch.float32)
pipe = WanVACEPipeline.from_pretrained(MODEL_ID, vae=vae, torch_dtype=torch.bfloat16)
pipe.scheduler = UniPCMultistepScheduler.from_config(
    pipe.scheduler.config, flow_shift=3.0
)
# 14B is groot: houd ongebruikte delen op CPU tussen calls.
pipe.enable_model_cpu_offload()


def _prepare_reference(image, height, width):
    if image is None:
        return None, None
    ref = load_image(image).convert("RGB").resize((width, height))
    # Eén conditionering-frame; VACE vult de rest aan.
    return [ref], [0.0]


@spaces.GPU(duration=300)
def generate(prompt, negative_prompt, reference_image, height, width,
             num_frames, num_inference_steps, guidance_scale, seed):
    height, width, num_frames = int(height), int(width), int(num_frames)
    # Wan vereist num_frames = 4k+1
    num_frames = (num_frames - 1) // 4 * 4 + 1
    seed = int(seed) if seed >= 0 else int.from_bytes(os.urandom(4), "big")

    reference_images, conditioning_mask = _prepare_reference(
        reference_image, height, width
    )

    kwargs = dict(
        prompt=prompt,
        negative_prompt=negative_prompt or None,
        height=height,
        width=width,
        num_frames=num_frames,
        num_inference_steps=int(num_inference_steps),
        guidance_scale=float(guidance_scale),
        generator=torch.Generator(device="cpu").manual_seed(seed),
    )
    if reference_images is not None:
        kwargs["reference_images"] = reference_images
        kwargs["conditioning_scale"] = 1.0
    else:
        kwargs["video"] = None
        kwargs["mask"] = None

    output = pipe(**kwargs).frames[0]
    path = os.path.join(tempfile.mkdtemp(), "video-tool-output.mp4")
    export_to_video(output, path, fps=16)
    return path, seed


DEFAULT_NEGATIVE = (
    "Bright tones, overexposed, static, blurred details, subtitles, style, "
    "works, paintings, images, static, overall gray, worst quality, low "
    "quality, JPEG compression residue, ugly, incomplete, extra fingers, "
    "poorly drawn hands, poorly drawn faces, deformed, disfigured, "
    "misshapen limbs, fused fingers, still picture, messy background, "
    "three legs, many people in the background, walking backwards"
)

with gr.Blocks(title="Video Tool — Wan2.1 VACE") as demo:
    gr.Markdown(
        "# 🎬 Video Tool\n"
        "Text-to-video met **Wan2.1-VACE-14B**. Optioneel: voeg een "
        "referentie-afbeelding toe voor image-to-video."
    )
    with gr.Row():
        with gr.Column():
            prompt = gr.Textbox(
                label="Prompt",
                placeholder="Beschrijf de video die je wilt genereren…",
                lines=3,
            )
            negative = gr.Textbox(
                label="Negatieve prompt", value=DEFAULT_NEGATIVE, lines=3
            )
            ref = gr.Image(
                label="Referentie-afbeelding (optioneel)",
                type="filepath",
            )
            with gr.Row():
                height = gr.Dropdown(
                    [480, 576, 720], value=480, label="Hoogte"
                )
                width = gr.Dropdown(
                    [640, 832, 1024, 1280], value=832, label="Breedte"
                )
                frames = gr.Slider(
                    17, 81, value=49, step=4, label="Frames (4k+1)"
                )
            with gr.Row():
                steps = gr.Slider(10, 50, value=25, step=1, label="Steps")
                cfg = gr.Slider(1.0, 10.0, value=5.0, step=0.5,
                                label="Guidance")
                seed = gr.Number(value=-1, label="Seed (-1 = random)")
            btn = gr.Button("Genereer video", variant="primary")
        with gr.Column():
            video = gr.Video(label="Resultaat")
            used_seed = gr.Number(label="Gebruikte seed", interactive=False)

    btn.click(
        generate,
        inputs=[prompt, negative, ref, height, width, frames, steps, cfg, seed],
        outputs=[video, used_seed],
        api_name="generate",
    )

if __name__ == "__main__":
    demo.queue(max_size=8).launch()
