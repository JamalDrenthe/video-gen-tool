# Video Gen Tool

Genereer video's met **Wan2.1-VACE-14B** via een Hugging Face Space — geen Google API meer.

## Onderdelen

- `index.html`, `app.js`, `style.css` — statische frontend (Vercel-deploybaar) die de Space aanroept via `@gradio/client`
- `space/` — Gradio Space backend (`app.py`) met `WanVACEPipeline` op GPU-hardware

## Space deployen

1. Maak een Space op huggingface.co (SDK: Gradio), bijv. `JamalDrenthe/video-gen-tool`
2. Push `space/` als de Space-repo root: `git clone https://huggingface.co/spaces/JamalDrenthe/video-gen-tool` en kopieer de bestanden
3. Kies GPU-hardware in Space Settings (14B-model: A10G/L40S of ZeroGPU aanbevolen)
4. Pas `SPACE` in `app.js` aan als de naam anders is
