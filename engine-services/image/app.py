"""BookFilm Engine — image service (FLUX via diffusers).

Implements the engine contract: POST /generate -> raw PNG bytes.
Model is configurable via ENGINE_IMAGE_MODEL (default FLUX.1-dev; use
FLUX.1-schnell for an open, 4-step alternative). Bearer auth via ENGINE_API_KEY.
"""
import io
import os

import torch
from diffusers import FluxPipeline
from fastapi import FastAPI, Header, HTTPException, Response
from pydantic import BaseModel

API_KEY = os.environ.get("ENGINE_API_KEY")
MODEL_ID = os.environ.get("ENGINE_IMAGE_MODEL", "black-forest-labs/FLUX.1-dev")
# FLUX.1-dev ~30 steps; FLUX.1-schnell ~4. Override per model with ENGINE_IMAGE_STEPS.
DEFAULT_STEPS = int(os.environ.get("ENGINE_IMAGE_STEPS", "30"))

# (width, height) ~1MP, the sweet spot for FLUX.
DIMS = {"9:16": (768, 1344), "16:9": (1344, 768), "1:1": (1024, 1024)}
QUALITY_STEPS = {"standard": max(4, DEFAULT_STEPS - 10), "hd": DEFAULT_STEPS, "ultra": DEFAULT_STEPS + 10}

app = FastAPI(title="bookfilm-engine-image")
_pipe = None


def pipe():
    global _pipe
    if _pipe is None:
        _pipe = FluxPipeline.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.bfloat16,
            token=os.environ.get("HF_TOKEN"),
        )
        _pipe.to("cuda")
        # Save VRAM on 24GB cards if needed:
        # _pipe.enable_model_cpu_offload()
    return _pipe


def check_auth(authorization):
    if API_KEY and authorization != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="unauthorized")


class GenReq(BaseModel):
    prompt: str
    aspect_ratio: str = "9:16"
    quality: str = "hd"
    character_ref: str | None = None  # TODO: FLUX IP-Adapter for character consistency
    seed: int | None = None
    model: str | None = None


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_ID}


@app.post("/generate")
def generate(req: GenReq, authorization: str | None = Header(default=None)):
    check_auth(authorization)
    width, height = DIMS.get(req.aspect_ratio, DIMS["9:16"])
    steps = QUALITY_STEPS.get(req.quality, DEFAULT_STEPS)
    generator = (
        torch.Generator("cuda").manual_seed(int(req.seed)) if req.seed is not None else None
    )
    image = pipe()(
        prompt=req.prompt,
        width=width,
        height=height,
        num_inference_steps=steps,
        guidance_scale=3.5,
        generator=generator,
    ).images[0]
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")
