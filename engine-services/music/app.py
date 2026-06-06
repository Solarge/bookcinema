"""BookFilm Engine — music service (MusicGen via audiocraft).

Implements the engine contract: POST /generate -> raw WAV bytes.
Model via ENGINE_MUSIC_MODEL (default facebook/musicgen-large). Bearer auth via
ENGINE_API_KEY.
"""
import os
import tempfile

import torch
from audiocraft.data.audio import audio_write
from audiocraft.models import MusicGen
from fastapi import FastAPI, Header, HTTPException, Response
from pydantic import BaseModel

API_KEY = os.environ.get("ENGINE_API_KEY")
MODEL_ID = os.environ.get("ENGINE_MUSIC_MODEL", "facebook/musicgen-large")
MAX_DURATION = int(os.environ.get("ENGINE_MUSIC_MAX_SECONDS", "120"))

app = FastAPI(title="bookfilm-engine-music")
_model = None


def model():
    global _model
    if _model is None:
        _model = MusicGen.get_pretrained(MODEL_ID)
    return _model


def check_auth(authorization):
    if API_KEY and authorization != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="unauthorized")


class GenReq(BaseModel):
    prompt: str
    duration: float | None = 20
    model: str | None = None


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_ID}


@app.post("/generate")
def generate(req: GenReq, authorization: str | None = Header(default=None)):
    check_auth(authorization)
    duration = max(1, min(int(req.duration or 20), MAX_DURATION))
    m = model()
    m.set_generation_params(duration=duration)
    with torch.no_grad():
        wav = m.generate([req.prompt])  # shape [1, channels, samples]
    stem = tempfile.mktemp()  # audio_write appends the extension
    audio_write(stem, wav[0].cpu(), m.sample_rate, format="wav", strategy="loudness")
    with open(f"{stem}.wav", "rb") as f:
        data = f.read()
    return Response(content=data, media_type="audio/wav")
