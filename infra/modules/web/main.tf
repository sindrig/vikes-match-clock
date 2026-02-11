terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = ">= 5.0"
      configuration_aliases = [aws, aws.us]
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.0"
    }
  }
}
