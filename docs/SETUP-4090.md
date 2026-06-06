# Run the BookFilm Engine on an RTX 4090 — step by step

Goal: run the `engine-services/` model stack on your own RTX 4090 (24 GB) and point
the app at it — cheapest, most independent option. Two paths: **native Ubuntu**
(recommended) or **Windows 11 + WSL2** (since the dev box is Windows).

> VRAM reality (24 GB): a 4090 comfortably runs **image (FLUX) + voice (XTTS)**, and
> can add **music + score** with care. **Video (LTX) is tight on 24 GB** — run it
> alone (short clips) or on a bigger GPU. Models load on first request and stay
> resident, so don't keep every service hot at once. See "Fit it in 24 GB" below.

---

## Path A — Ubuntu 22.04 (recommended)

### 1. NVIDIA driver
```bash
sudo apt update
sudo apt install -y ubuntu-drivers-common
sudo ubuntu-drivers autoinstall      # or: sudo apt install -y nvidia-driver-550
sudo reboot
nvidia-smi                           # after reboot: should list "RTX 4090"
```

### 2. Docker
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER        # then log out + back in (or: newgrp docker)
```

### 3. NVIDIA Container Toolkit (lets Docker use the GPU)
```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt update && sudo apt install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### 4. Verify the GPU is visible inside Docker
```bash
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
# should print the 4090 from inside the container
```

Now skip to **"5. Run the services"**.

---

## Path B — Windows 11 + WSL2

The 4090 is on your Windows machine — run the services in WSL2 Ubuntu.

1. **Install the NVIDIA *Windows* driver** (GeForce Game Ready / Studio). This alone
   exposes the GPU to WSL — **do NOT install a Linux NVIDIA driver inside WSL.**
2. In **PowerShell (Admin)**:
   ```powershell
   wsl --install -d Ubuntu-22.04
   ```
   Reboot, finish the Ubuntu user setup.
3. **Inside the WSL Ubuntu shell**, install Docker + the NVIDIA Container Toolkit using
   **steps 2 and 3 from Path A** (skip the driver step — it's already provided by Windows).
   - Alternatively install **Docker Desktop for Windows**, enable the WSL2 backend and
     "Use the WSL 2 based engine"; GPU works out of the box.
4. Verify (in WSL):
   ```bash
   docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
   ```

---

## 5. Run the services

```bash
# (Hugging Face) accept the licenses for gated models on huggingface.co first:
#   black-forest-labs/FLUX.1-dev  and  coqui/XTTS-v2
# OR use the open FLUX.1-schnell (set ENGINE_IMAGE_MODEL below) and skip HF_TOKEN.

git clone https://github.com/Solarge/bookcinema.git
cd bookcinema/engine-services

export ENGINE_API_KEY=$(openssl rand -hex 24)   # save this — the app needs the same value
export HF_TOKEN=hf_xxxxxxxx                      # your Hugging Face token (or omit for open models)

docker compose -f docker-compose.gpu.yml up -d --build
docker compose -f docker-compose.gpu.yml logs -f   # first build + first request download weights — slow
```

### 6. Smoke-test
```bash
curl localhost:8001/health
curl -X POST localhost:8001/generate \
  -H "Authorization: Bearer $ENGINE_API_KEY" -H 'Content-Type: application/json' \
  -d '{"prompt":"a red cube on a table, cinematic","aspect_ratio":"1:1","quality":"hd"}' \
  --output test.png
# test.png should be a real image. Repeat on :8002 (voice), :8004 (music), :8006/score.
```

---

## 7. Point the app at the 4090

Edit `server/.env.server`:

```
ENGINE_IMAGE_URL=http://localhost:8001
ENGINE_VOICE_URL=http://localhost:8002
ENGINE_MUSIC_URL=http://localhost:8004
ENGINE_SCORE_URL=http://localhost:8006/score
# ENGINE_VIDEO_URL=http://localhost:8003     # only if running video (see 24GB note)
ENGINE_API_KEY=<the same token you generated>
ENGINE_TIMEOUT_MS=900000
# ENGINE_BEST_OF_N=3                          # optional: turn on the quality guarantee
```
Restart the API + worker. Generation now runs on your 4090; **leave the cloud keys
(`FALAI_KEY`, `ELEVENLABS_KEY`, …) unset to run with zero third-party AI.**

**If the app runs on a cloud server (not the same machine as the 4090):** expose the
box without opening your home network using a free tunnel —
```bash
cloudflared tunnel --url http://localhost:8001   # gives an https URL → ENGINE_IMAGE_URL
```
(one per service, or one tunnel with path routing). The `ENGINE_API_KEY` keeps the
tunnel endpoint authenticated.

---

## Fit it in 24 GB

FLUX alone is ~16–20 GB and stays resident after the first image, so you can't keep
every model hot on one 4090. Practical setups:

- **Recommended on a single 4090:** run **image + voice** (+ score, which is light).
  Edit `docker-compose.gpu.yml` to comment out the `video` (and maybe `music`) services,
  or only set the `ENGINE_*_URL` for what you're running (unset ones fall back to cloud).
- **Lower FLUX VRAM:** uncomment `enable_model_cpu_offload()` in `engine-services/image/app.py`
  (slower, but frees VRAM so music/score fit alongside).
- **Open, lighter image model:** `ENGINE_IMAGE_MODEL=black-forest-labs/FLUX.1-schnell`
  + `ENGINE_IMAGE_STEPS=4` (no HF token needed, faster, less VRAM).
- **Video:** LTX-Video on 24 GB works only for short clips; for real video use a bigger
  GPU (rent a 48–80 GB box just for the video service) and keep cloud video fallback on.
- Keep the worker's `MANAGED_MAX_CONCURRENT` low (1–2) so jobs don't load two big models
  at once and OOM.

## Troubleshooting
- `could not select device driver "" with capabilities: [[gpu]]` → the Container Toolkit
  step didn't take; re-run `sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker`.
- CUDA OOM → run fewer services, enable FLUX cpu-offload, or lower concurrency (above).
- First request hangs for minutes → it's downloading model weights into the `models`
  volume; subsequent runs are fast. Watch `docker compose logs -f`.
- Gated-model 401 → accept the model license on huggingface.co and set `HF_TOKEN`, or
  switch to the open `FLUX.1-schnell`.
