# Home GPU datacenter — build list

A shopping + setup list for a home node (or small rack) that can run the **entire
BookFilm Engine** (image/voice/music/video/score + LLM), the **app** (API, worker,
Mongo, Redis, MinIO), **Kubernetes**, and have room to grow. Ordered from "the one
that bites you" (power/cooling) to the rest, then the software stack.

> Reality check: the hard parts of a home datacenter are **electrical capacity,
> heat, and noise** — not the GPUs. A single 4090 pulls ~450 W; four pull ~1.8 kW
> before the rest of the machine. Plan power/cooling first.

---

## 1. Hardware

### GPUs (the core) — pick based on how much runs at once
- **Best price/perf for inference:** **RTX 4090 (24 GB)**. One handles image **or** voice/music/score; running them *all at once* needs more cards.
- **Suggested fleet to run everything concurrently:**
  - 1× 4090 → image (FLUX)
  - 1× 4090 → voice + music + score (lighter, can share)
  - 1× 4090 (or 48 GB) → video (LTX/Wan; 24 GB = short clips, 48 GB = comfortable)
  - 1× **48 GB (RTX A6000 / used A100 40–80 GB)** → the LLM (a 70B quantized to 4-bit ≈ 40 GB; or run an 8–14B on a 4090)
- 4090s have **no NVLink** — for one big model across cards use vLLM tensor-parallel; for separate models just assign one model per GPU.

### Compute (lots of PCIe lanes for multi-GPU)
- **Single/dual GPU:** AMD Ryzen 9 7950X / Intel i9, a board with 2× PCIe x16.
- **3–8 GPUs:** **Threadripper PRO** or **EPYC** (or dual Xeon) — they have the PCIe lanes a consumer board doesn't. Use a server/workstation board with enough x16 slots (or PCIe bifurcation + risers / an open-air frame).

### Memory & storage
- **RAM:** 128 GB minimum; **256 GB ECC** for multi-GPU + Kubernetes + caching.
- **OS/model NVMe:** 2–4 TB Gen4 NVMe (model weights are tens of GB each).
- **Asset/bucket storage:** a few TB more NVMe/SSD, or a separate **NAS/storage node** for the MinIO bucket (generated media). Plan 1–4 TB+.

### Power (the real constraint)
- Budget ~**450 W/4090** + ~250 W system. 4× 4090 ≈ **2.0–2.5 kW** under load.
- A standard 120 V/15 A circuit tops out at ~1.4 kW usable — **2+ GPUs need a 20 A or 240 V circuit**, often a **dedicated breaker**. This is the #1 thing to verify with an electrician.
- **PSU:** Platinum/Titanium. 2× 4090 → 1600 W; 4× 4090 → **dual PSU** (e.g. 2× 1600 W) or a server PSU. Use a PSU-sync adapter for dual PSU.
- **UPS** sized to your load (a big one) for clean shutdown on outage.

### Cooling, chassis, network
- **Cooling:** high-airflow case for 1–2 GPUs; **open-air mining frame** or a **4U GPU server** (e.g. Supermicro) for 3+; blower-style cards pack tighter. The room needs real ventilation/AC — multi-GPU dumps kilowatts of heat.
- **Noise:** loud. Put it in a garage/basement/utility room, not an office.
- **Rack (optional):** a 12–25U rack if you go multi-node.
- **Network:** **10 GbE** switch (model pulls + MinIO traffic), Cat6a; a UPS-backed router.

### Starter vs scale
- **Starter node (~$4–6k):** 2× 4090, Ryzen 9, 128 GB, 2 TB NVMe, 1600 W PSU, airflow case, UPS, 20 A circuit. Runs image+voice+music+score + a small LLM; rent/cloud the video tier.
- **Full node (~$12–20k):** Threadripper PRO, 4× 4090 (or 2× 4090 + 1× A6000), 256 GB ECC, NVMe + NAS, dual PSU, 240 V circuit, 4U chassis/rack, 10 GbE. Runs everything concurrently + Kubernetes.

