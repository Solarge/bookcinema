"""BookFilm Engine — scoring service (powers the best-of-N quality guarantee).

Implements the scorer contract that server/generation/scoring.js calls:
  POST {ENGINE_SCORE_URL}  body { type, prompt, character_ref, mime, data_base64 }
  -> { "score": <number 0..1> }

For image/video candidates it combines:
  - prompt adherence  (CLIP image<->text cosine)
  - aesthetic proxy   (CLIP vs "high quality / cinematic" minus "blurry / low quality")
  - identity match    (ArcFace cosine vs character_ref) — only when a face + ref exist
Audio (voice/music) has no strong open scorer here -> returns NEUTRAL (0.5); plug a
CLAP model in later. Best-of-N only *ranks* candidates, so monotonic scores suffice.

Bearer auth via ENGINE_API_KEY. Models lazy-load; identity is optional (degrades
gracefully if insightface/onnxruntime isn't available).
"""
import base64
import io
import os
import tempfile

import numpy as np
import requests
import torch
from fastapi import FastAPI, Header, HTTPException
from PIL import Image
from pydantic import BaseModel

API_KEY = os.environ.get("ENGINE_API_KEY")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
NEUTRAL = 0.5

# Weights when identity is available vs not (renormalized).
W_WITH_ID = {"prompt": 0.35, "aesthetic": 0.25, "identity": 0.40}
W_NO_ID = {"prompt": 0.55, "aesthetic": 0.45}

app = FastAPI(title="bookfilm-engine-score")
_clip = None
_face = None


def clip():
    global _clip
    if _clip is None:
        import open_clip

        model, _, preprocess = open_clip.create_model_and_transforms(
            "ViT-B-32", pretrained="laion2b_s34b_b79k"
        )
        model.eval().to(DEVICE)
        _clip = (model, preprocess, open_clip.get_tokenizer("ViT-B-32"))
    return _clip


def face():
    """Lazy ArcFace (insightface). Returns None if unavailable — identity then skipped."""
    global _face
    if _face is None:
        try:
            from insightface.app import FaceAnalysis

            fa = FaceAnalysis(name="buffalo_l")
            fa.prepare(ctx_id=0 if DEVICE == "cuda" else -1)
            _face = fa
        except Exception as e:  # noqa: BLE001
            print(f"[score] insightface unavailable, identity scoring disabled: {e}")
            _face = False
    return _face or None


def check_auth(authorization):
    if API_KEY and authorization != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="unauthorized")


def _img_from_bytes(data: bytes, mime: str) -> Image.Image:
    if mime.startswith("video"):
        # Decode a representative frame (~1s in) from the clip.
        import imageio.v2 as imageio

        path = tempfile.mktemp(suffix=".mp4")
        with open(path, "wb") as f:
            f.write(data)
        reader = imageio.get_reader(path)
        try:
            n = reader.count_frames()
            idx = min(max(n // 2, 0), n - 1) if n and n > 0 else 0
        except Exception:  # noqa: BLE001
            idx = 0
        frame = reader.get_data(idx)
        reader.close()
        return Image.fromarray(frame).convert("RGB")
    return Image.open(io.BytesIO(data)).convert("RGB")


def _clip_scores(image: Image.Image, prompt: str):
    model, preprocess, tokenizer = clip()
    with torch.no_grad():
        img_t = preprocess(image).unsqueeze(0).to(DEVICE)
        img_f = model.encode_image(img_t)
        img_f = img_f / img_f.norm(dim=-1, keepdim=True)
        texts = [prompt or "a photo", "a high quality, sharp, professional cinematic photograph",
                 "a blurry, low quality, distorted, ugly image"]
        txt_t = tokenizer(texts).to(DEVICE)
        txt_f = model.encode_text(txt_t)
        txt_f = txt_f / txt_f.norm(dim=-1, keepdim=True)
        sims = (img_f @ txt_f.T).squeeze(0).tolist()  # [prompt, good, bad] cosine in [-1,1]
    prompt_score = max(0.0, min(1.0, (sims[0] + 1) / 2))
    aesthetic = 1 / (1 + np.exp(-8 * (sims[1] - sims[2])))  # sigmoid of good-vs-bad gap
    return prompt_score, float(aesthetic)


def _identity_score(image: Image.Image, character_ref: str) -> float | None:
    fa = face()
    if not fa or not character_ref:
        return None
    try:
        ref_bytes = requests.get(character_ref, timeout=30).content
        ref_img = Image.open(io.BytesIO(ref_bytes)).convert("RGB")
        a = fa.get(np.array(image)[:, :, ::-1])  # RGB->BGR
        b = fa.get(np.array(ref_img)[:, :, ::-1])
        if not a or not b:
            return None
        sim = float(np.dot(a[0].normed_embedding, b[0].normed_embedding))  # [-1,1]
        return max(0.0, min(1.0, (sim + 1) / 2))
    except Exception as e:  # noqa: BLE001
        print(f"[score] identity scoring failed: {e}")
        return None


class ScoreReq(BaseModel):
    type: str
    prompt: str = ""
    character_ref: str | None = None
    mime: str = "application/octet-stream"
    data_base64: str


@app.get("/health")
def health():
    return {"ok": True, "device": DEVICE}


@app.post("/score")
def score(req: ScoreReq, authorization: str | None = Header(default=None)):
    check_auth(authorization)
    if req.type not in ("image", "video"):
        return {"score": NEUTRAL}  # audio/text: no open scorer wired -> neutral
    try:
        data = base64.b64decode(req.data_base64)
        image = _img_from_bytes(data, req.mime)
    except Exception:  # noqa: BLE001
        return {"score": NEUTRAL}

    prompt_score, aesthetic = _clip_scores(image, req.prompt)
    identity = _identity_score(image, req.character_ref) if req.character_ref else None

    if identity is not None:
        w = W_WITH_ID
        total = w["prompt"] * prompt_score + w["aesthetic"] * aesthetic + w["identity"] * identity
    else:
        w = W_NO_ID
        total = w["prompt"] * prompt_score + w["aesthetic"] * aesthetic
    return {
        "score": round(float(max(0.0, min(1.0, total))), 4),
        "components": {"prompt": round(prompt_score, 4), "aesthetic": round(aesthetic, 4),
                       "identity": None if identity is None else round(identity, 4)},
    }
