# JD Video Studio

JD Video Studio is Jamal's video generator and timeline editor. It keeps the original React interface and uses free public Hugging Face Spaces for image and video generation with Wan2.2 and FLUX.

## Functionaliteiten

- Video maken vanuit tekst, een startafbeelding, begin- en eindbeelden of referentiebeelden.
- Modi voor tekst, afbeelding, keyframes, referentie en keyframes met referentie.
- Een bestaande clip verlengen met een nieuwe prompt.
- De timeline-editor gebruiken om clips te ordenen, splitsen en bij te snijden.
- Overgangen en beeldfilters toepassen en een montage exporteren.
- Een eigen soundtrack toevoegen aan de montage.
- Gegenereerde video's in de lokale geschiedenis bewaren.
- De beeldverhouding kiezen tussen 16:9 en 9:16.

## Hugging Face Spaces

| Functie | Space | API |
| --- | --- | --- |
| Tekst naar startbeeld | `black-forest-labs/FLUX.1-schnell` | `/infer` |
| Startbeeld naar video | `zerogpu-aoti/wan2-2-fp8da-aoti-faster` | `/generate_video` |
| Begin- en eindbeeld naar video | `multimodalart/wan-2-2-first-last-frame` | `/generate_video` |

Voor tekstgeneratie maakt FLUX eerst een startbeeld. Wan2.2 maakt daarna de video. Een Hugging Face-token is optioneel. Een token kan meer dagelijkse GPU-quota geven en wordt alleen in de browser opgeslagen.

## Tech stack

- React 19 en TypeScript
- Vite
- `@gradio/client`
- Hugging Face Spaces met Wan2.2 en FLUX

## Lokaal draaien

Vereisten: Node.js en npm.

```bash
npm install
npm run dev
```

Open daarna de lokale URL die Vite toont. Voeg desgewenst een Hugging Face-token toe in de app. Er is geen `.env.local` of Gemini API-sleutel nodig.

## Scripts

| Script | Beschrijving |
| --- | --- |
| `npm run dev` | Start de lokale ontwikkelserver |
| `npm run build` | Bouw de productieversie in `dist/` |
| `npm run preview` | Bekijk lokaal de productiebuild |

## Projectstructuur

```text
.
├── components/                 # Generator, videospeler, editor en bediening
├── services/huggingfaceService.ts
├── space/                      # Optionele eigen Hugging Face Space-backend
├── App.tsx
├── index.html
├── index.tsx
├── metadata.json
├── package.json
├── tsconfig.json
├── types.ts
└── vite.config.ts
```

De map `space/` bevat een optionele eigen Space-backend. De standaardapp gebruikt de publieke Spaces hierboven.

## Deploy via Cloudflare Pages

Maak eerst de productiebuild en deploy daarna de inhoud van `dist/`:

```bash
npm run build
npx wrangler pages deploy dist --project-name=video-gen-tool
```

Voor een previewdeploy kan een branch worden opgegeven met `--branch=<branchnaam>`.
