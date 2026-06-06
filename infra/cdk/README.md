# BookFilm Engine — GPU infra (AWS CDK)

TypeScript CDK equivalent of `../terraform`: provisions a GPU EC2 host from the
Deep Learning Base GPU AMI and bootstraps the `engine-services/` compose stack.

## Use
```bash
cd infra/cdk
npm install
# account/region from your AWS profile:
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_REGION=us-east-1
npx cdk bootstrap                       # once per account/region
npx cdk deploy \
  -c engineApiKey=$(openssl rand -hex 24) \
  -c hfToken=YOUR_HF_TOKEN \
  -c engineCidr=203.0.113.4/32          # RESTRICT to your app/worker egress IP
# outputs print the ENGINE_*_URL for server/.env.server
```
Put the same `engineApiKey` as `ENGINE_API_KEY` in `server/.env.server`, add the
`ENGINE_*_URL` outputs, and restart the API + worker.

## Context flags
`engineApiKey` (required), `hfToken`, `instanceType` (default `g5.xlarge`),
`engineCidr` (default `0.0.0.0/0` — restrict!), `sshCidr`, `repoUrl`, `repoBranch`,
`rootVolumeGb` (default 300).

## Notes
- Same caveats as the Terraform stack (`../terraform/README.md`): first boot is
  slow (image build + weight download — watch via SSM Session Manager); **video**
  wants a bigger GPU (deploy a second stack with `-c instanceType=g6e.xlarge`);
  restrict the CIDR / use a private subnet + internal ALB + TLS in production;
  for a private repo, bake images instead of cloning in user-data.
- Secrets are passed via `-c` context here for simplicity. For production, store
  `engineApiKey`/`hfToken` in **Secrets Manager / SSM Parameter Store** and have
  user-data read them at boot instead.
- `npx cdk destroy` when idle to stop GPU billing.
