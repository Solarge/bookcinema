#!/bin/bash
# Bootstraps the BookFilm Engine GPU services on a Deep Learning AMI
# (Docker + NVIDIA Container Toolkit already present).
set -euxo pipefail

APP_DIR=/opt/bookfilm
mkdir -p "$APP_DIR"
cd "$APP_DIR"

# Fetch the repo (engine-services/ lives here). For a PRIVATE repo, replace this
# with your own image pull / deploy-key flow (see README).
if [ ! -d repo ]; then
  git clone --branch "${repo_branch}" "${repo_url}" repo
else
  cd repo && git pull && cd "$APP_DIR"
fi

cd repo/engine-services

# Secrets for the compose stack (docker compose auto-reads ./.env).
cat > .env <<EOF
ENGINE_API_KEY=${engine_api_key}
HF_TOKEN=${hf_token}
EOF
chmod 600 .env

# Build + launch. First build is slow (downloads the torch base image + pip deps);
# first request per service downloads model weights into the /models volume.
docker compose -f docker-compose.gpu.yml up -d --build

echo "BookFilm Engine services started on ports 8001 (image) 8002 (voice) 8003 (video) 8004 (music)."
