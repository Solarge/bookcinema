terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

# Latest AWS Deep Learning Base GPU AMI (Ubuntu 22.04) — ships NVIDIA driver,
# Docker, and the NVIDIA Container Toolkit, so `docker --gpus` works out of the box.
data "aws_ami" "dlami" {
  count       = var.ami_id == "" ? 1 : 0
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["Deep Learning Base OSS Nvidia Driver GPU AMI (Ubuntu 22.04)*"]
  }
  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

locals {
  ami_id = var.ami_id != "" ? var.ami_id : data.aws_ami.dlami[0].id
}

resource "aws_security_group" "engine" {
  name        = "bookfilm-engine"
  description = "BookFilm Engine GPU services"
  vpc_id      = data.aws_vpc.default.id
  tags        = var.tags

  # Engine service ports (image 8001, voice 8002, video 8003, music 8004)
  ingress {
    description = "Engine services"
    from_port   = 8001
    to_port     = 8004
    protocol    = "tcp"
    cidr_blocks = [var.engine_ports_cidr]
  }

  dynamic "ingress" {
    for_each = var.ssh_cidr == "" ? [] : [var.ssh_cidr]
    content {
      description = "SSH"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = [ingress.value]
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Instance role — enables SSM Session Manager (shell without SSH) and CloudWatch.
resource "aws_iam_role" "engine" {
  name = "bookfilm-engine-ec2"
  tags = var.tags
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.engine.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "engine" {
  name = "bookfilm-engine-ec2"
  role = aws_iam_role.engine.name
  tags = var.tags
}

resource "aws_instance" "engine" {
  ami                         = local.ami_id
  instance_type               = var.instance_type
  key_name                    = var.key_name == "" ? null : var.key_name
  subnet_id                   = tolist(data.aws_subnets.default.ids)[0]
  vpc_security_group_ids      = [aws_security_group.engine.id]
  iam_instance_profile        = aws_iam_instance_profile.engine.name
  associate_public_ip_address = true

  # When user-data runs `shutdown -h`, terminate (not just stop) so nothing keeps
  # billing — the root EBS is deleted on terminate by default. Required for the
  # "run for N minutes then self-destruct" flow.
  instance_initiated_shutdown_behavior = "terminate"

  # Spot for ~70% cheaper, one-time request (no respawn). Set use_spot=false for on-demand.
  dynamic "instance_market_options" {
    for_each = var.use_spot ? [1] : []
    content {
      market_type = "spot"
      spot_options {
        spot_instance_type             = "one-time"
        instance_interruption_behavior = "terminate"
        max_price                      = var.spot_max_price != "" ? var.spot_max_price : null
      }
    }
  }

  root_block_device {
    volume_size = var.root_volume_gb
    volume_type = "gp3"
  }

  user_data = templatefile("${path.module}/user-data.sh", {
    repo_url              = var.repo_url
    repo_branch           = var.repo_branch
    engine_api_key        = var.engine_api_key
    hf_token              = var.hf_token
    auto_shutdown_minutes = var.auto_shutdown_minutes
  })

  tags = merge(var.tags, { Name = "bookfilm-engine" })
}
