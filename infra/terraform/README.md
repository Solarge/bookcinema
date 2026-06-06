# BookFilm Engine — GPU infra (Terraform)

Provisions an AWS GPU EC2 host that bootstraps the `engine-services/` compose
stack (FLUX image, XTTS voice, MusicGen music; LTX-Video if you size up). Pairs
with `../../docs/GPU-DEPLOYMENT.md`. (An equivalent AWS CDK stack lives in
`../cdk`.)

## What it creates
- A GPU EC2 instance from the latest **Deep Learning Base GPU AMI** (NVIDIA driver + Docker + nvidia-container-toolkit preinstalled), **Spot by default** (`use_spot=true`, ~70% cheaper) with a **self-terminate timer** (`auto_shutdown_minutes=60`).
- A security group exposing the engine ports (8001–8004), optional SSH.
- An IAM role with **SSM Session Manager** (shell without SSH).
- User-data that clones the repo, writes `engine-services/.env`, and runs `docker compose up -d --build`.

## Use
```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # fill in engine_api_key, hf_token, restrict CIDRs
terraform init
terraform apply
terraform output engine_env_for_app            # paste these into server/.env.server
```
Then set the same `ENGINE_API_KEY` in `server/.env.server`, add the `ENGINE_*_URL`
from the output, and restart the API + worker.

## Notes & honesty
- **First boot is slow** (10–20 min): it builds the images (torch base + pip deps) and downloads model weights on first request. `terraform apply` returns before the stack is warm — watch via SSM (`Session Manager`) → `docker compose -f /opt/bookfilm/repo/engine-services/docker-compose.gpu.yml logs -f`.
- **Video** wants a bigger GPU (40–80 GB). Run image/voice/music on `g5.xlarge` and video on a **separate** `g6e`/`p4d`/`p5` apply (duplicate this with `instance_type` set and only the video service), or remove the `video` service from the compose on the small box.
- **Security**: restrict `engine_ports_cidr` to your app/worker egress IP (or, better, put the instance in your app's VPC on a private subnet behind an internal ALB and front it with TLS). The raw `http://…:port` outputs are for first-boot testing only.
- **Private repo**: `repo_url` defaults to the public clone. If your repo is private, bake the images and `docker pull` them in user-data, or attach a deploy key — don't put credentials in user-data.
- **Cost / lifecycle**: defaults to **Spot** (`use_spot=true`) and **self-terminates** ~`auto_shutdown_minutes` (60) after the build — so a test run cleans itself up. The timer starts after the docker build (10–20 min), so 60 means ~1 hour of warm runtime; raise it if you need longer. Because shutdown-behavior is `terminate`, the instance and its root EBS are deleted (no lingering cost). Still run `terraform destroy` afterward to remove the SG/IAM/role. Set `use_spot=false` for on-demand (no interruption risk) and `auto_shutdown_minutes=0` to keep it running.
- **GPU quota**: request a Service Quotas increase for the G/P instance family first (default is often 0).
