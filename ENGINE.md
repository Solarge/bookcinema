# BookFilm Engine — index

The **BookFilm Engine** lets this app generate with our **own** self-hosted models
instead of third-party AI APIs — for cost control, no usage restrictions, character
consistency, and commercialization. It's a **single engine (one product surface)
wrapping a suite of specialist models**, integrated through the existing provider
registry with cloud APIs kept as automatic fallback. Approved strategy:
`~/.claude/plans/` (see the engine plan) / summarized below.

```
PDF → script → images → video → voices → music → mux → finished episode
        │         │         │        │        │
   engineText  engineImage engineVideo engineVoice engineMusic   (primary)
     (vLLM)    (FLUX)      (LTX)      (XTTS)    (MusicGen)
        └────────── cloud APIs as automatic fallback ───────────┘
   best-of-N + score/ pick the best candidate (incl. cloud) → quality guarantee
```

## The pieces (all built + merged)

### In the app (Node) — already wired, **inert until `ENGINE_*_URL` is set**
- **Adapters** — `server/generation/providers/engine{Image,Voice,Video,Music,Text}.js`. Prepended as the **primary** provider in every tier of `server/generation/registry.js`; cloud APIs follow as fallback. `isConfigured()` gates on the env var, so behavior is unchanged until configured.
- **Best-of-N + scoring** — `server/generation/bestOfN.js` + `server/generation/scoring.js`, invoked in `server/worker/processGeneration.js` only when `ENGINE_BEST_OF_N>1` (else identical first-success failover).
- **Character memory** — `server/models/CharacterAsset.js` (canonical reference portrait per character) + `GET /api/assets/:seriesId/characters`; `/generate/image` & `/video` accept `characterRef`/`characterId`.
- **Quality-gate harness** — `server/scripts/engine-benchmark.js` (engine vs incumbent, score-based promotion verdict).

### GPU model services (Python) — `engine-services/`
FastAPI + Dockerfiles implementing the HTTP contract, one per modality:
`image/` (FLUX, 8001), `voice/` (XTTS, 8002), `video/` (LTX, 8003), `music/` (MusicGen, 8004), `score/` (CLIP+ArcFace, 8006), plus a GPU `docker-compose.gpu.yml`. **Text** = serve an open LLM with **vLLM** (already OpenAI-compatible). See `engine-services/README.md`.

### Deploy & infra
- **Contract** the services implement: `docs/ENGINE-SETUP.md`.
- **Deployment plan** (RunPod + AWS, sizing, cost, phasing): `docs/GPU-DEPLOYMENT.md`.
- **Infrastructure-as-code** (provision the GPU host + bootstrap the services): `infra/terraform/` and `infra/cdk/` (equivalent; pick one). Validated on PRs by `.github/workflows/infra.yml`.

## Environment variables (set in `server/.env.server`)

| Var | Purpose |
| --- | --- |
| `ENGINE_IMAGE_URL` / `ENGINE_VOICE_URL` / `ENGINE_VIDEO_URL` / `ENGINE_MUSIC_URL` | enable each modality's in-house adapter |
| `ENGINE_TEXT_URL` | base URL of the vLLM server (adapter appends `/v1/chat/completions`) |
| `ENGINE_SCORE_URL` | scoring service — enables best-of-N candidate scoring |
| `ENGINE_BEST_OF_N` | `>1` turns on the best-of-N quality guarantee (default 1 = off) |
| `ENGINE_API_KEY` | bearer token the services require and the app sends |
| `ENGINE_TIMEOUT_MS` | per-request timeout (default 600000) |

Leave the **cloud** keys (`FALAI_KEY`, `ELEVENLABS_KEY`, …) unset to run with **zero third-party AI** (those providers report not-configured and are skipped).

## Activation checklist (operator)

1. **GPU quota** — request a Service Quotas increase for the AWS G/P EC2 family (or use RunPod).
2. **Provision** — `cd infra/terraform && terraform apply` (or `infra/cdk` → `cdk deploy`). It boots `engine-services` via user-data.
   - Image/voice/music/score on a `g5.xlarge`; **video on a bigger box** (`g6e`/`p4d`).
3. **Wire** — put the output `ENGINE_*_URL` + the same `ENGINE_API_KEY` in `server/.env.server`.
4. **Quality guarantee (optional)** — set `ENGINE_SCORE_URL` + `ENGINE_BEST_OF_N=3`.
5. **Restart** the API + worker. Generation now runs in-house, cloud as fallback.
6. **Verify** — `cd server && node scripts/engine-benchmark.js`, then generate a series in the app; confirm character consistency, a custom video duration, and clean fail-over when a service is stopped.

## Honest caveats
- The Python services are real/runnable but untested without a GPU — expect to pin a `diffusers`/`torch`/`insightface` version for your CUDA build; FLUX.1-dev/XTTS are gated (set `HF_TOKEN`, or use open alternatives).
- **Video** quality trails closed models (Kling/Veo) and clips are short (stitch via the app's compile). That's why best-of-N keeps cloud video as a candidate and we keep cloud fallback until the in-house model clears the benchmark.
- Storage/DB are still AWS S3/Mongo by default; for fully self-hosted infra also swap S3→MinIO (small `server/utils/s3.js` change) and self-host Mongo.
