"""BookFilm Engine — voice service (Coqui XTTS-v2).

Implements the engine contract: POST /generate -> raw WAV bytes.
- speaker_ref (a URL to a short reference clip) => voice CLONING (per-character voice).
- else voice_id is used as a built-in XTTS speaker name; falls back to a default.
Bearer auth via ENGINE_API_KEY.
"""
import os
import tempfile
import urllib.request

import torch
from fastapi import FastAPI, Header, HTTPException, Response
from pydantic import BaseModel
from TTS.api import TTS

API_KEY = os.environ.get("ENGINE_API_KEY")
MODEL_ID = os.environ.get("ENGINE_VOICE_MODEL", "tts_models/multilingual/multi-dataset/xtts_v2")
DEFAULT_SPEAKER = os.environ.get("ENGINE_VOICE_DEFAULT_SPEAKER", "Claribel Dervla")

app = FastAPI(title="bookfilm-engine-voice")
_tts = None


def tts():
    global _tts
    if _tts is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        # XTTS is license-gated; accepting it programmatically:
        os.environ.setdefault("COQUI_TOS_AGREED", "1")
        _tts = TTS(MODEL_ID).to(device)
    return _tts


def check_auth(authorization):
    if API_KEY and authorization != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="unauthorized")


def _download(url: str) -> str:
    path = tempfile.mktemp(suffix=".wav")
    urllib.request.urlretrieve(url, path)  # noqa: S310 — operator-controlled refs
    return path


class GenReq(BaseModel):
    text: str
    voice_id: str | None = None
    speaker_ref: str | None = None  # URL to a reference clip -> voice cloning
    language: str | None = "en"
    model: str | None = None


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_ID}


@app.post("/generate")
def generate(req: GenReq, authorization: str | None = Header(default=None)):
    check_auth(authorization)
    out = tempfile.mktemp(suffix=".wav")
    kwargs = {"text": req.text, "file_path": out, "language": req.language or "en"}
    if req.speaker_ref:
        kwargs["speaker_wav"] = _download(req.speaker_ref)  # clone this voice
    else:
        kwargs["speaker"] = req.voice_id or DEFAULT_SPEAKER  # built-in speaker
    tts().tts_to_file(**kwargs)
    with open(out, "rb") as f:
        data = f.read()
    return Response(content=data, media_type="audio/wav")