---

## 2. Software / platform stack

1. **OS:** Ubuntu Server 22.04 LTS on each node.
2. **GPU base:** NVIDIA driver + **NVIDIA Container Toolkit** (see `SETUP-4090.md`).
3. **Kubernetes:** **k3s** (lightweight, ideal for home; one binary) — or full k8s if you prefer.
   - **NVIDIA GPU Operator** — installs the device plugin + DCGM so pods can request GPUs (`nvidia.com/gpu: 1`), with **time-slicing** to share a GPU across low-concurrency pods.
4. **Storage (in-cluster):** **Longhorn** or **Rook/Ceph** for persistent volumes; **MinIO** for S3-compatible object storage (the asset bucket); **MongoDB** (Bitnami chart or a StatefulSet) and **Redis**.
5. **Registry:** **Harbor** (or a plain `registry:2`) to host the engine-services images you build, so the cluster pulls locally.
6. **Ingress + access:** **Traefik**/**ingress-nginx** + **cert-manager** (TLS). For safe external access without exposing your home IP, a **Cloudflare Tunnel** (cloudflared) — also how a cloud-hosted copy of the app reaches the home engine.
7. **Observability:** **Prometheus + Grafana + DCGM-exporter** (GPU util/VRAM/temp), plus node + k8s dashboards. Alert on GPU error-rate and temp.
8. **GitOps (optional):** Argo CD / Flux to deploy from the repo.

---

## 3. How the BookFilm stack maps onto it

Run each as a Kubernetes workload:
- **engine-services** → one **Deployment per model** (image/voice/music/video/score), each with `resources.limits: nvidia.com/gpu: 1` and a `nodeSelector`/affinity pinning it to a specific GPU/node; a Service per one (the app's `ENGINE_*_URL` points at the in-cluster Service DNS, e.g. `http://engine-image:8001`).
- **LLM** → **vLLM** Deployment on the 48 GB card (or tensor-parallel across 2× 4090).
- **app** → API + worker Deployments; **Mongo/Redis** StatefulSets; **MinIO** StatefulSet (swap S3 for MinIO — small `server/utils/s3.js` endpoint change).
- **scaling** → add nodes/GPUs; k8s schedules pods onto free GPUs. Use time-slicing for bursty/low-concurrency services to pack more onto each card.

---

## 4. Phased build (don't buy it all at once)

1. **One 4090 box** (per `SETUP-4090.md`) running the compose — validate quality + the app end-to-end.
2. **Add k3s + GPU Operator** on that box; move the services to Deployments + MinIO/Mongo in-cluster.
3. **Add a 2nd/3rd GPU** (and a 20 A/240 V circuit) → run video + LLM locally; pin models to GPUs.
4. **Add a 2nd node** when one box is full; k8s spans them. Add monitoring + GitOps.
5. **Grow to a rack** only if sustained demand justifies the power/cooling/noise — otherwise burst the heavy/idle-prone tiers (video) to cloud (RunPod/Modal) and keep the steady tiers at home.

---

## 5. Honest constraints
- **Power & heat dominate.** Verify your electrical panel can supply a dedicated 20 A/240 V circuit before buying GPUs; multi-GPU heat needs real room ventilation/AC.
- **70B LLMs** need 2× 48–80 GB or 4-bit quantization across 2× 4090 (vLLM TP). Start with an 8–14B model.
- **Residential limits:** noise, heat, and a single ISP/power feed make true 24/7 SLA hard. For real production, a **colo cage** (rent rack space + power in a datacenter) is the next step up — same software stack, proper power/cooling/network.
- **Cost vs cloud:** owning makes sense at **steady high volume**; for spiky usage, scale-to-zero cloud (Modal/RunPod) is cheaper. Many run a hybrid: steady tiers at home, bursts to cloud.
