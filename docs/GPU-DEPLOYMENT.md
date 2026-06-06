# BookFilm Engine — GPU Deployment Plan

How to stand up the self-hosted model services that implement the engine HTTP
contract (`docs/ENGINE-SETUP.md`) so the app generates **without third-party AI
APIs**. The app side is already built: each `engine*` adapter is the **primary**
provider with cloud APIs as fallback, and is **inert until its `ENGINE_*_URL` is
set**. This plan is the operator recipe to make those URLs real.

> Principle: deploy one service per modality, each exposing the contract endpoint,
> behind one bearer token, reachable by the worker. Start cheap (image+voice on a
> single GPU), prove quality with the benchmark, then expand.

---

## 1. Topology

```
                       ┌─────────────── GPU host (RunPod/Lambda/Vast) ───────────────┐
worker (BullMQ)  --->  │  image-svc :8001   voice-svc :8002   video-svc :8003        │
  ENGINE_*_URL         │  music-svc :8004   text-svc(vLLM) :8005   score-svc :8006    │
  + ENGINE_API_KEY     └──────────────────────────────────────────────────────────────┘
        │
        └── falls back to cloud APIs only if an engine call errors / URL unset
```

- Each service is an independent container exposing **one HTTP endpoint** (`/generate`, except text = OpenAI-compatible `/v1/chat/completions`, and score = a single POST).
- All sit behind a bearer token (`ENGINE_API_KEY`) and, ideally, a private network or reverse proxy with TLS.
- Results go back as **raw bytes** (simplest) or `{ "url": "…" }`; the worker uploads bytes to S3.

---

## 2. Per-service deployment

| Service | Model (start) | GPU (min) | Serving stack | Endpoint |
| --- | --- | --- | --- | --- |
| **image** | FLUX.1-dev (+ IP-Adapter for `character_ref`) | 1× 24 GB (4090/L40S) | ComfyUI + thin FastAPI wrapper | `POST /generate` |
| **voice** | XTTS-v2 (Coqui, supports `speaker_ref` cloning) | 1× 12–24 GB | FastAPI + `TTS` | `POST /generate` |
| **music** | MusicGen-large or Stable Audio Open | 1× 16–24 GB | FastAPI + `audiocraft`/`diffusers` | `POST /generate` |
| **video** | Wan2.1 / LTX-Video / HunyuanVideo (image→video from the keyframe) | 1× 48–80 GB (A100/H100) | ComfyUI + FastAPI wrapper | `POST /generate` |
| **text** | Llama-3.3-70B / Qwen2.5-72B / DeepSeek (or a 8–14B to start) | 1× 48–80 GB (or 24 GB for small) | **vLLM** (already OpenAI-compatible) | `POST /v1/chat/completions` |
| **score** | CLIP + an aesthetic predictor + ArcFace (identity vs `character_ref`) | shared 12–24 GB | FastAPI | single `POST` |

### Contract per service (must match the adapters exactly)
- **image** `POST {ENGINE_IMAGE_URL}/generate` body `{ prompt, aspect_ratio, quality, character_ref, seed, model }` → image bytes **or** `{url}`.
- **voice** `POST {ENGINE_VOICE_URL}/generate` body `{ text, voice_id, speaker_ref, model }` → audio bytes **or** `{url}`.
- **video** `POST {ENGINE_VIDEO_URL}/generate` body `{ prompt, aspect_ratio, duration, character_ref, model }` → video bytes **or** `{url}`. **No duration cap** — honor `duration` as-is.
- **music** `POST {ENGINE_MUSIC_URL}/generate` body `{ prompt, duration, model }` → audio bytes **or** `{url}`.
- **text** `POST {ENGINE_TEXT_URL}/v1/chat/completions` (standard OpenAI schema; vLLM serves this natively — no wrapper needed). Return `choices[0].message.content`. Honor `response_format: {type:"json_object"}`.
- **score** `POST {ENGINE_SCORE_URL}` body `{ type, prompt, character_ref, mime, data_base64 }` → a JSON number or `{ "score": 0..1 }`. Combine aesthetic + prompt-adherence (CLIP) + identity (ArcFace vs `character_ref` for image/video). Used only when `ENGINE_BEST_OF_N>1`.

