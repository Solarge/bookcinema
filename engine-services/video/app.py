"""BookFilm Engine — video service (LTX-Video via diffusers).

Implements the engine contract: POST /generate -> raw MP4 bytes.
- character_ref (an image URL) => IMAGE-to-video from that keyframe (character
  consistency: pass the character's reference portrait as the first frame).
- else => text-to-video.
Model via ENGINE_VIDEO_MODEL (default Lightricks/LTX-Video). Bearer auth via
ENGINE_API_KEY.

NOTE: open video models produce SHORT clips (a bounded frame count per call). The
`duration` from the app is honored up to the model's practical max; longer "movies"
come from stitching multiple scene clips in the app's ffmpeg compile step. Quality
trails closed models (Kling/Veo) — keep cloud fallback enabled until it clears the
benchmark/quality gate.
"""
import os
import tempfile

import torch
from diffusers.utils import export_to_video, load_image
from fastapi import FastAPI, Header, HTTPException, Response
from pydantic import BaseModel

API_KEY = os.environ.get("ENGINE_API_KEY")
MODEL_ID = os.environ.get("ENGINE_VIDEO_MODEL", "Lightricks/LTX-Video")
FPS = int(os.environ.get("ENGINE_VIDEO_FPS", "24"))
MAX_FRAMES = int(os.environ.get("ENGINE_VIDEO_MAX_FRAMES", "257"))  # ~10s @ 24fps
STEPS = int(os.environ.get("ENGINE_VIDEO_STEPS", "50"))

# LTX requires width/height as multiples of 32.
DIMS = {"9:16": (704, 1216), "16:9": (1216, 704), "1:1": (960, 960)}

app = FastAPI(title="bookfilm-engine-video")
_t2v = None
_i2v = None


def _round_frames(n: float) -> int:
    # LTX needs num_frames = 8*k + 1; clamp to the model's practical max.
    n = max(9, min(int(n), MAX_FRAMES))
    return ((n - 1) // 8) * 8 + 1


def t2v():
    """Lazy text-to-video pipeline (loaded only if used)."""
    global _t2v
    if _t2v is None:
        from diffusers import LTXPipeline

        _t2v = LTXPipeline.from_pretrained(
            MODEL_ID, torch_dtype=torch.bfloat16, token=os.environ.get("HF_TOKEN")
        ).to("cuda")
    return _t2v


def i2v():
    """Lazy image-to-video pipeline (used when a character_ref keyframe is given)."""
    global _i2v
    if _i2v is None:
        from diffusers import LTXImageToVideoPipeline

        _i2v = LTXImageToVideoPipeline.from_pretrained(
            MODEL_ID, torch_dtype=torch.bfloat16, token=os.environ.get("HF_TOKEN")
        ).to("cuda")
    return _i2v


def check_auth(authorization):
    if API_KEY and authorization != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="unauthorized")


class GenReq(BaseModel):
    prompt: str
    aspect_ratio: str = "9:16"
    duration: float | None = 5
    character_ref: str | None = None  # image URL -> image-to-video keyframe
    model: str | None = None


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_ID}


@app.post("/generate")
def generate(req: GenReq, authorization: str | None = Header(default=None)):
    check_auth(authorization)
    width, height = DIMS.get(req.aspect_ratio, DIMS["9:16"])
    num_frames = _round_frames((req.duration or 5) * FPS)

    with torch.no_grad():
        if req.character_ref:
            keyframe = load_image(req.character_ref)
            result = i2v()(
                image=keyframe,
                prompt=req.prompt,
                width=width,
                height=height,
                num_frames=num_frames,
                num_inference_steps=STEPS,
            )
        else:
            result = t2v()(
                prompt=req.prompt,
                width=width,
                height=height,
                num_frames=num_frames,
                num_inference_steps=STEPS,
            )

    frames = result.frames[0]
    out = tempfile.mktemp(suffix=".mp4")
    export_to_video(frames, out, fps=FPS)
    with open(out, "rb") as f:
        data = f.read()
    return Response(content=data, media_type="video/mp4")
