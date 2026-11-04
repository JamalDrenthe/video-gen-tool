# Video Gen Tool

Genereer video's met **Wan2.1-VACE-14B** — geen Google API meer.

## Onderdelen

- `index.html`, `app.js`, `style.css` — statische frontend (Vercel-deploybaar) die de publieke Space [`linoyts/wan2-1-VACE-fast`](https://huggingface.co/spaces/linoyts/wan2-1-VACE-fast) aanroept als gratis API via `@gradio/client` (`/generate_video`). De Space draait Wan2.1-VACE-14B + FusionX LoRA op ZeroGPU.
- `space/` — optioneel: eigen Gradio Space backend (`app.py` met `WanVACEPipeline`) voor als je een eigen GPU-Space wilt draaien.

## Modi (VACE vereist minimaal 1 beeld)

- **Reference** — animeer vanuit referentie-beelden
- **First - Last Frame** — video tussen twee beelden
- **Random Transitions** — overgangen tussen meerdere beelden

## Eigen Space (optioneel)

1. Maak een Space op huggingface.co (SDK: Gradio), kopieer `space/` als repo-root
2. Kies GPU-hardware in Settings (14B-model: A10G/L40S of ZeroGPU)
3. Zet `SPACE` in `app.js` op jouw Space-slug
