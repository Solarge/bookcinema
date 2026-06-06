# infra/ — GPU infrastructure-as-code

Two interchangeable ways to provision the AWS GPU host that runs the
`../engine-services/` model stack. Pick one (don't run both against the same
resources). Both pair with `../docs/GPU-DEPLOYMENT.md`.

| Folder | Tool | Use it if… |
| ------ | ---- | ---------- |
| [`terraform/`](terraform) | Terraform | you already use Terraform / want a single `apply` |
| [`cdk/`](cdk) | AWS CDK (TypeScript) | you prefer CDK / TS and AWS-native tooling |

Both provision the **same thing**:
- a GPU EC2 instance from the **Deep Learning Base GPU AMI** (NVIDIA driver + Docker + nvidia-container-toolkit),
- a security group for the engine ports (8001–8004),
- an IAM role with **SSM Session Manager**,
- user-data that clones the repo, writes `engine-services/.env`, and runs `docker compose up -d --build`,
- outputs the `ENGINE_*_URL` to paste into `server/.env.server`.

## Recommended split
- **One `g5.xlarge`** for image + voice + music.
- **A second, bigger instance** (`g6e.xlarge` / `p4d` / `p5`) for **video** (and the vLLM text LLM) — deploy a second copy with the larger `instance_type` / `-c instanceType=…`.

## Before you apply
1. Request a **Service Quota** increase for the G/P EC2 family (often 0 by default).
2. Have a **Hugging Face token** (`hf_token`) if using gated models (FLUX.1-dev, XTTS).
3. Choose a strong **`ENGINE_API_KEY`** — the same value goes in `server/.env.server`.
4. **Restrict the ingress CIDR** to your app/worker egress IP (or deploy into the app's VPC on a private subnet behind an internal ALB + TLS).

Tear down with `terraform destroy` / `cdk destroy` when idle — GPU instances bill by the hour.
