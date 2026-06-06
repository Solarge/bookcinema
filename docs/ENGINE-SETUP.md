# BookFilm Engine — Self-Hosted Model Setup (Phase 0)

The "BookFilm Engine" lets us serve our **own** models (FLUX for images, XTTS for
voice, with video/music/text to follow) behind the existing managed-provider
registry, using the cloud APIs (Replicate, fal.ai, ElevenLabs, OpenAI, …) only as
automatic fallback.

**Phase 0 = the engine is simply the _primary_ provider with cloud fallback.**
The roadmap below (best-of-N ensemble, auto-scoring, quality gate,
character-consistency) comes next.

## Inert-until-configured (zero behavior change)

The engine adapters (`server/generation/providers/engineImage.js`,
`engineVoice.js`) are **inert** until their endpoint URL is set:

- `isConfigured()` returns `false` unless `ENGINE_IMAGE_URL` / `ENGINE_VOICE_URL`
  is present.
- The worker (`server/worker/processGeneration.js`) walks each tier's ordered
  `providers[]` list and **skips any provider whose `isConfigured()` is false**.
- So with no env set, the engine entries are skipped and generation behaves
  exactly as before — falling straight through to the cloud providers.

## How fallback works

For each image/voice job the worker tries providers in registry order:

```
image.standard:  engine → replicate → stability → falai
image.premium:   engine → falai → replicate
voice.standard:  engine → openai → googletts → elevenlabs
voice.premium:   engine → elevenlabs → openai
```

If `ENGINE_*_URL` is **unset**, the engine entry is skipped (treated as
not-configured). If it **is set but the engine errors/times out**, the worker
fails over to the next (cloud) provider automatically. Credits charged are the
tier's nominal credits regardless of which provider ultimately serves the job.

## Environment variables

| Var                 | Required | Purpose                                                        |
| ------------------- | -------- | -------------------------------------------------------------- |
| `ENGINE_IMAGE_URL`  | no       | Base URL of the self-hosted image endpoint. Enables `engineImage`. |
| `ENGINE_VOICE_URL`  | no       | Base URL of the self-hosted TTS endpoint. Enables `engineVoice`.   |
| `ENGINE_VIDEO_URL`  | no       | Future — video endpoint (same contract shape).                 |
| `ENGINE_MUSIC_URL`  | no       | Future — music endpoint (same contract shape).                 |
| `ENGINE_TEXT_URL`   | no       | Future — text/LLM endpoint (same contract shape).              |
| `ENGINE_API_KEY`    | no       | Optional bearer token. Sent as `Authorization: Bearer …` only when set. |
| `ENGINE_TIMEOUT_MS` | no       | Per-request timeout in ms (default `600000` = 10 min).         |

None are required — the server boots without them, and they are surfaced on
`config.engine` for visibility only (the adapters read `process.env` directly).

## HTTP contract

Each endpoint must implement a single `POST {BASE_URL}/generate` route.

### Image — `POST {ENGINE_IMAGE_URL}/generate`

Request body (JSON):

```json
{
  "prompt": "string",
  "aspect_ratio": "9:16 | 16:9 | 1:1",
  "quality": "hd | standard",
  "character_ref": "string | null",   // reference for character consistency (future)
  "seed": 12345,                        // or null
  "model": "flux.1-dev"
}
```

Response — **either**:

- **Raw image bytes** with a `Content-Type` of `image/png`, `image/jpeg`, or
  `image/webp` (the adapter derives mime + extension from the header; defaults to
  `image/png`), **or**
- **JSON** `{ "url": "https://…" }` with `Content-Type: application/json` — the
  adapter then downloads the URL and uses *its* `Content-Type` for mime/ext.

### Voice — `POST {ENGINE_VOICE_URL}/generate`

Request body (JSON):

```json
{
  "text": "string",
  "voice_id": "string | null",   // catalog voice id
  "speaker_ref": "string | null", // reference clip for voice cloning (XTTS)
  "model": "xtts-v2"
}
```

Response — **either** raw audio bytes (`audio/mpeg` or `audio/wav`; defaults to
`audio/mpeg`), **or** JSON `{ "url": "https://…" }` which the adapter downloads.

### Future endpoints

`ENGINE_VIDEO_URL`, `ENGINE_MUSIC_URL`, and `ENGINE_TEXT_URL` will follow the
**same shape**: `POST {BASE}/generate` with a JSON body and a raw-bytes-or-`{url}`
response. Adapters for them are not wired yet.

## Standing up a GPU pod

Rent a GPU pod (RunPod, Lambda, Vast.ai — an RTX 4090 / A6000 / L40S is plenty
for FLUX + XTTS) and expose the two `/generate` endpoints above.

### Image — FLUX via ComfyUI

1. Launch a ComfyUI image (most providers have a one-click ComfyUI template) and
   download a FLUX model (e.g. `flux.1-dev`) into `models/unet`.
2. Put a thin FastAPI/Express wrapper in front of ComfyUI's `/prompt` API that:
   - accepts the image contract body,
   - maps `aspect_ratio`/`quality` to the workflow's width/height/steps,
   - submits the workflow, polls until the image is ready,
   - returns the raw PNG bytes (set `Content-Type: image/png`) **or** `{ url }`.
3. Expose the pod's public HTTP URL and set `ENGINE_IMAGE_URL` to it.

### Voice — XTTS via a FastAPI wrapper

1. `pip install TTS` (Coqui XTTS v2) on the pod.
2. A small FastAPI app:

   ```python
   from fastapi import FastAPI, Response
   from pydantic import BaseModel
   from TTS.api import TTS

   tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to("cuda")
   app = FastAPI()

   class Req(BaseModel):
       text: str
       voice_id: str | None = None
       speaker_ref: str | None = None
       model: str | None = None

   @app.post("/generate")
   def generate(r: Req):
       wav_path = "/tmp/out.wav"
       tts.tts_to_file(text=r.text, file_path=wav_path,
                       speaker_wav=r.speaker_ref, language="en")
       return Response(open(wav_path, "rb").read(), media_type="audio/wav")
   ```

3. Expose the pod URL and set `ENGINE_VOICE_URL` to it.

### Securing the pod

Set `ENGINE_API_KEY` and have the wrapper reject requests whose
`Authorization: Bearer …` header doesn't match. The adapters send that header
only when `ENGINE_API_KEY` is set.

## Roadmap (next phases)

Phase 0 ships the engine as the **primary provider with cloud fallback** only.
Planned follow-ups, per the approved plan:

- **Best-of-N ensemble** — generate N candidates per asset and pick the best.
- **Auto-scoring + quality gate** — score candidates (aesthetic/prompt-adherence)
  and reject/regenerate below a threshold before charging credits.
- **Character consistency** — use `character_ref` / `speaker_ref` to lock a
  character's look and voice across every scene and episode.
