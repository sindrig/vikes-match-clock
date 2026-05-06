terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.28"
    }
    local = {
      source  = "hashicorp/local"
      version = ">= 2.0"
    }
    null = {
      source  = "hashicorp/null"
      version = ">= 3.0"
    }
  }

  backend "s3" {
    encrypt = true
    bucket  = "vikes-misc-tf-state"
    region  = "eu-west-1"
    key     = "vikes-match-clock/devpod-creds/terraform.tfstate"
  }
}

provider "aws" {
  region = "eu-west-1"
}

data "terraform_remote_state" "staging" {
  backend = "s3"
  config = {
    bucket = "vikes-misc-tf-state"
    key    = "vikes-match-clock/staging/terraform.tfstate"
    region = "eu-west-1"
  }
}

resource "aws_iam_user" "devpod_deploy" {
  name = "vikes-devpod-deploy-staging"
  tags = {
    Purpose   = "Devpod frontend staging deployments"
    ManagedBy = "terraform"
  }
}

resource "aws_iam_access_key" "devpod_deploy" {
  user = aws_iam_user.devpod_deploy.name
}

data "aws_iam_policy_document" "devpod_deploy" {
  statement {
    actions = [
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:GetObject",
      "s3:ListBucket",
      "s3:GetBucketLocation",
    ]
    resources = [
      "arn:aws:s3:::${data.terraform_remote_state.staging.outputs.frontend_bucket}",
      "arn:aws:s3:::${data.terraform_remote_state.staging.outputs.frontend_bucket}/*",
    ]
  }

  statement {
    actions = [
      "cloudfront:CreateInvalidation",
      "cloudfront:GetInvalidation",
      "cloudfront:ListInvalidations",
    ]
    resources = [
      "arn:aws:cloudfront::*:distribution/${data.terraform_remote_state.staging.outputs.cloudfront_distribution_id}",
    ]
  }
}

resource "aws_iam_user_policy" "devpod_deploy" {
  name   = "staging-frontend-deploy"
  user   = aws_iam_user.devpod_deploy.name
  policy = data.aws_iam_policy_document.devpod_deploy.json
}

resource "local_sensitive_file" "devpod_creds" {
  filename = "${path.module}/devpod-creds.txt"
  content  = <<-EOF
    export AWS_ACCESS_KEY_ID="${aws_iam_access_key.devpod_deploy.id}"
    export AWS_SECRET_ACCESS_KEY="${aws_iam_access_key.devpod_deploy.secret}"
    export AWS_DEFAULT_REGION="eu-west-1"
    export STAGING_BUCKET="${data.terraform_remote_state.staging.outputs.frontend_bucket}"
    export CLOUDFRONT_DISTRIBUTION_ID="${data.terraform_remote_state.staging.outputs.cloudfront_distribution_id}"
  EOF
}

resource "null_resource" "provision_devpod_creds" {
  triggers = {
    access_key_id = aws_iam_access_key.devpod_deploy.id
  }

  provisioner "file" {
    source      = local_sensitive_file.devpod_creds.filename
    destination = "/home/dev/vikes-creds.txt"

    connection {
      type = "ssh"
      host = "devpod-sindri"
      user = "dev"
    }
  }
}