All accept `Authorization: Bearer ${ENGINE_API_KEY}` and should 401 on mismatch.

### Two ways to serve image/video
- **Fastest to ship:** ComfyUI (one-click template on RunPod) + a ~50-line FastAPI wrapper that maps the contract body → a saved ComfyUI workflow JSON, submits to `/prompt`, polls `/history`, returns the PNG/MP4 bytes. (Sketch already in `docs/ENGINE-SETUP.md`.)
- **Leaner/production:** a FastAPI app calling `diffusers`/the model lib directly (no ComfyUI), more control over IP-Adapter/LoRA and batching.

---

## 3. Recommended host & sizing

**RunPod** (recommended to start): per-second billing, scale-to-zero serverless for the expensive video/text pods, simple public HTTPS per pod.

Two practical configurations:

- **Phase-0 box (cheap, prove it):** one **24 GB** pod (RTX 4090 ~$0.4–0.7/hr) running **image + voice + music** containers. Enough to generate a full series' images/voices/music in-house.
- **Full engine:** add a **48–80 GB** pod (A100/H100 ~$1.5–3/hr) for **video + text(LLM)**, and put **score** on the 24 GB box. Use **serverless/scale-to-zero** for video so you only pay while rendering.

VRAM rules of thumb: FLUX ~16–20 GB; XTTS ~4–8 GB; MusicGen-large ~8–16 GB; open video models 24–48 GB+; a 70B LLM needs 2× 40 GB or 1× 80 GB (or run a 8–14B on 24 GB to start).

### Deploying on AWS (recommended for production — you're already on S3 there)

The contract is host-agnostic, so AWS works. Because the app's storage (S3) and secrets already live in AWS, deploying the GPU services in the **same account/region/VPC** is a strong production choice. Three options:

- **EC2 GPU instances (simplest — mirrors the RunPod recipe):** run the same Docker containers on
  - `g5.xlarge` (1× A10G, 24 GB) → image / voice / music,
  - `g6e.xlarge` (1× L40S, 48 GB) or `p4d`/`p5` (A100/H100) → video + 70B LLM.
  Reach them over the **private VPC** (no public exposure) or behind an internal ALB; set `ENGINE_*_URL` to those addresses.
- **SageMaker async inference endpoints:** managed hosting that **idles to zero** and queues long jobs — ideal for slow video renders. Wrap each model as a SageMaker container (or front with API Gateway → Lambda to translate the contract). Most AWS-native; scale-to-zero without babysitting instances.
- **ECS/EKS with GPU nodes + cluster autoscaler:** container orchestration if you're already on ECS/EKS.

AWS-specific notes:
- **Quota:** request a Service Quotas increase for the **G/P instance family** (the on-demand vCPU limit is often 0 by default) — do this first, it can take a day.
- **Cost:** AWS GPU is pricier per hour than RunPod/Vast (`g5.xlarge` ≈ $1/hr on-demand; A100/H100 much more). Use **Spot** (~70% cheaper) for interruptible render workers, or scale an Auto Scaling Group **min=0** off BullMQ queue depth. EC2 has **no native scale-to-zero** — that's why SageMaker async (which idles to zero) is attractive for the expensive video/LLM tier.
- **Integration win:** same-region S3 = faster uploads + no egress fees; IAM + private subnets = no public GPU endpoints; one bill, one account.

**Recommendation:** prototype cheaply on RunPod to validate quality/cost, then run production on **AWS EC2 (g5/g6e) or SageMaker async** co-located with your S3/VPC.

---

## 4. Networking & security

- Expose each service on the pod's public HTTPS URL (RunPod gives one per port), or front them with a single reverse proxy (Caddy/Traefik) doing TLS + path routing (`/image`, `/voice`, …).
- **Auth:** generate a strong `ENGINE_API_KEY`; every service validates the bearer header. The adapters already send it when set.
- Lock inbound to the worker's egress IP if the host supports it. Never expose the GPU services unauthenticated.
- Long renders: the worker's BullMQ `lockDuration` is already 600 s; for >10-min video raise `MANAGED`/engine timeout (`ENGINE_TIMEOUT_MS`) and the lock accordingly.

