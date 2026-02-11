terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.28"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.0"
    }
  }

  backend "s3" {
    encrypt = true
    bucket  = "vikes-misc-tf-state"
    region  = "eu-west-1"
    key     = "vikes-match-clock/terraform.tfstate"
  }
}

provider "aws" {
  region = "eu-west-1"
}

provider "aws" {
  region = "us-east-1"
  alias  = "us"
}

data "terraform_remote_state" "access" {
  backend = "s3"
  config = {
    bucket = "vikes-misc-tf-state"
    key    = "vikes-match-clock/access/terraform.tfstate"
    region = "eu-west-1"
  }
}

module "web" {
  source = "../modules/web"

  providers = {
    aws    = aws
    aws.us = aws.us
  }

  stage            = "prod"
  frontend_domain  = "klukka.irdn.is"
  api_domain       = "clock-api.irdn.is"
  deploy_role_name = data.terraform_remote_state.access.outputs.master_deploy_role_name
}

output "deploy_role_arn" {
  value = data.terraform_remote_state.access.outputs.master_deploy_role_arn
}

output "frontend_bucket" {
  value = module.web.frontend_bucket
}

output "cloudfront_distribution_id" {
  value = module.web.cloudfront_distribution_id
}

output "api_endpoint" {
  value = module.web.api_endpoint
}
