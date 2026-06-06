# BookFilm Engine — cheap / non-AWS deployment

AWS is the priciest GPU option. The `engine-services/` are just Docker containers
exposing the HTTP contract (`ENGINE-SETUP.md`), so they run on **any** GPU host —
you only point the app's `ENGINE_*_URL` at wherever they live. None of the paths
below need the Terraform/CDK (that's AWS-only); you launch a GPU box and run the
compose.

## Cost cheat-sheet (approx)

| Host | RTX 4090 (24GB) | A100 80GB | Best for |
| ---- | --------------- | --------- | -------- |
| **Own GPU** | ~$1.5–2k once, then ~$0.15/hr power | — | cheapest at steady volume; full independence |
| **Vast.ai** | ~$0.20–0.40/hr | ~$0.8–1.5/hr | absolute cheapest cloud (community hosts; reliability varies) |
| **RunPod** | ~$0.34–0.69/hr | ~$1.2–1.9/hr | cheap + reliable + serverless scale-to-zero |
| **Modal** | serverless | pay only while running | bursty jobs — idle cost ≈ $0 |
| **AWS g5** | ~$1/hr (~$0.35 spot) | p4d ~$3–4/hr/GPU | only if you want it next to your S3 |

**Two biggest levers:** (1) **scale-to-zero** (RunPod Serverless / Modal) — pay only
while a generation runs; for a few movies a day this beats any always-on box.
(2) **owning a 4090** — image/voice/music/score for ~the cost of electricity.

---

## Option A — Local / owned GPU box (cheapest, most independent)

Best for an RTX 3090/4090 (24GB) you own. Handles image/voice/music/score well;
video wants more VRAM (rent a bigger GPU just for that, or accept short clips).

```bash
# One-time host setup (Ubuntu): Docker + NVIDIA Container Toolkit
#   https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
git clone https://github.com/Solarge/bookcinema.git && cd bookcinema/engine-services
ENGINE_API_KEY=$(openssl rand -hex 24) HF_TOKEN=... \
  docker compose -f docker-compose.gpu.yml up -d --build
```

Wiring `server/.env.server`:
- **App runs on the same machine** → `ENGINE_IMAGE_URL=http://localhost:8001`, etc.
- **App runs elsewhere (e.g. a cloud server)** → expose the box with a tunnel so it's
  reachable without opening your home network:
  ```bash
  # Cloudflare Tunnel (free) — one per service, or one tunnel with path routing
  cloudflared tunnel --url http://localhost:8001   # gives an https URL → ENGINE_IMAGE_URL
  ```
  (ngrok works too.) Always keep `ENGINE_API_KEY` set so the tunnel endpoint is authed.

Fully self-hosted bonus: pair this with **MinIO** (S3-compatible) + self-hosted Mongo
to drop AWS entirely (small `server/utils/s3.js` endpoint tweak — see GPU-DEPLOYMENT.md).

---

## Option B — RunPod pod (cheap + reliable, ~5 min)

1. Create a **GPU Pod** from a PyTorch/CUDA template (RunPod templates ship Docker +
   NVIDIA toolkit). Pick a 4090 (image/voice/music) or A100/L40S (add video). Expose
   TCP ports **8001–8004, 8006**.
2. In the pod's web terminal:
   ```bash
   git clone https://github.com/Solarge/bookcinema.git && cd bookcinema/engine-services
   ENGINE_API_KEY=... HF_TOKEN=... docker compose -f docker-compose.gpu.yml up -d --build
   ```
3. Use the pod's **public proxy URLs** (RunPod gives `https://<id>-8001.proxy.runpod.net`)
   as the `ENGINE_*_URL` values in `server/.env.server`.

## Option C — Vast.ai (absolute cheapest)

Rent a 4090 instance with a Docker/CUDA image, SSH in, run the same clone + compose,
and expose the ports (Vast maps them to a public host:port). Cheapest hourly; host
reliability varies, so it's best for experimentation and batch renders rather than a
24/7 production endpoint.

## Option D — Serverless / scale-to-zero (lowest cost for bursty use)

**RunPod Serverless** or **Modal** bill per-second only while a request runs, so idle
cost is ~$0 — ideal if you generate intermittently. This needs more work than the
compose: wrap each model as the platform's handler (Modal = a Python function per
model; RunPod Serverless = a handler implementing the same `/generate` contract).
Worth it once usage is spiky-but-real; start with a pod/local box to validate, then
move the heavy/idle-prone tiers (video, LLM) to serverless.

---

## Picking one
- **Have/will buy a 4090** → Option A. Cheapest, most independent.
- **Want cheap + reliable cloud, no commitment** → Option B (RunPod).
- **Want the lowest hourly to experiment** → Option C (Vast.ai).
- **Spiky usage, hate paying for idle** → Option D (Modal / RunPod Serverless).

In every case: set `ENGINE_API_KEY` (auth), point `ENGINE_*_URL` at the host, restart
the app's API + worker, and leave the cloud provider keys unset to run with zero
third-party AI. The cloud APIs stay available as fallback only if you configure them.
