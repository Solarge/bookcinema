# BookFilm Engine — GPU model services

Drop-in GPU inference services implementing the engine HTTP contract
(`../docs/ENGINE-SETUP.md`). Each is a standalone FastAPI app + Dockerfile you can
`docker run` on a RunPod pod or an AWS `g5`/`g6e` instance. Point the app's
`ENGINE_*_URL` at these and generation runs on **your** models, with the cloud
APIs as automatic fallback.

| Service | Folder | Model (default, env-overridable) | Port | Contract |
| ------- | ------ | -------------------------------- | ---- | -------- |
| Image   | `image/` | `black-forest-labs/FLUX.1-dev` | 8001 | `POST /generate` → PNG bytes |
| Voice   | `voice/` | Coqui XTTS-v2 | 8002 | `POST /generate` → WAV bytes |
| Music   | `music/` | `facebook/musicgen-large` | 8004 | `POST /generate` → WAV bytes |
| Video   | `video/` | `Lightricks/LTX-Video` | 8003 | `POST /generate` → MP4 bytes |

> Text (LLM) is **not** in this folder — serve it with **vLLM**, which already
> exposes the OpenAI-compatible `/v1/chat/completions` the `engineText` adapter
> calls. See `../docs/GPU-DEPLOYMENT.md`.

**Video tier (heavy):** the `video/` service uses LTX-Video (text→video, and
image→video from a `character_ref` keyframe for consistency). It wants a **larger
GPU (40–80 GB ideal; runs on 24 GB with short clips)** — on a small box, run it on
its **own** host, not alongside image/voice/music. Open video quality trails
Kling/Veo and clips are short (the model has a per-call frame cap; the app stitches
multiple scene clips into longer episodes via its ffmpeg compile step), so **keep
cloud video fallback enabled** until it clears the benchmark/quality gate. Set
`ENGINE_VIDEO_URL` to enable it.

All services:
- Require `Authorization: Bearer $ENGINE_API_KEY` when `ENGINE_API_KEY` is set (the adapters send it automatically).
- Expose `GET /health` (returns `{ "ok": true }`).
- Lazy-load the model on first request and cache it; first call is slow (model download + warm-up).
- Return **raw bytes** with the right `Content-Type` (the simplest contract branch).

---

## Prerequisites (the GPU host)

- An NVIDIA GPU + driver. On a fresh AWS `g5` (Ubuntu): install Docker + the
  **NVIDIA Container Toolkit** so `--gpus all` works. RunPod templates already have this.
- `HF_TOKEN` — a Hugging Face token. **FLUX.1-dev and XTTS are gated/license-accept models**: accept the licenses on huggingface.co and pass the token, or use a non-gated alternative (`ENGINE_IMAGE_MODEL=black-forest-labs/FLUX.1-schnell` is open and faster — set `ENGINE_IMAGE_STEPS=4`).
- `ENGINE_API_KEY` — a long random string; the same value goes in the app's `server/.env.server`.

## Run one service (example: image)

```bash
cd engine-services/image
docker build -t bookfilm-image .
docker run --gpus all -p 8001:8001 \
  -e ENGINE_API_KEY="$ENGINE_API_KEY" \
  -e HF_TOKEN="$HF_TOKEN" \
  -v /models:/models \         # cache weights across restarts
  bookfilm-image
# health:
curl localhost:8001/health
# smoke test:
curl -X POST localhost:8001/generate -H "Authorization: Bearer $ENGINE_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"a red cube on a table, cinematic","aspect_ratio":"1:1","quality":"hd"}' --output out.png
```

## Run all three with compose

```bash
cd engine-services
ENGINE_API_KEY=... HF_TOKEN=... docker compose -f docker-compose.gpu.yml up -d --build
```

## Wire into the app

In `server/.env.server` (only the ones you've deployed; leave cloud keys unset for no-third-party-AI):

```
ENGINE_IMAGE_URL=https://<host>:8001        # or RunPod proxy URL / AWS ALB
ENGINE_VOICE_URL=https://<host>:8002
ENGINE_MUSIC_URL=https://<host>:8004
ENGINE_VIDEO_URL=https://<video-host>:8003  # likely a separate, larger-GPU host
ENGINE_API_KEY=<same token as above>
ENGINE_TIMEOUT_MS=900000
```

Restart the API + worker. Verify with `cd server && node scripts/engine-benchmark.js`
and an end-to-end generation in the app.

## AWS notes

- Use `g5.xlarge` (A10G 24 GB) for these three; deploy in the **same VPC** as the app
  and expose via an **internal** ALB so the GPU endpoints aren't public. Request a
  Service Quota increase for the G instance family first.
- For scale-to-zero on the heavier tiers (video/LLM later), prefer SageMaker async endpoints.

## Roadmap hooks (not yet implemented here)
- **Character consistency**: `image/app.py` accepts `character_ref` and `voice/app.py`
  accepts `speaker_ref` (XTTS voice cloning is wired). FLUX IP-Adapter for `character_ref`
  is left as a clearly-marked TODO — add the IP-Adapter pipeline to lock a character's look.
- **Scoring** (best-of-N): a `score/` service (CLIP + aesthetic + ArcFace) exposing the
  `ENGINE_SCORE_URL` contract comes with Phase E.
