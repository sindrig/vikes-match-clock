terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "5.52.0"
    }
  }

  backend "s3" {
    encrypt = true
    bucket  = "vikes-misc-tf-state"
    region  = "eu-west-1"
    key     = "vikes-match-clock/access/terraform.tfstate"
  }
}

provider "aws" {
  region = "eu-west-1"
}

locals {
  github_org  = "sindrig"
  github_repo = "vikes-match-clock"
}

module "github_oidc_provider" {
  source  = "terraform-module/github-oidc-provider/aws"
  version = "~> 2.2"

  create_oidc_provider = true
  create_oidc_role     = false # We create roles separately for more control
}

data "aws_iam_policy_document" "github_master_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [module.github_oidc_provider.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${local.github_org}/${local.github_repo}:ref:refs/heads/master"]
    }
  }
}

resource "aws_iam_role" "github_master_deploy" {
  name               = "github-master-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_master_trust.json

  max_session_duration = 3600

  tags = {
    Purpose = "GitHub Actions deployment from master branch"
  }
}

resource "aws_iam_role_policy" "master_tf_state_read" {
  name = "terraform-state-read"
  role = aws_iam_role.github_master_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::vikes-misc-tf-state",
          "arn:aws:s3:::vikes-misc-tf-state/vikes-match-clock/*"
        ]
      }
    ]
  })
}

data "aws_iam_policy_document" "github_staging_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [module.github_oidc_provider.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${local.github_org}/${local.github_repo}:pull_request"]
    }
  }
}

resource "aws_iam_role" "github_staging_deploy" {
  name               = "github-staging-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_staging_trust.json

  max_session_duration = 3600

  tags = {
    Purpose = "GitHub Actions deployment from pull requests"
  }
}

resource "aws_iam_role_policy" "staging_tf_state_read" {
  name = "terraform-state-read"
  role = aws_iam_role.github_staging_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::vikes-misc-tf-state",
          "arn:aws:s3:::vikes-misc-tf-state/vikes-match-clock/*"
        ]
      }
    ]
  })
}

output "oidc_provider_arn" {
  description = "ARN of the GitHub OIDC provider"
  value       = module.github_oidc_provider.oidc_provider_arn
}

output "master_deploy_role_arn" {
  description = "ARN of the IAM role for master branch deployments"
  value       = aws_iam_role.github_master_deploy.arn
}

output "master_deploy_role_name" {
  description = "Name of the IAM role for master branch deployments"
  value       = aws_iam_role.github_master_deploy.name
}

output "staging_deploy_role_arn" {
  description = "ARN of the IAM role for staging (PR) deployments"
  value       = aws_iam_role.github_staging_deploy.arn
}

output "staging_deploy_role_name" {
  description = "Name of the IAM role for staging (PR) deployments"
  value       = aws_iam_role.github_staging_deploy.name
}
