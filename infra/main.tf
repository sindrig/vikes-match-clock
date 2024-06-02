terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "5.52.0"
    }
  }
}

provider "aws" {
  region = "eu-west-1"
}

provider "aws" {
  region = "us-east-1"
  alias  = "us"
}


terraform {
  backend "s3" {
    encrypt = true
    bucket  = "vikes-misc-tf-state"
    region  = "eu-west-1"
    key     = "vikes-match-clock/terraform.tfstate"
  }
}

data "aws_ssm_parameter" "pat" {
  name = "/github/terraform/personal-access-token"
}

provider "github" {
  token = data.aws_ssm_parameter.pat.value
}
