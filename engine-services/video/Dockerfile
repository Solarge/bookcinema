# LTX-Video service. ffmpeg for mp4 export. Wants a larger GPU (40-80GB ideal;
# runs on 24GB with offload + short clips).
FROM pytorch/pytorch:2.4.1-cuda12.1-cudnn9-runtime

WORKDIR /app
ENV HF_HOME=/models \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 8003
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8003"]