---

## 5. Wire into the app

Set in `server/.env.server` (only the ones you've deployed — the rest stay on cloud fallback):

```
ENGINE_IMAGE_URL=https://<pod>-8001.proxy.runpod.net
ENGINE_VOICE_URL=https://<pod>-8002.proxy.runpod.net
ENGINE_MUSIC_URL=https://<pod>-8004.proxy.runpod.net
ENGINE_VIDEO_URL=https://<pod>-8003.proxy.runpod.net
ENGINE_TEXT_URL=https://<pod>-8005.proxy.runpod.net      # vLLM base (adapter appends /v1/chat/completions)
ENGINE_SCORE_URL=https://<pod>-8006.proxy.runpod.net/score
ENGINE_API_KEY=<long-random-token>
ENGINE_TIMEOUT_MS=900000
# ENGINE_BEST_OF_N=3        # turn on the quality guarantee once a scorer is live
```

Then **restart the API + worker**. To run with **no third-party AI at all**, simply leave the cloud keys (`FALAI_KEY`, `ELEVENLABS_KEY`, …) unset — those providers report not-configured and are skipped, so only the engine serves.

---

## 6. Cost (order-of-magnitude)

- 24 GB pod ≈ **$0.4–0.7/hr**; renders dozens of images / many voice+music clips per hour → per-asset cost ~**10–50× lower** than the cloud APIs at steady volume.
- 80 GB pod (video/LLM) ≈ **$1.5–3/hr**; use **scale-to-zero** so idle time is free.
- Net: high-volume image/voice/music become almost free at the margin; video is the cost driver — keep cloud fallback until in-house video clears the quality gate.

---

## 7. Phased rollout

1. **Phase A — image + voice (1 pod, ~days):** deploy FLUX + XTTS, set the two URLs, restart, generate a real series. Confirm fallback by killing a service.
2. **Phase B — music + text:** add MusicGen + vLLM (LLM). Now text/image/voice/music are fully in-house.
3. **Phase C — character consistency:** wire IP-Adapter (image) + `speaker_ref` (voice) using the `character_ref` the app already passes; add per-character LoRA for leads.
4. **Phase D — video + finishing:** image→video from the consistent keyframe + frame-interpolation + 4K upscale + lip-sync. Gate behind the benchmark.
5. **Phase E — best-of-N on:** deploy the scorer, set `ENGINE_BEST_OF_N=3`, run the benchmark; promote in-house to default per modality only after it wins.

---

## 8. Verification

- **Health:** `curl -H "Authorization: Bearer $KEY" {ENGINE_IMAGE_URL}/generate -d '{"prompt":"a red cube","aspect_ratio":"1:1","quality":"hd","model":"flux.1-dev"}'` returns image bytes.
- **Quality gate:** `cd server && node scripts/engine-benchmark.js` (needs `ENGINE_*_URL` + `ENGINE_SCORE_URL`) — scores engine vs the incumbent on a fixed prompt set and prints a winner per prompt + a promotion verdict.
- **End-to-end:** generate a series in the app with the URLs set; confirm images/voice/music/video appear, character looks consistent across scenes, a custom video duration is honored, and that stopping a GPU service cleanly fails over to the cloud API.
- **Cost check:** compare `UsageLog` / credit burn for a full episode engine-on vs engine-off.

---

## 9. Scaling & ops

- One worker concurrency slot per available GPU stream; raise `MANAGED_MAX_CONCURRENT` only to match real GPU capacity (avoid OOM).
- Autoscale/scale-to-zero the video + LLM pods; keep the 24 GB image/voice pod warm (cold starts hurt UX).
- Monitor GPU util/VRAM/temp + queue depth; alert on engine error-rate (high error-rate = silent fallback to paid cloud = cost spike).
- Keep cloud fallback funded as the reliability backstop until the engine is proven; then optionally remove the cloud keys for full independence.
