variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "GPU instance type. g5.xlarge (A10G 24GB) for image/voice/music; g6e.xlarge or p4d/p5 for video+LLM."
  type        = string
  default     = "g5.xlarge"
}

variable "ami_id" {
  description = "Override AMI. Empty = latest AWS Deep Learning Base GPU AMI (Ubuntu 22.04, has NVIDIA driver + Docker + nvidia-container-toolkit)."
  type        = string
  default     = ""
}

variable "key_name" {
  description = "Existing EC2 key pair for SSH (optional; Session Manager works without one)."
  type        = string
  default     = ""
}

variable "engine_ports_cidr" {
  description = "CIDR allowed to reach the engine ports (8001-8004). RESTRICT this to your app/worker egress IP in production."
  type        = string
  default     = "0.0.0.0/0"
}

variable "ssh_cidr" {
  description = "CIDR allowed to SSH (22). Empty = no SSH ingress (use SSM Session Manager)."
  type        = string
  default     = ""
}

variable "engine_api_key" {
  description = "Bearer token the services require and the app sends (ENGINE_API_KEY). Use the SAME value in server/.env.server."
  type        = string
  sensitive   = true
}

variable "hf_token" {
  description = "Hugging Face token for gated models (FLUX.1-dev, XTTS). Optional if using open models only."
  type        = string
  sensitive   = true
  default     = ""
}

variable "repo_url" {
  description = "Git URL of the repo containing engine-services/. For a PRIVATE repo, bake images or attach a deploy key instead (see README)."
  type        = string
  default     = "https://github.com/Solarge/bookcinema.git"
}

variable "repo_branch" {
  description = "Branch to deploy."
  type        = string
  default     = "main"
}

variable "root_volume_gb" {
  description = "Root EBS size. Model weights are large (FLUX + XTTS + MusicGen ~50-80GB; add LTX-Video for more)."
  type        = number
  default     = 300
}

variable "tags" {
  description = "Tags applied to all resources."
  type        = map(string)
  default     = { Project = "bookfilm-engine" }
}
