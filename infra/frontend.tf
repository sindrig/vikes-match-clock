data "aws_acm_certificate" "irdn" {
  provider    = aws.us
  domain      = "irdn.is"
  types       = ["AMAZON_ISSUED"]
  most_recent = true
}

module "webpage" {
  source  = "cloudposse/cloudfront-s3-cdn/aws"
  version = "0.59.0"

  namespace         = "vikes"
  stage             = "prod"
  name              = "match-clock"
  aliases           = ["klukka.irdn.is"]
  dns_alias_enabled = true
  parent_zone_name  = "irdn.is"

  acm_certificate_arn = data.aws_acm_certificate.irdn.arn
}

resource "github_actions_secret" "frontend_bucket_secret" {
  repository      = "vikes-match-clock"
  secret_name     = "FRONTEND_BUCKET"
  plaintext_value = module.webpage.s3_bucket
}

resource "github_actions_secret" "frontend_cloudfront_secret" {
  repository      = "vikes-match-clock"
  secret_name     = "CLOUDFRONT_DISTRIBUTION_ID"
  plaintext_value = module.webpage.cf_id
}
